import { useState, useRef, useCallback } from 'react';
import type {
  Character,
  MessageNode,
  WorldBookEntry,
  ModelConfig,
  SendTarget,
  SendOptions,
  DistillationResult,
  MessageRole,
  ScribeMode,
  ScribeEngine,
} from '../types';
import { SSEParser } from '../utils/sse';
import { assembleContext, calcWorldBookCooldown } from '../utils/context';
import { generateId } from '../utils/id';
import { SCRIBE_SYSTEM_PROMPT, DEFAULT_TPL_GALGAME_CHAR_INJECTION, DEFAULT_TPL_EAVESDROP_APPEND, DEFAULT_TPL_IMPLANT_MEMORY_PREFIX, DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX, DEFAULT_TPL_DISTILLED_NODE_PREFIX, buildSamplingParams } from '../utils/constants';
import {
  GALGAME_TRIGGER_INTERVAL,
  GALGAME_MAX_TOKENS,
  buildGalgamePrompt,
  cleanDialogueText,
  collectRecentGalgameStates,
  parseGalgameResponse,
} from '../utils/galgameEngine';

/** SSE 流式读取空闲超时：若服务端在 30s 内未发送任何新 chunk，视为已僵死并自动断开 */
import { apiFetch } from '../utils/apiFetch';
const STREAM_IDLE_TIMEOUT_MS = 30_000;

export interface UseChatDeps {
  conversationId: string | null;
  characterA: Character | null;
  characterB: Character | null;
  chatModelId: string | null;
  distillModelId: string | null;
  scribeModelId: string | null;
  scribeEnabled: boolean;
  scribeTriggerInterval: number;
  scribeRounds: number;
  scribeMode: ScribeMode;
  scribeEngine: ScribeEngine;
  galgamePrompt: string;
  thinkingEnabled: boolean;
  scribeSystemPrompt: string;
  recentRounds: number;
  maxDistilledNodes: number;
  maxWorldBookEntries: number;
  autoTriggerDistillation: boolean;
  triggerThreshold: number;
  retainRecentCount: number;
  distillationPrompt: string;
  getModelById: (id: string) => Promise<ModelConfig | undefined>;
  addMessageNode: (node: MessageNode) => Promise<void>;
  updateMessageNode: (id: string, updates: Partial<MessageNode>) => Promise<void>;
  batchUpdateNodes: (
    updates: Array<{ id: string; changes: Partial<MessageNode> }>
  ) => Promise<void>;
  getNodesByConversation: (convId: string) => Promise<MessageNode[]>;
  scanWorldBook: (
    wbId: string | undefined,
    msgs: MessageNode[],
    max: number
  ) => Promise<WorldBookEntry[]>;
  performDistillation: (params: any) => Promise<DistillationResult>;
  updateConversation: (id: string, updates: any) => Promise<void>;
  onNodesRefresh: (nodes: MessageNode[]) => void;
  // 高级提示词模板（空=用默认）
  tplUserWrapper?: string;
  tplOtherCharWrapper?: string;
  tplIdentityAnchor?: string;
  tplWorldBookPrefix?: string;
  tplDistilledPrefix?: string;
  tplStateBookPrefix?: string;
  tplEavesdropAppend?: string;
  tplGalgameCharInjection?: string;
  tplImplantMemoryPrefix?: string;
  tplImplantScribePrefix?: string;
  tplDistilledNodePrefix?: string;
}

export function useChat(deps: UseChatDeps) {
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTarget, setStreamingTarget] = useState<SendTarget | null>(null);
  const [scribeStreaming, setScribeStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [implantMemoryArmed, setImplantMemoryArmed] = useState(false);
  /** 调试用：最近一次发送给角色的完整 messages 数组 */
  const [lastPrompt, setLastPrompt] = useState<{ role: string; content: string }[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 世界书每词条冷却状态：entryId → 上次注入的轮数 */
  const worldBookCooldownRef = useRef<Map<string, number>>(new Map());
  /** 当前对话轮数计数器 */
  const roundCounterRef = useRef<number>(0);

  /**
   * 第三书记员 AI 总结 — 属性化重构后
   * 生成状态书内容后，绑定到指定的 assistant 消息节点的 scribeUpdate 属性
   * 不再创建独立的 scribe 消息节点
   */
  const triggerScribeSummary = useCallback(
    async (recentNodes: MessageNode[], targetAssistantNodeId: string, mode: ScribeMode) => {
      if (!deps.conversationId || !deps.scribeModelId) return;
      if (!deps.scribeEnabled) return;
      if (recentNodes.length === 0) return;

      setScribeStreaming(true);
      try {
        const model = await deps.getModelById(deps.scribeModelId);
        if (!model) throw new Error('状态书模型未找到');

        const sorted = [...recentNodes].sort((a, b) => a.timestamp - b.timestamp);
        const dialogueNodes = sorted.filter(
          (n) => n.role === 'user' || n.role === 'charA' || n.role === 'charB'
        );
        if (dialogueNodes.length === 0) return;

        const scribePrompt = deps.scribeSystemPrompt || SCRIBE_SYSTEM_PROMPT;
        const rounds = Math.max(2, deps.scribeRounds || 4); // 最低 2 轮，默认 4

        // 获取历史状态书（取最近 scribeUpdate 有值的节点，最少 1 个，用于格式继承）
        const previousScribes = sorted
          .filter((n) => (n.role === 'charA' || n.role === 'charB') && n.scribeUpdate?.isEnabled && n.scribeUpdate.rawText?.trim())
          .slice(-rounds); // 数量和对话轮数一致，避免过多

        // 构建 messages: system 开头 → 历史状态书 → 逐轮对话 user → system 结尾
        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        messages.push({ role: 'system', content: scribePrompt });

        // 注入历史状态书（格式继承）
        for (const s of previousScribes) {
          messages.push({ role: 'system', content: `[上一次状态书格式参考]\n${s.scribeUpdate!.rawText}` });
        }

        // 拆分为 N 轮，每轮一条 user 消息
        // 每轮对话 ≈ 2条消息（user消息 + AI回复），但也有可能3条（user + charA + charB）
        // 按消息数均分到 N 组
        const total = dialogueNodes.length;
        const groupSize = Math.max(1, Math.ceil(total / rounds));
        for (let i = 0; i < total; i += groupSize) {
          const chunk = dialogueNodes.slice(i, i + groupSize);
          const chunkText = chunk
            .map((n) => `${n.senderName}: ${n.content}`)
            .join('\n');
          if (chunkText.trim()) {
            messages.push({ role: 'user', content: chunkText });
          }
        }

        // 结尾重复 system prompt，提升执行力
        messages.push({ role: 'system', content: scribePrompt });

        const resp = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages,
            stream: false,
            ...buildSamplingParams(model.temperature, model.topP),
          }),
        });

        if (!resp.ok) throw new Error(`状态书 API 错误: ${resp.status}`);

        const data = await resp.json();
        const newScribeContent = data.choices?.[0]?.message?.content || '';
        const scribeTokenCost = data.usage?.total_tokens || undefined;

        if (newScribeContent.trim()) {
          await deps.updateMessageNode(targetAssistantNodeId, {
            scribeUpdate: {
              rawText: newScribeContent,
              isEnabled: true,
              mode,
            },
            ...(scribeTokenCost !== undefined ? { scribeTokenCost } : {}),
          });

          const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
          deps.onNodesRefresh(updatedNodes);
        }
      } catch (e: any) {
        console.error('状态书总结失败:', e);
      } finally {
        setScribeStreaming(false);
      }
    },
    [deps]
  );

  /**
   * Galgame 数值引擎触发 — 超低消耗，只读最近 2 轮
   * 结果写入 assistant 节点的 galgameData 属性
   *
   * 上下文拼接逻辑（修复"每次随机写思路"问题）：
   *   1) system:    galgame 系统提示词（核心角色与输出格式约束）
   *   2) user:      伪装成"角色卡提示词提醒"——
   *                 "{这是当前角色的角色提示词，状态书请以此角色逻辑判断感情}\n<角色卡 systemPrompt>"
   *                 让 galgame 引擎知道该角色的性格底色，避免脱离角色性格随机推断数值。
   *   3) assistant: 最近 2 次 galgame 状态书（按时间正序，序列化为纯文本），
   *                 让模型能看到上一轮的状态作为基础，避免每轮都从零随机写。
   *                 若无历史状态书，则跳过本段（不插入任何 assistant 占位）。
   *   4) user:      最近 2 轮对话（清洗后的纯文本）作为本次推断输入。
   *
   * 整体开销仅增加约 ~2000 token（角色卡 systemPrompt 平均 1.5k + 2 段状态书 ~250 字），
   * 但效果显著优于"只看 2 轮对话就从零推断"。
   */
  const triggerGalgameEngine = useCallback(
    async (recentNodes: MessageNode[], targetAssistantNodeId: string, charName: string, character?: Character) => {
      if (!deps.conversationId || !deps.scribeModelId) {
        console.log('[Galgame] 跳过: conversationId=%s scribeModelId=%s', deps.conversationId, deps.scribeModelId);
        return;
      }
      if (!deps.scribeEnabled) {
        console.log('[Galgame] 跳过: scribeEnabled=false');
        return;
      }

      console.log('[Galgame] 开始执行, targetNode=%s, charName=%s', targetAssistantNodeId, charName);
      setScribeStreaming(true);
      try {
        const model = await deps.getModelById(deps.scribeModelId);
        if (!model) throw new Error('状态书模型未找到');

        // 只取最近 2 轮，清洗文本
        const sorted = [...recentNodes].sort((a, b) => a.timestamp - b.timestamp);
        const lastTwo = sorted.slice(-4); // 2轮 ≈ 4条消息
        const dialogueText = lastTwo
          .filter((n) => n.role === 'user' || n.role === 'charA' || n.role === 'charB')
          .map((n) => `${n.senderName}: ${cleanDialogueText(n.content)}`)
          .join('\n');

        if (!dialogueText.trim()) {
          console.log('[Galgame] 跳过: 对话文本为空');
          return;
        }

        const prompt = buildGalgamePrompt(charName, deps.galgamePrompt);
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: prompt },
        ];

        // 角色 systemPrompt 作为"伪装 user 消息"注入，让 galgame 引擎知道角色性格底色
        if (character?.systemPrompt?.trim()) {
          const charPromptInjection = (deps.tplGalgameCharInjection || DEFAULT_TPL_GALGAME_CHAR_INJECTION)
          .replace('{charPrompt}', character.systemPrompt.trim());
          messages.push({ role: 'user', content: charPromptInjection });
        }

        // 抓取最近 2 个 galgame 状态书，按时间正序以 assistant 角色注入
        // 让模型看到上一轮状态作为基础，避免"每次从零随机写思路"
        const recentStates = collectRecentGalgameStates(sorted, charName, 2);
        for (const stateText of recentStates) {
          messages.push({ role: 'assistant', content: stateText });
        }

        // 最后追加本次要推断的 2 轮对话作为 user
        messages.push({ role: 'user', content: dialogueText });

        console.log('[Galgame] 发送请求, model=%s, dialogueLength=%d, historyStates=%d, hasCharPrompt=%s',
          model.defaultModel, dialogueText.length, recentStates.length, !!character?.systemPrompt?.trim());

        const resp = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages,
            stream: false,
            max_tokens: GALGAME_MAX_TOKENS,
            temperature: 0.3,
            top_p: 0.85,
          }),
        });

        if (!resp.ok) throw new Error(`Galgame 引擎 API 错误: ${resp.status}`);

        const data = await resp.json();
        // 兼容多种返回格式：标准 OpenAI content / DeepSeek reasoning_content / 直接 text
        // 优先使用 content；若 content 为空（如 GLM-4.7-Flash 思维链模型 finish_reason=length
        // 导致 content 未生成），则尝试从 reasoning_content 中提取 JSON 作为兜底
        const content = data.choices?.[0]?.message?.content || '';
        const reasoning = data.choices?.[0]?.message?.reasoning_content || '';
        const finishReason = data.choices?.[0]?.finish_reason || '';
        const rawContent = content || reasoning || data.choices?.[0]?.text || '';
        console.log('[Galgame] 完整响应: %s', JSON.stringify(data).slice(0, 500));
        console.log('[Galgame] finish_reason=%s, content.len=%d, reasoning.len=%d, rawContent.len=%d',
          finishReason, content.length, reasoning.length, rawContent.length);
        console.log('[Galgame] 原始返回: %s', rawContent.slice(0, 300));
        let galgameData = parseGalgameResponse(rawContent, charName);

        // 如果 content 为空且 reasoning_content 有值但解析失败，
        // 尝试从 reasoning_content 中提取最后一个 JSON 对象（模型可能在推理末尾输出了结果）
        if (!galgameData && !content && reasoning) {
          console.warn('[Galgame] content 为空，尝试从 reasoning_content 提取 JSON');
          galgameData = parseGalgameResponse(reasoning, charName);
        }

        if (galgameData) {
          // 确保 name 使用实际角色名
          if (!galgameData.name || galgameData.name === '未知') {
            galgameData.name = charName;
          }
          // 捕获状态书引擎单独消耗的 token
          const scribeTokenCost = data.usage?.total_tokens || undefined;
          console.log('[Galgame] 解析成功, 写入节点: %s, scribeTokenCost=%s', targetAssistantNodeId, scribeTokenCost);
          await deps.updateMessageNode(targetAssistantNodeId, {
            galgameData,
            ...(scribeTokenCost !== undefined ? { scribeTokenCost } : {}),
          });
          const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
          deps.onNodesRefresh(updatedNodes);
        } else {
          console.warn('[Galgame] 解析失败, rawContent: %s', rawContent);
        }
      } catch (e: any) {
        console.error('Galgame 引擎触发失败:', e);
      } finally {
        setScribeStreaming(false);
      }
    },
    [deps]
  );

  const sendMessage = useCallback(
    async (target: SendTarget, userContent: string, options?: SendOptions) => {
      if (!deps.conversationId || !deps.chatModelId) {
        setError('请先选择对话和聊天模型');
        return;
      }
      const character =
        target.type === 'charA' ? deps.characterA : deps.characterB;
      if (!character) {
        setError('目标角色未设置');
        return;
      }

      // 重新生成场景：跳过植入记忆开关（重试不应再次植入记忆）
      const isRetry = options?.skipUserNode === true && !!options.existingUserNodeId;

      setStreaming(true);
      setStreamingContent('');
      setStreamingTarget(target);
      setError(null);

      const abort = new AbortController();
      abortRef.current = abort;
      let fullContent = '';

      try {
        // 处理"植入记忆&状态书"一次性开关：作为独立 system 消息节点插入
        // 重试场景下跳过此分支（避免重复植入）
        let skipAutoDistilled = false;
        if (implantMemoryArmed && !isRetry) {
          const allNodesBefore = await deps.getNodesByConversation(deps.conversationId);
          const latestDistilled = [...allNodesBefore]
            .filter((n) => n.role === 'distilled')
            .sort((a, b) => b.timestamp - a.timestamp)[0];
          // 查找最近的 scribeUpdate（从 assistant 节点中获取）
          const latestScribeNode = [...allNodesBefore]
            .filter((n) => (n.role === 'charA' || n.role === 'charB') && n.scribeUpdate?.isEnabled)
            .sort((a, b) => b.timestamp - a.timestamp)[0];
          const parts: string[] = [];
          if (latestDistilled) {
            parts.push(
            (deps.tplImplantMemoryPrefix || DEFAULT_TPL_IMPLANT_MEMORY_PREFIX)
              .replace('{content}', latestDistilled.content)
          );
          }
          if (latestScribeNode?.scribeUpdate?.rawText?.trim()) {
            parts.push(
            (deps.tplImplantScribePrefix || DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX)
              .replace('{content}', latestScribeNode.scribeUpdate.rawText)
          );
          }
          if (parts.length > 0) {
            const memoryNode: MessageNode = {
              id: generateId(),
              conversationId: deps.conversationId,
              role: 'system',
              senderName: '记忆结晶',
              content: parts.join('\n\n'),
              isArchived: false,
              timestamp: Date.now(),
              implantedMemory: true,
            };
            await deps.addMessageNode(memoryNode);
            skipAutoDistilled = true;
          }
          setImplantMemoryArmed(false);
        }

        // ── user 节点处理 ──
        // 重试场景：复用既有 user 节点，避免插入重复 user 消息
        // 普通场景：新建 user 节点并写入
        let userNode: MessageNode;
        if (isRetry) {
          // 重新从 DB 读取，确保拿到时间戳准确的真实节点
          const tempNodes = await deps.getNodesByConversation(deps.conversationId);
          const existing = tempNodes.find((n) => n.id === options!.existingUserNodeId);
          if (!existing) {
            throw new Error('重试失败：找不到要复用的 user 节点');
          }
          userNode = existing;
        } else {
          userNode = {
            id: generateId(),
            conversationId: deps.conversationId,
            role: 'user',
            senderName: '你',
            content: userContent,
            isArchived: false,
            timestamp: Date.now(),
            implantedMemory: skipAutoDistilled,
          };
          await deps.addMessageNode(userNode);
        }

        const allNodes = await deps.getNodesByConversation(deps.conversationId);
        const unarchived = allNodes.filter(
          (n) => !n.isArchived && n.role !== 'distilled' && n.role !== 'scribe'
        );
        const distilled = allNodes
          .filter((n) => n.role === 'distilled')
          .slice(-deps.maxDistilledNodes);
        // 重试场景下 userNode 已经在 unarchived 中（复用既有节点），无需再追加；
        // 普通场景下 userNode 刚刚 addMessageNode，已写入 DB，也会出现在 allNodes 里。
        // 但为保留原有行为（保险起见），普通场景仍追加一次。
        const recentForScan = isRetry
          ? unarchived.slice(-deps.recentRounds)
          : [...unarchived, userNode].slice(-deps.recentRounds);
        const recentForContext = recentForScan;

        const wbEntries = await deps.scanWorldBook(
          character.worldBookId,
          recentForScan,
          deps.maxWorldBookEntries
        );

        const model = await deps.getModelById(deps.chatModelId);
        if (!model) throw new Error('聊天模型未找到');

        // 递增轮数计数器
        roundCounterRef.current += 1;
        const currentRound = roundCounterRef.current;

        const targetRole: MessageRole = target.type === 'charB_eavesdrop' ? 'charB' : target.type;

        const assembled = assembleContext({
          character,
          targetRole,
          otherCharName:
            target.type === 'charA'
              ? deps.characterB?.name || '角色B'
              : deps.characterA?.name || '角色A',
          worldbookEntries: wbEntries,
          recentMessages: recentForContext,
          distilledNodes: distilled,
          maxTokens: model.maxContextTokens,
          worldBookCooldown: calcWorldBookCooldown(deps.recentRounds),
          worldBookCooldownState: worldBookCooldownRef.current,
          currentRound,
          skipAutoDistilled,
          tplUserWrapper: deps.tplUserWrapper,
          tplOtherCharWrapper: deps.tplOtherCharWrapper,
          tplIdentityAnchor: deps.tplIdentityAnchor,
          tplWorldBookPrefix: deps.tplWorldBookPrefix,
          tplDistilledPrefix: deps.tplDistilledPrefix,
          tplStateBookPrefix: deps.tplStateBookPrefix,
        });

        // 把上下文元数据回写到用户消息节点
        await deps.updateMessageNode(userNode.id, {
          activatedWorldBookEntries: assembled.metadata.activatedWorldBookEntries,
          tokenEstimate: assembled.metadata.tokenEstimate,
        });

        // 调试用：保存本次发送的完整 messages
        setLastPrompt(assembled.messages.map((m) => ({ role: m.role, content: m.content })));

        const resp = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages: assembled.messages,
            stream: true,
            ...buildSamplingParams(model.temperature, model.topP),
            ...(deps.thinkingEnabled ? { reasoning_effort: 'medium' } : {}),
          }),
          signal: abort.signal,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const reader = resp.body!.getReader();
        const parser = new SSEParser();
        fullContent = '';

        while (true) {
          // 每次 read 前启动一个空闲超时 timer：若服务端 30s 内不发送
          // 任何新 chunk，则 abort 整个 fetch，让 read 抛出 AbortError。
          let idleTimer: ReturnType<typeof setTimeout> | null =
            setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
          const { done, value } = await reader.read();
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (done) break;
          const chunks = parser.parse(value);
          for (const chunk of chunks) {
            if (chunk.done) break;
            fullContent += chunk.content;
            setStreamingContent(fullContent);
          }
        }

        // 计算本消息的 Token 消耗: 优先从 API usage 获取精确值，否则暴力估计
        let tokenCost: number;
        let tokenCostIsExact: boolean;
        let tokenCostInput: number | undefined;
        let tokenCostTotal: number | undefined;
        if (parser.tokenUsage && parser.tokenUsage.completion_tokens > 0) {
          tokenCost = parser.tokenUsage.completion_tokens;
          tokenCostIsExact = true;
          tokenCostInput = parser.tokenUsage.prompt_tokens || undefined;
          tokenCostTotal = parser.tokenUsage.total_tokens || (tokenCostInput ? tokenCostInput + tokenCost : undefined);
        } else {
          tokenCost = Math.ceil(fullContent.length * 0.5);
          tokenCostIsExact = false;
          // 无 API 精确值时，用上下文估算的输入 token
          tokenCostInput = assembled.metadata.tokenEstimate || undefined;
          tokenCostTotal = tokenCostInput ? tokenCostInput + tokenCost : undefined;
        }

        const aiNode: MessageNode = {
          id: generateId(),
          conversationId: deps.conversationId,
          role: target.type === 'charB_eavesdrop' ? 'charB' : target.type,
          senderName: character.name,
          content: fullContent || '(空响应)',
          isArchived: false,
          timestamp: Date.now(),
          tokenCost,
          tokenCostIsExact,
          tokenCostInput,
          tokenCostTotal,
        };
        await deps.addMessageNode(aiNode);

        const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
        deps.onNodesRefresh(updatedNodes);

        // 第三书记员 + 自动蒸馏：串行触发，避免对限速严格的 API（如智谱）触发 429
        // 注意：原本是 fire-and-forget 并发，现在改为单个 async chain 串行
        // — 先 Galgame/scribe，完成后再蒸馏。仍不阻塞主流程返回。
        (async () => {
          // 1. Galgame / 文本状态书
          if (deps.scribeEnabled && deps.scribeModelId) {
            const nonSystemNodes = updatedNodes.filter(
              (n) => n.role !== 'system' && n.role !== 'distilled' && n.role !== 'scribe' && !n.isArchived
            );
            const aiRole = target.type === 'charB_eavesdrop' ? 'charB' : target.type;
            const assistantCount = nonSystemNodes.filter((n) => n.role === aiRole).length;
            const triggerInterval = deps.scribeEngine === 'galgame'
              ? GALGAME_TRIGGER_INTERVAL
              : deps.scribeTriggerInterval;
            const shouldTrigger = triggerInterval > 0 && assistantCount > 0 && assistantCount % triggerInterval === 0;

            console.log('[状态书] engine=%s mode=%s assistantCount=%d interval=%d shouldTrigger=%s scribeModelId=%s',
              deps.scribeEngine, deps.scribeMode, assistantCount, triggerInterval, shouldTrigger, deps.scribeModelId);

            if (shouldTrigger) {
              let shouldRun = false;
              if (deps.scribeMode === 'charA' && aiRole === 'charA') shouldRun = true;
              else if (deps.scribeMode === 'charB' && aiRole === 'charB') shouldRun = true;
              else if (deps.scribeMode === 'auto') shouldRun = true;

              if (shouldRun) {
                if (deps.scribeEngine === 'galgame') {
                  console.log('[Galgame] 触发数值引擎, aiNode=%s, charName=%s', aiNode.id, character.name);
                  await triggerGalgameEngine(
                    nonSystemNodes.slice(-deps.recentRounds),
                    aiNode.id,
                    character.name,
                    character
                  );
                } else {
                  await triggerScribeSummary(
                    nonSystemNodes.slice(-deps.recentRounds),
                    aiNode.id,
                    deps.scribeMode
                  );
                }
              }
            }
          } else {
            console.log('[状态书] 跳过: scribeEnabled=%s scribeModelId=%s', deps.scribeEnabled, deps.scribeModelId);
          }

          // 2. 自动蒸馏（Galgame/scribe 完成后再触发，避免并发）
          if (deps.autoTriggerDistillation && deps.distillModelId) {
            const newUnarchived = updatedNodes
              .filter(
                (n) => !n.isArchived && n.role !== 'distilled' && n.role !== 'system' && n.role !== 'scribe'
              )
              .sort((a, b) => a.timestamp - b.timestamp);
            if (newUnarchived.length >= deps.triggerThreshold) {
              // 滑动窗口：只蒸馏最旧的 (总数 - retainRecentCount) 条，
              // 最近 retainRecentCount 条保持 isArchived: false 作为下一轮即时上下文
              const retain = Math.max(0, deps.retainRecentCount ?? 0);
              const toDistill = newUnarchived.slice(0, newUnarchived.length - retain);
              if (toDistill.length > 0) {
                await deps.performDistillation({
                  nodes: toDistill,
                  distillModelId: deps.distillModelId,
                  distillationPrompt: deps.distillationPrompt,
                  tplDistilledNodePrefix: deps.tplDistilledNodePrefix,
                  getModelById: deps.getModelById,
                  addMessageNode: deps.addMessageNode,
                  batchUpdateNodes: deps.batchUpdateNodes,
                });
              }
            }
          }
        })().catch(console.error);
      } catch (e: any) {
        if (e.name === 'AbortError') {
          if (fullContent.trim()) {
            const partialNode: MessageNode = {
              id: generateId(),
              conversationId: deps.conversationId,
              role: target.type === 'charB_eavesdrop' ? 'charB' : target.type,
              senderName: character.name,
              content: fullContent,
              isArchived: false,
              timestamp: Date.now(),
              tokenCost: Math.ceil(fullContent.length * 0.5),
              tokenCostIsExact: false,
            };
            await deps.addMessageNode(partialNode);
            const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
            deps.onNodesRefresh(updatedNodes);
          }
        } else {
          setError(e.message || '发送失败');
        }
      } finally {
        setStreaming(false);
        setStreamingContent('');
        setStreamingTarget(null);
        abortRef.current = null;
      }
    },
    [deps]
  );

  const triggerEavesdrop = useCallback(async () => {
    if (!deps.conversationId || !deps.chatModelId || !deps.characterB) {
      setError('请先选择对话、聊天模型和角色B');
      return;
    }

    setStreaming(true);
    setStreamingContent('');
    setStreamingTarget({ type: 'charB', characterId: deps.characterB.id });
    setError(null);
    let fullContent = '';

    try {
      const allNodes = await deps.getNodesByConversation(deps.conversationId);
      const unarchived = allNodes
        .filter((n) => !n.isArchived && n.role !== 'distilled' && n.role !== 'scribe')
        .slice(-deps.recentRounds);
      const distilled = allNodes
        .filter((n) => n.role === 'distilled')
        .slice(-deps.maxDistilledNodes);

      const charBWithEavesdrop: Character = {
        ...deps.characterB,
        systemPrompt:
          deps.characterB.systemPrompt +
          (deps.tplEavesdropAppend || DEFAULT_TPL_EAVESDROP_APPEND),
      };

      const wbEntries = await deps.scanWorldBook(
        deps.characterB.worldBookId,
        unarchived,
        deps.maxWorldBookEntries
      );

      const model = await deps.getModelById(deps.chatModelId);
      if (!model) throw new Error('聊天模型未找到');

      roundCounterRef.current += 1;
      const currentRound = roundCounterRef.current;

      const assembled = assembleContext({
        character: charBWithEavesdrop,
        targetRole: 'charB',
        otherCharName: deps.characterA?.name || '角色A',
        worldbookEntries: wbEntries,
        recentMessages: unarchived,
        distilledNodes: distilled,
        maxTokens: model.maxContextTokens,
        worldBookCooldown: calcWorldBookCooldown(deps.recentRounds),
        worldBookCooldownState: worldBookCooldownRef.current,
        currentRound,
        tplUserWrapper: deps.tplUserWrapper,
        tplOtherCharWrapper: deps.tplOtherCharWrapper,
        tplIdentityAnchor: deps.tplIdentityAnchor,
        tplWorldBookPrefix: deps.tplWorldBookPrefix,
        tplDistilledPrefix: deps.tplDistilledPrefix,
        tplStateBookPrefix: deps.tplStateBookPrefix,
      });

      // 调试用：保存本次旁听发送的完整 messages
      setLastPrompt(assembled.messages.map((m) => ({ role: m.role, content: m.content })));

      const abort = new AbortController();
      abortRef.current = abort;

      const resp = await apiFetch(model.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify({
          model: model.defaultModel,
          messages: assembled.messages,
          stream: true,
          ...buildSamplingParams(model.temperature, model.topP),
        }),
        signal: abort.signal,
      });

      if (!resp.ok) throw new Error(`API 错误: ${resp.status}`);

      const reader = resp.body!.getReader();
      const parser = new SSEParser();
      fullContent = '';

      while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | null =
          setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
        const { done, value } = await reader.read();
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (done) break;
        for (const chunk of parser.parse(value)) {
          if (chunk.done) break;
          fullContent += chunk.content;
          setStreamingContent(fullContent);
        }
      }

      let tokenCost: number;
      let tokenCostIsExact: boolean;
      let tokenCostInput: number | undefined;
      let tokenCostTotal: number | undefined;
      if (parser.tokenUsage && parser.tokenUsage.completion_tokens > 0) {
        tokenCost = parser.tokenUsage.completion_tokens;
        tokenCostIsExact = true;
        tokenCostInput = parser.tokenUsage.prompt_tokens || undefined;
        tokenCostTotal = parser.tokenUsage.total_tokens || (tokenCostInput ? tokenCostInput + tokenCost : undefined);
      } else {
        tokenCost = Math.ceil(fullContent.length * 0.5);
        tokenCostIsExact = false;
        tokenCostInput = assembled.metadata.tokenEstimate || undefined;
        tokenCostTotal = tokenCostInput ? tokenCostInput + tokenCost : undefined;
      }

      const node: MessageNode = {
        id: generateId(),
        conversationId: deps.conversationId,
        role: 'charB',
        senderName: deps.characterB.name,
        content: fullContent || '(没说话)',
        isArchived: false,
        timestamp: Date.now(),
        tokenCost,
        tokenCostIsExact,
        tokenCostInput,
        tokenCostTotal,
      };
      await deps.addMessageNode(node);

      const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
      deps.onNodesRefresh(updatedNodes);

      // 旁听也触发状态书（如果模式匹配）— 串行触发避免限速 API 429
      if (deps.scribeEnabled && deps.scribeModelId) {
        const nonSystemNodes = updatedNodes.filter(
          (n) => n.role !== 'system' && n.role !== 'distilled' && n.role !== 'scribe' && !n.isArchived
        );
        // 以角色 B 的 assistant 消息数作为轮数
        const assistantCount = nonSystemNodes.filter((n) => n.role === 'charB').length;
        const triggerInterval = deps.scribeEngine === 'galgame'
          ? GALGAME_TRIGGER_INTERVAL
          : deps.scribeTriggerInterval;
        if (triggerInterval > 0 && assistantCount > 0 && assistantCount % triggerInterval === 0) {
          if (deps.scribeMode === 'charB' || deps.scribeMode === 'auto') {
            if (deps.scribeEngine === 'galgame') {
              await triggerGalgameEngine(
                nonSystemNodes.slice(-deps.recentRounds),
                node.id,
                deps.characterB!.name,
                deps.characterB
              );
            } else {
              await triggerScribeSummary(
                nonSystemNodes.slice(-deps.recentRounds),
                node.id,
                deps.scribeMode
              );
            }
          }
        }
      }
    } catch (e: any) {
        if (e.name === 'AbortError') {
          if (fullContent.trim()) {
            const partialNode: MessageNode = {
              id: generateId(),
              conversationId: deps.conversationId,
              role: 'charB',
              senderName: deps.characterB.name,
              content: fullContent,
              isArchived: false,
              timestamp: Date.now(),
            };
            await deps.addMessageNode(partialNode);
            const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
            deps.onNodesRefresh(updatedNodes);
          }
        } else {
          setError(e.message || '旁听失败');
        }
      } finally {
      setStreaming(false);
      setStreamingContent('');
      setStreamingTarget(null);
      abortRef.current = null;
    }
  }, [deps]);

  const triggerDistillation = useCallback(async () => {
    if (!deps.conversationId || !deps.distillModelId) {
      setError('请先配置蒸馏模型');
      return;
    }
    try {
      const allNodes = await deps.getNodesByConversation(deps.conversationId);
      const unarchived = allNodes
        .filter(
          (n) =>
            !n.isArchived &&
            n.role !== 'distilled' &&
            n.role !== 'system' &&
            n.role !== 'scribe'
        )
        .sort((a, b) => a.timestamp - b.timestamp);
      if (unarchived.length === 0) {
        setError('无可蒸馏的对话');
        return;
      }
      // 滑动窗口：手动蒸馏也保留最近 retainRecentCount 条
      const retain = Math.max(0, deps.retainRecentCount ?? 0);
      const toDistill = unarchived.slice(0, unarchived.length - retain);
      if (toDistill.length === 0) {
        setError(`保留太少消息可用于蒸馏（当前 ${unarchived.length} 条，需保留 ${retain} 条）`);
        return;
      }
      await deps.performDistillation({
        nodes: toDistill,
        distillModelId: deps.distillModelId,
        distillationPrompt: deps.distillationPrompt,
        tplDistilledNodePrefix: deps.tplDistilledNodePrefix,
        getModelById: deps.getModelById,
        addMessageNode: deps.addMessageNode,
        batchUpdateNodes: deps.batchUpdateNodes,
      });
      const updatedNodes = await deps.getNodesByConversation(deps.conversationId);
      deps.onNodesRefresh(updatedNodes);
    } catch (e: any) {
      setError(e.message || '蒸馏失败');
    }
  }, [deps]);

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const armImplantMemory = useCallback(() => {
    setImplantMemoryArmed(true);
  }, []);

  const disarmImplantMemory = useCallback(() => {
    setImplantMemoryArmed(false);
  }, []);

  return {
    streaming,
    streamingContent,
    streamingTarget,
    scribeStreaming,
    error,
    setError,
    sendMessage,
    triggerEavesdrop,
    triggerDistillation,
    triggerScribeSummary,
    triggerGalgameEngine,
    abortStream,
    implantMemoryArmed,
    armImplantMemory,
    disarmImplantMemory,
    lastPrompt,
  };
}
