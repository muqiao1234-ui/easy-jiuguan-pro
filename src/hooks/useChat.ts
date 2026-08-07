import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  Character,
  MessageNode,
  WorldBookEntry,
  ModelConfig,
  SendTarget,
  SendOptions,
  DistillationResult,
  MessageRole,
  MvuOperation,
  ScribeMode,
  ScribeEngine,
  ModuleRpgConfig,
  WorldBook,
  StickerPack,
} from '../types';
import type { DebugSseResponse } from '../types';
import { SSEParser, type TokenUsage } from '../utils/sse';
import { assembleContext } from '../utils/context';
import { generateId } from '../utils/id';
import { filterStreamingReasoningText, stripReasoningBlocks } from '../utils/responseText';
import { SCRIBE_SYSTEM_PROMPT, DEFAULT_TPL_GALGAME_CHAR_INJECTION, DEFAULT_TPL_EAVESDROP_APPEND, DEFAULT_TPL_IMPLANT_MEMORY_PREFIX, DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX, DEFAULT_TPL_DISTILLED_NODE_PREFIX, DEFAULT_TPL_MVU_PROMPT, DEFAULT_TPL_MVU_FALLBACK_PROMPT, buildSamplingParams } from '../utils/constants';
import {
  GALGAME_TRIGGER_INTERVAL,
  GALGAME_MAX_TOKENS,
  buildGalgamePrompt,
  cleanDialogueText,
  collectRecentGalgameStates,
  parseGalgameResponse,
} from '../utils/galgameEngine';
import {
  applyModuleRpgCharacterSlots,
  buildModuleRpgPrompt,
  createModuleRpgSnapshot,
  findLatestModuleRpgData,
  mergeModuleRpgSnapshot,
  parseModuleRpgResponse,
} from '../utils/moduleRpg';
import {
  CACHE_WORLD_BOOK_LIMIT,
  buildCacheWorldBookPrompt,
  extractCacheWorldBookPatch,
  mergeCacheWorldBookEntries,
  normalizeCacheWorldBook,
} from '../utils/cacheWorldBook';
import { planDistillation } from '../utils/distillation';
import * as Stores from '../db/stores';
import { buildStickerPrompt, parseStickerResponse } from '../utils/stickers';
import {
  buildMvuPrompt,
  buildMvuFallbackPrompt,
  createMvuNodeData,
  filterMvuStreamingText,
  getMvuEntryKind,
  getMvuScopeId,
  isMvuControlEntry,
  parseMvuInitBooks,
  parseMvuResponse,
  replayMvuState,
} from '../utils/mvu';

/** SSE 流式读取空闲超时：若服务端在 30s 内未发送任何新 chunk，视为已僵死并自动断开 */
import { apiFetch } from '../utils/apiFetch';
const STREAM_IDLE_TIMEOUT_MS = 30_000;

function shouldRequestStreamUsage(model: ModelConfig): boolean {
  return /deepseek/i.test(`${model.name} ${model.defaultModel} ${model.baseUrl}`);
}

function normalizeTokenUsage(usage: any): TokenUsage | null {
  if (!usage || typeof usage.completion_tokens !== 'number') return null;
  return {
    completion_tokens: usage.completion_tokens,
    prompt_tokens: usage.prompt_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens
      ?? usage.output_tokens_details?.reasoning_tokens
      ?? usage.reasoning_tokens,
  };
}

function createJsonDebugSnapshot(data: any, fullContent: string, usage: TokenUsage | null): DebugSseResponse {
  const message = data?.choices?.[0]?.message || {};
  return {
    format: 'easyjiuguanpro.sse-response-debug.v1',
    transport: 'json',
    capturedAt: Date.now(),
    events: [{
      sequence: 1,
      kind: 'json',
      rawData: JSON.stringify(data),
      data,
    }],
    tokenUsage: usage || undefined,
    finishReason: data?.choices?.[0]?.finish_reason,
    reasoningContent: typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined,
    rawContent: fullContent,
  };
}

interface MvuFallbackResult {
  operations: MvuOperation[];
  diagnostics: string[];
  rawResponse?: unknown;
  content: string;
  reasoningContent?: string;
}

async function requestDeepSeekMvuFallback(model: ModelConfig, prompt: string): Promise<MvuFallbackResult> {
  try {
    const response = await apiFetch(model.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.defaultModel,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Return the JSON operations now.' },
        ],
        stream: false,
        ...buildSamplingParams(0, 1),
      }),
    });
    if (!response.ok) {
      return {
        operations: [],
        diagnostics: [`DeepSeek MVU maintenance fallback failed: HTTP ${response.status}`],
        content: '',
      };
    }

    const rawResponse = await response.json();
    const message = rawResponse?.choices?.[0]?.message || {};
    const content = String(message.content || rawResponse?.choices?.[0]?.text || '').trim();
    const reasoningContent = typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined;
    const direct = parseMvuResponse(content);
    const parsed = direct.operations.length > 0
      ? direct
      : parseMvuResponse(`<JSONPatch>${content}</JSONPatch>`);
    return {
      operations: parsed.operations,
      diagnostics: [
        `DeepSeek MVU maintenance fallback executed: ${parsed.operations.length} operation(s).`,
        ...parsed.diagnostics,
      ],
      rawResponse,
      content,
      reasoningContent,
    };
  } catch (error) {
    return {
      operations: [],
      diagnostics: [`DeepSeek MVU maintenance fallback failed: ${error instanceof Error ? error.message : String(error)}`],
      content: '',
    };
  }
}

function buildWorldBookScanWindow(nodes: MessageNode[], historyUserDepth: number): MessageNode[] {
  const sorted = [...nodes].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  let latestUserIndex = -1;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index].role === 'user') {
      latestUserIndex = index;
      break;
    }
  }
  if (latestUserIndex === -1) return sorted;

  let startIndex = latestUserIndex;
  let remainingHistoryUsers = Math.max(0, historyUserDepth);
  for (let index = latestUserIndex - 1; index >= 0 && remainingHistoryUsers > 0; index -= 1) {
    if (sorted[index].role === 'user') {
      startIndex = index;
      remainingHistoryUsers -= 1;
    }
  }
  return sorted.slice(startIndex);
}

export interface UseChatDeps {
  conversationId: string | null;
  characterA: Character | null;
  characterB: Character | null;
  charAModelId: string | null;
  charBModelId: string | null;
  distillModelId: string | null;
  scribeModelId: string | null;
  scribeEnabled: boolean;
  scribeCacheWorldBookEnabled: boolean;
  mvuEnabled: boolean;
  scribeTriggerInterval: number;
  scribeRounds: number;
  scribeMode: ScribeMode;
  scribeEngine: ScribeEngine;
  galgamePrompt: string;
  moduleRpgConfig: ModuleRpgConfig;
  moduleRpgPrompt: string;
  thinkingEnabled: boolean;
  streamingEnabled: boolean;
  debugMode: boolean;
  stickerEnabled: boolean;
  stickerMaxCount: number;
  stickerPackA?: StickerPack | null;
  stickerPackB?: StickerPack | null;
  scribeSystemPrompt: string;
  recentRounds: number;
  worldBookScanDepth: number;
  maxInjectedMemories: number;
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
  queryNodesByConversation: (
    convId: string,
    query?: Stores.MessageNodeQuery
  ) => Promise<MessageNode[]>;
  countNodesByConversation: (
    convId: string,
    query?: Omit<Stores.MessageNodeQuery, 'order' | 'limit'>
  ) => Promise<number>;
  getMessageNodeById: (id: string) => Promise<MessageNode | undefined>;
  getNodesByConversation: (convId: string) => Promise<MessageNode[]>;
  getMessageNodeMetadataByConversation: (convId: string) => Promise<Stores.MessageNodeMetadata[]>;
  commitDistillationBatch: (sourceIds: string[], distilledNode: MessageNode) => Promise<boolean>;
  scanWorldBook: (
    wbId: string | undefined,
    msgs: MessageNode[],
    max: number
  ) => Promise<WorldBookEntry[]>;
  performDistillation: (params: any) => Promise<DistillationResult>;
  updateConversation: (id: string, updates: any) => Promise<void>;
  onNodesRefresh: (nodes: MessageNode[]) => void;
  onDistillationComplete?: () => void;
  // 高级提示词模板（空=用默认）
  tplUserWrapper?: string;
  tplOtherCharWrapper?: string;
  tplIdentityAnchor?: string;
  tplWorldBookPrefix?: string;
  tplDistilledPrefix?: string;
  tplStateBookPrefix?: string;
  userName?: string;
  userDescription?: string;
  tplEavesdropAppend?: string;
  tplGalgameCharInjection?: string;
  tplImplantMemoryPrefix?: string;
  tplImplantScribePrefix?: string;
  tplDistilledNodePrefix?: string;
  tplCacheWorldBookPrompt?: string;
  tplStickerPrompt?: string;
  tplMvuPrompt?: string;
  tplMvuFallbackPrompt?: string;
}

export function useChat(deps: UseChatDeps) {
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTarget, setStreamingTarget] = useState<SendTarget | null>(null);
  const [scribeStreaming, setScribeStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [implantMemoryArmed, setImplantMemoryArmed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingFrameRef = useRef<number | null>(null);
  const pendingStreamingContentRef = useRef('');

  const loadDistillationBatch = useCallback(async () => {
    if (!deps.conversationId) return null;
    const candidates = await deps.getMessageNodeMetadataByConversation(deps.conversationId);
    const plan = planDistillation(candidates, deps.triggerThreshold, deps.retainRecentCount);
    if (!plan) return null;
    const nodes = await Promise.all(plan.sourceIds.map((id) => deps.getMessageNodeById(id)));
    if (nodes.some((node) => !node)) return null;
    return { plan, nodes: nodes as MessageNode[] };
  }, [deps]);

  const publishStreamingContent = useCallback((content: string) => {
    pendingStreamingContentRef.current = content;
    if (streamingFrameRef.current !== null) return;
    streamingFrameRef.current = requestAnimationFrame(() => {
      streamingFrameRef.current = null;
      setStreamingContent(pendingStreamingContentRef.current);
    });
  }, []);

  const clearStreamingContent = useCallback(() => {
    if (streamingFrameRef.current !== null) {
      cancelAnimationFrame(streamingFrameRef.current);
      streamingFrameRef.current = null;
    }
    pendingStreamingContentRef.current = '';
    setStreamingContent('');
  }, []);

  useEffect(() => () => {
    if (streamingFrameRef.current !== null) cancelAnimationFrame(streamingFrameRef.current);
  }, []);

  const scanBoundWorldBooks = useCallback(
    async (character: Character, recentMessages: MessageNode[], maxEntries: number): Promise<WorldBookEntry[]> => {
      const [manualEntries, cacheEntries] = await Promise.all([
        deps.scanWorldBook(character.worldBookId, recentMessages, maxEntries),
        deps.scanWorldBook(character.cacheWorldBookId, recentMessages, maxEntries),
      ]);
      const seenIds = new Set<string>();
      const seenValues = new Set<string>();
      return [...manualEntries, ...cacheEntries]
        .filter((entry) => !isMvuControlEntry(entry))
        .filter((entry) => {
          const valueSignature = entry.value.trim().replace(/\s+/g, ' ').toLowerCase();
          if (seenIds.has(entry.id) || seenValues.has(valueSignature)) return false;
          seenIds.add(entry.id);
          seenValues.add(valueSignature);
          return true;
        })
        .sort((a, b) => b.priority - a.priority)
        .slice(0, maxEntries);
    },
    [deps]
  );

  const loadMvuContext = useCallback(async (character: Character, allNodes: MessageNode[], scopeId: string) => {
    const book = character.worldBookId
      ? await Stores.getWorldBookById(character.worldBookId)
      : null;
    const books = book ? [book] : [];
    const initialized = parseMvuInitBooks(books);
    const runtime = replayMvuState(allNodes, scopeId, initialized.snapshot, character.id);
    const updateEntries = book?.entries.filter((entry) => getMvuEntryKind(entry) === 'update') || [];
    return { runtime, updateEntries, initDiagnostics: initialized.diagnostics, scopeId };
  }, []);

  const loadCacheWorldBookContext = useCallback(
    async (character?: Character | null): Promise<{ cacheBook: WorldBook; manualBook: WorldBook | null } | null> => {
      if (!deps.scribeCacheWorldBookEnabled || !character?.cacheWorldBookId) return null;
      const cacheBookRaw = await Stores.getWorldBookById(character.cacheWorldBookId);
      if (!cacheBookRaw || cacheBookRaw.kind !== 'cache') return null;

      const cacheBook = normalizeCacheWorldBook(cacheBookRaw);
      if (
        cacheBook.kind !== cacheBookRaw.kind ||
        cacheBook.entryLimit !== cacheBookRaw.entryLimit ||
        cacheBook.entries.length !== cacheBookRaw.entries.length
      ) {
        await Stores.updateWorldBook(cacheBook.id, {
          kind: 'cache',
          entryLimit: CACHE_WORLD_BOOK_LIMIT,
          entries: cacheBook.entries,
        });
      }

      const manualBook = character.worldBookId
        ? (await Stores.getWorldBookById(character.worldBookId)) || null
        : null;
      return { cacheBook, manualBook };
    },
    [deps.scribeCacheWorldBookEnabled]
  );

  const applyCacheWorldBookPatch = useCallback(
    async (cacheBookId: string, operations: unknown, manualBook: WorldBook | null = null) => {
      if (!Array.isArray(operations) || operations.length === 0) return;
      const latestBook = await Stores.getWorldBookById(cacheBookId);
      if (!latestBook || latestBook.kind !== 'cache') return;
      const normalized = normalizeCacheWorldBook(latestBook);
      const manualKeys = (manualBook?.entries || []).flatMap((entry) => entry.keys);
      const nextEntries = mergeCacheWorldBookEntries(normalized.entries, operations, manualKeys);
      await Stores.updateWorldBook(cacheBookId, {
        kind: 'cache',
        entryLimit: CACHE_WORLD_BOOK_LIMIT,
        entries: nextEntries,
      });
    },
    []
  );

  /**
   * 第三书记员 AI 总结 — 属性化重构后
   * 生成状态书内容后，绑定到指定的 assistant 消息节点的 scribeUpdate 属性
   * 不再创建独立的 scribe 消息节点
   */
  const triggerScribeSummary = useCallback(
    async (recentNodes: MessageNode[], targetAssistantNodeId: string, mode: ScribeMode, character?: Character | null) => {
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
        const cacheContext = await loadCacheWorldBookContext(character);
        const cachePrompt = cacheContext
          ? buildCacheWorldBookPrompt(cacheContext.cacheBook, cacheContext.manualBook, deps.tplCacheWorldBookPrompt)
          : '';
        const rounds = Math.max(2, deps.scribeRounds || 4); // 最低 2 轮，默认 4

        // 获取历史状态书（取最近 scribeUpdate 有值的节点，最少 1 个，用于格式继承）
        const previousScribes = sorted
          .filter((n) => (n.role === 'charA' || n.role === 'charB') && n.scribeUpdate?.isEnabled && n.scribeUpdate.rawText?.trim())
          .slice(-rounds); // 数量和对话轮数一致，避免过多

        // 构建 messages: system 开头 → 历史状态书 → 逐轮对话 user → system 结尾
        const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
        messages.push({ role: 'system', content: scribePrompt });
        if (cachePrompt) {
          messages.push({ role: 'system', content: cachePrompt });
        }

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
        messages.push({ role: 'system', content: cachePrompt ? `${scribePrompt}\n\n${cachePrompt}` : scribePrompt });

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
        const message = data.choices?.[0]?.message || {};
        const rawReasoning = message.reasoning_content || '';
        const rawScribeContent = stripReasoningBlocks(message.content || data.choices?.[0]?.text || '');
        const scribeTokenCost = data.usage?.total_tokens || undefined;
        let { displayText, patch } = extractCacheWorldBookPatch(rawScribeContent);
        if (!patch && rawReasoning) {
          patch = extractCacheWorldBookPatch(rawReasoning).patch;
        }
        const newScribeContent = displayText || (!patch ? rawScribeContent : '');

        if (cacheContext && patch?.operations?.length) {
          await applyCacheWorldBookPatch(cacheContext.cacheBook.id, patch.operations, cacheContext.manualBook);
        }

        if (newScribeContent.trim()) {
          await deps.updateMessageNode(targetAssistantNodeId, {
            scribeUpdate: {
              rawText: newScribeContent,
              isEnabled: true,
              mode,
            },
            ...(scribeTokenCost !== undefined ? { scribeTokenCost } : {}),
          });

          const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, { limit: 100 });
          deps.onNodesRefresh(updatedNodes);
        }
      } catch (e: any) {
        console.error('状态书总结失败:', e);
      } finally {
        setScribeStreaming(false);
      }
    },
    [deps, loadCacheWorldBookContext, applyCacheWorldBookPatch]
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
        const cacheContext = await loadCacheWorldBookContext(character);
        const cachePrompt = cacheContext
          ? buildCacheWorldBookPrompt(cacheContext.cacheBook, cacheContext.manualBook, deps.tplCacheWorldBookPrompt)
          : '';
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: prompt },
        ];
        if (cachePrompt) {
          messages.push({ role: 'system', content: cachePrompt });
        }

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
        const rawContent = stripReasoningBlocks(content || data.choices?.[0]?.text || '');
        let { displayText: galgameDisplayText, patch } = extractCacheWorldBookPatch(rawContent);
        if (!patch && reasoning) {
          patch = extractCacheWorldBookPatch(reasoning).patch;
        }
        const parseSource = galgameDisplayText || rawContent;
        if (cacheContext && patch?.operations?.length) {
          await applyCacheWorldBookPatch(cacheContext.cacheBook.id, patch.operations, cacheContext.manualBook);
        }
        console.log('[Galgame] 完整响应: %s', JSON.stringify(data).slice(0, 500));
        console.log('[Galgame] finish_reason=%s, content.len=%d, reasoning.len=%d, rawContent.len=%d',
          finishReason, content.length, reasoning.length, rawContent.length);
        console.log('[Galgame] 原始返回: %s', rawContent.slice(0, 300));
        let galgameData = parseGalgameResponse(parseSource, charName);

        // 如果 content 为空且 reasoning_content 有值但解析失败，
        // 尝试从 reasoning_content 中提取最后一个 JSON 对象（模型可能在推理末尾输出了结果）
        if (!galgameData && !content && reasoning) {
          console.warn('[Galgame] content 为空，尝试从 reasoning_content 提取 JSON');
          const reasoningSource = extractCacheWorldBookPatch(reasoning).displayText || reasoning;
          galgameData = parseGalgameResponse(reasoningSource, charName);
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
          const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, { limit: 100 });
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

  /** 模块化 Gal/RPG 引擎：独立书记 AI 只维护受限状态 JSON，不参与角色正文。 */
  const triggerModuleRpgEngine = useCallback(
    async (recentNodes: MessageNode[], targetAssistantNodeId: string, character?: Character) => {
      if (!deps.conversationId || !deps.scribeModelId || !deps.scribeEnabled) return;
      setScribeStreaming(true);
      try {
        const model = await deps.getModelById(deps.scribeModelId);
        if (!model) throw new Error('模块化 Gal/RPG 模型未找到');

        const allNodes = await deps.queryNodesByConversation(deps.conversationId, {
          roles: ['user', 'charA', 'charB'], isArchived: false, limit: 120,
        });
        const previousBase = findLatestModuleRpgData(allNodes)?.snapshot
          || createModuleRpgSnapshot(deps.characterA, deps.characterB, deps.moduleRpgConfig);
        const previous = applyModuleRpgCharacterSlots(
          previousBase,
          deps.characterA,
          deps.characterB,
          deps.moduleRpgConfig
        );
        const dialogue = [...recentNodes]
          .sort((a, b) => a.timestamp - b.timestamp)
          .filter((node) => node.role === 'user' || node.role === 'charA' || node.role === 'charB')
          .map((node) => `${node.senderName}: ${cleanDialogueText(node.content)}`)
          .join('\n');
        if (!dialogue.trim()) return;

        const cacheContext = await loadCacheWorldBookContext(character);
        const cachePrompt = cacheContext
          ? buildCacheWorldBookPrompt(cacheContext.cacheBook, cacheContext.manualBook, deps.tplCacheWorldBookPrompt)
          : '';
        const roleReference = [deps.characterA, deps.characterB]
          .filter((item): item is Character => Boolean(item))
          .map((item) => `【${item.name} 角色卡】\n${item.systemPrompt.slice(0, 3000)}`)
          .join('\n\n');
        const messages: Array<{ role: 'system' | 'user'; content: string }> = [
          { role: 'system', content: buildModuleRpgPrompt(deps.moduleRpgPrompt, deps.moduleRpgConfig, previous) },
          ...(cachePrompt ? [{ role: 'system' as const, content: cachePrompt }] : []),
          ...(roleReference ? [{ role: 'system' as const, content: roleReference }] : []),
          { role: 'user', content: `【刚完成的对话】\n${dialogue}\n\n现在只输出本轮状态变更 JSON。` },
        ];
        const response = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
          body: JSON.stringify({
            model: model.defaultModel,
            messages,
            stream: false,
            max_tokens: 1800,
            temperature: 0.2,
            top_p: 0.85,
          }),
        });
        if (!response.ok) throw new Error(`模块化 Gal/RPG API 错误: ${response.status}`);

        const data = await response.json();
        const message = data.choices?.[0]?.message || {};
        const raw = stripReasoningBlocks(message.content || data.choices?.[0]?.text || '');
        const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
        let { displayText, patch } = extractCacheWorldBookPatch(raw);
        if (!patch && reasoning) patch = extractCacheWorldBookPatch(reasoning).patch;
        if (cacheContext && patch?.operations?.length) {
          await applyCacheWorldBookPatch(cacheContext.cacheBook.id, patch.operations, cacheContext.manualBook);
        }
        const parsed = parseModuleRpgResponse(displayText || raw)
          || (!raw && reasoning ? parseModuleRpgResponse(reasoning) : null);
        const merged = parsed
          ? mergeModuleRpgSnapshot(parsed, previous, deps.moduleRpgConfig)
          : { snapshot: previous, diagnostics: ['书记输出未通过 JSON 校验，已保留上一份合法状态。'] };
        await deps.updateMessageNode(targetAssistantNodeId, {
          moduleRpgData: {
            snapshot: merged.snapshot,
            source: 'module',
            diagnostics: merged.diagnostics,
            rawResponse: raw || reasoning || undefined,
          },
          ...(data.usage?.total_tokens !== undefined ? { scribeTokenCost: data.usage.total_tokens } : {}),
        });
        deps.onNodesRefresh(await deps.queryNodesByConversation(deps.conversationId, { limit: 100 }));
      } catch (error) {
        console.error('模块化 Gal/RPG 引擎失败:', error);
      } finally {
        setScribeStreaming(false);
      }
    },
    [deps, loadCacheWorldBookContext, applyCacheWorldBookPatch]
  );

  const sendMessage = useCallback(
    async (target: SendTarget, userContent: string, options?: SendOptions) => {
      const modelId = target.type === 'charA' ? deps.charAModelId : deps.charBModelId;
      if (!deps.conversationId || !modelId) {
        setError(`请先选择对话和角色${target.type === 'charA' ? 'A' : 'B'}模型`);
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
      clearStreamingContent();
      setStreamingTarget(target);
      setError(null);

      const abort = new AbortController();
      abortRef.current = abort;
      let fullContent = '';
      let parser: SSEParser | null = null;
      let responseUsage: TokenUsage | null = null;
      let jsonDebugResponse: DebugSseResponse | null = null;
      const targetRole: MessageRole = target.type === 'charB_eavesdrop' ? 'charB' : target.type;
      const stickerPack = deps.stickerEnabled
        ? (targetRole === 'charA' ? deps.stickerPackA : deps.stickerPackB)
        : null;
      // 记录 assembleContext 的 tokenEstimate，供 catch 块（AbortError 中断）使用
      let preTryInputTokens: number | undefined;

      try {
        // 处理"植入记忆&状态书"一次性开关：作为独立 system 消息节点插入
        // 重试场景下跳过此分支（避免重复植入）
        let skipAutoDistilled = false;
        if (implantMemoryArmed && !isRetry) {
          const [[latestDistilled], [latestScribeNode]] = await Promise.all([
            deps.queryNodesByConversation(deps.conversationId, { roles: ['distilled'], limit: 1 }),
            deps.queryNodesByConversation(deps.conversationId, {
              roles: ['charA', 'charB'],
              hasScribeUpdate: true,
              limit: 1,
            }),
          ]);
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
          const existing = await deps.getMessageNodeById(options!.existingUserNodeId!);
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
            replyTarget: target.type === 'charA' ? 'charA' : target.type === 'charB' ? 'charB' : undefined,
            isArchived: false,
            timestamp: Date.now(),
            implantedMemory: skipAutoDistilled,
          };
          await deps.addMessageNode(userNode);
        }

        const contextSnapshot = options?.contextSnapshot;
        const [unarchived, distilledCandidates, scanTimeline] = contextSnapshot
          ? [contextSnapshot.unarchived, contextSnapshot.distilledCandidates, contextSnapshot.scanTimeline]
          : await Promise.all([
          deps.queryNodesByConversation(deps.conversationId, {
            roles: ['user', 'charA', 'charB', 'system'],
            isArchived: false,
            limit: deps.recentRounds,
          }),
          deps.queryNodesByConversation(deps.conversationId, {
            roles: ['distilled'],
            limit: Math.max(1, deps.maxInjectedMemories),
          }),
          deps.queryNodesByConversation(deps.conversationId, {
            roles: ['user', 'charA', 'charB', 'system', 'distilled'],
            isArchived: false,
            limit: 2000,
          }),
        ]);
        const latestCumulative = [...distilledCandidates].reverse().find((node) => node.distillationMeta?.cumulative);
        const distilled = latestCumulative ? [latestCumulative] : distilledCandidates;
        // 重试场景下 userNode 已经在 unarchived 中（复用既有节点），无需再追加；
        // 普通场景下 userNode 刚刚 addMessageNode，已写入 DB，也已在 allNodes → unarchived 中。
        // 不再额外追加 userNode，否则会导致当前用户消息重复注入上下文，token 虚高、世界书误触发。
        const recentForContext = unarchived.slice(-deps.recentRounds);
        const worldBookScanWindow = buildWorldBookScanWindow(scanTimeline, deps.worldBookScanDepth);

        const wbEntries = await scanBoundWorldBooks(
          character,
          worldBookScanWindow,
          deps.maxWorldBookEntries
        );

        const model = await deps.getModelById(modelId);
        if (!model) throw new Error(`角色${target.type === 'charA' ? 'A' : 'B'}模型未找到`);

        const mvuScopeId = getMvuScopeId(character.id, targetRole);
        const mvuContext = deps.mvuEnabled
          ? await loadMvuContext(character, contextSnapshot?.allNodes ?? await deps.getNodesByConversation(deps.conversationId), mvuScopeId)
          : null;
        const stickerPrompt = buildStickerPrompt(stickerPack, deps.stickerMaxCount, deps.tplStickerPrompt);
        const mvuPrompt = mvuContext
          ? buildMvuPrompt(deps.tplMvuPrompt || DEFAULT_TPL_MVU_PROMPT, mvuContext.runtime, mvuContext.updateEntries)
          : '';

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
          skipAutoDistilled,
          tplUserWrapper: deps.tplUserWrapper,
          tplOtherCharWrapper: deps.tplOtherCharWrapper,
          tplIdentityAnchor: deps.tplIdentityAnchor,
          tplWorldBookPrefix: deps.tplWorldBookPrefix,
          tplDistilledPrefix: deps.tplDistilledPrefix,
          tplStateBookPrefix: deps.tplStateBookPrefix,
          userName: deps.userName,
          userDescription: deps.userDescription,
          moduleRpgConfig: deps.moduleRpgConfig,
          appendedSystemPrompt: [stickerPrompt, mvuPrompt].filter(Boolean).join('\n\n'),
        });

        // 把上下文元数据回写到用户消息节点
        await deps.updateMessageNode(userNode.id, {
          activatedWorldBookEntries: assembled.metadata.activatedWorldBookEntries,
          tokenEstimate: assembled.metadata.tokenEstimate,
        });
        // 存储供 catch 块使用（assembled 是 try 块作用域的 const，catch 无法直接访问）
        preTryInputTokens = assembled.metadata.tokenEstimate;

        const resp = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages: assembled.messages,
            stream: deps.streamingEnabled,
            ...(deps.streamingEnabled && shouldRequestStreamUsage(model) ? { stream_options: { include_usage: true } } : {}),
            ...buildSamplingParams(model.temperature, model.topP),
            ...(deps.thinkingEnabled ? { reasoning_effort: 'medium' } : {}),
          }),
          signal: abort.signal,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 200)}`);
        }

        if (!deps.streamingEnabled) {
          const data = await resp.json();
          const message = data.choices?.[0]?.message || {};
          fullContent = String(message.content || data.choices?.[0]?.text || '');
          responseUsage = normalizeTokenUsage(data.usage);
          jsonDebugResponse = deps.debugMode ? createJsonDebugSnapshot(data, fullContent, responseUsage) : null;
        } else {
          const reader = resp.body!.getReader();
        parser = new SSEParser();
        fullContent = '';

        while (true) {
          // 每次 read 前启动一个空闲超时 timer：若服务端 30s 内不发送
          // 任何新 chunk，则 abort 整个 fetch，让 read 抛出 AbortError。
          let idleTimer: ReturnType<typeof setTimeout> | null =
            setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
          const { done, value } = await reader.read();
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (done) {
            for (const chunk of parser.finish()) {
              if (chunk.done) continue;
              fullContent += chunk.content;
              publishStreamingContent(filterMvuStreamingText(filterStreamingReasoningText(fullContent)));
            }
            break;
          }
          const chunks = parser.parse(value);
          for (const chunk of chunks) {
            if (chunk.done) break;
            fullContent += chunk.content;
            publishStreamingContent(filterMvuStreamingText(filterStreamingReasoningText(fullContent)));
          }
        }

        }
        // 计算本消息的 Token 消耗: 优先从 API usage 获取精确值，否则暴力估计
        let tokenCost: number;
        let tokenCostIsExact: boolean;
        let tokenCostInput: number | undefined;
        let tokenCostTotal: number | undefined;
        let tokenCostReasoning: number | undefined;
        const tokenUsage = parser?.tokenUsage ?? responseUsage;
        if (tokenUsage && tokenUsage.completion_tokens > 0) {
          tokenCost = tokenUsage.completion_tokens;
          tokenCostIsExact = true;
          tokenCostInput = tokenUsage.prompt_tokens || undefined;
          tokenCostTotal = tokenUsage.total_tokens || (tokenCostInput ? tokenCostInput + tokenCost : undefined);
          tokenCostReasoning = tokenUsage.reasoning_tokens;
        } else {
          tokenCost = Math.ceil(fullContent.length * 0.5);
          tokenCostIsExact = false;
          // 无 API 精确值时，用上下文估算的输入 token
          tokenCostInput = assembled.metadata.tokenEstimate || undefined;
          tokenCostTotal = tokenCostInput ? tokenCostInput + tokenCost : undefined;
        }

        let mvuResponse = deps.mvuEnabled
          ? parseMvuResponse(stripReasoningBlocks(fullContent))
          : { content: stripReasoningBlocks(fullContent), operations: [], diagnostics: [] };
        let mvuFallback: MvuFallbackResult | null = null;
        if (mvuContext && shouldRequestStreamUsage(model) && mvuResponse.operations.length === 0) {
          const dialogue = `${deps.userName || 'Player'}: ${userNode.content}\n${character.name}: ${mvuResponse.content}`;
          const fallbackPrompt = buildMvuFallbackPrompt(
            deps.tplMvuFallbackPrompt || DEFAULT_TPL_MVU_FALLBACK_PROMPT,
            mvuContext.runtime,
            mvuContext.updateEntries,
            dialogue
          );
          mvuFallback = await requestDeepSeekMvuFallback(model, fallbackPrompt);
          mvuResponse = {
            ...mvuResponse,
            operations: mvuFallback.operations.length > 0 ? mvuFallback.operations : mvuResponse.operations,
            diagnostics: [...mvuResponse.diagnostics, ...mvuFallback.diagnostics],
          };
        }
        const parsedStickerResponse = parseStickerResponse(
          mvuResponse.content,
          stickerPack,
          deps.stickerMaxCount
        );
        const debugResponse = deps.debugMode ? (parser?.getDebugSnapshot(fullContent) ?? jsonDebugResponse ?? undefined) : undefined;
        if (debugResponse && mvuFallback) {
          debugResponse.auxiliaryResponses = [{
            kind: 'mvu_fallback',
            rawResponse: mvuFallback.rawResponse ?? null,
            content: mvuFallback.content,
            reasoningContent: mvuFallback.reasoningContent,
            operationCount: mvuFallback.operations.length,
            diagnostics: mvuFallback.diagnostics,
          }];
        }
        const aiNode: MessageNode = {
          id: generateId(),
          conversationId: deps.conversationId,
          role: target.type === 'charB_eavesdrop' ? 'charB' : target.type,
          senderName: character.name,
          content: parsedStickerResponse.content.trim() ? parsedStickerResponse.content : '(空响应)',
          stickerUsages: parsedStickerResponse.usages.length > 0 ? parsedStickerResponse.usages : undefined,
          isArchived: false,
          timestamp: Date.now(),
          tokenCost,
          tokenCostIsExact,
          tokenCostInput,
          tokenCostTotal,
          tokenCostReasoning,
          debugPrompt: deps.debugMode ? assembled.messages : undefined,
          debugResponse,
          ...(mvuContext ? {
            mvuData: createMvuNodeData(
              mvuContext.scopeId,
              mvuContext.runtime,
              mvuResponse.operations,
              [...mvuContext.initDiagnostics, ...mvuResponse.diagnostics]
            ),
          } : {}),
        };
        await deps.addMessageNode(aiNode);

        const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, {
          limit: Math.max(100, deps.recentRounds * 2),
        });
        deps.onNodesRefresh(updatedNodes);

        // 第三书记员 + 自动蒸馏：串行触发，避免对限速严格的 API（如智谱）触发 429
        // 注意：原本是 fire-and-forget 并发，现在改为单个 async chain 串行
        // — 先 Galgame/scribe，完成后再蒸馏。仍不阻塞主流程返回。
        (async () => {
          // 1. Galgame / 文本状态书
          if (deps.scribeEnabled && deps.scribeModelId) {
            const aiRole = target.type === 'charB_eavesdrop' ? 'charB' : target.type;
            const [nonSystemNodes, assistantCount] = await Promise.all([
              deps.queryNodesByConversation(deps.conversationId!, {
                roles: ['user', 'charA', 'charB'],
                isArchived: false,
                limit: deps.recentRounds,
              }),
              deps.countNodesByConversation(deps.conversationId!, {
                roles: [aiRole],
                isArchived: false,
              }),
            ]);
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
                if (deps.scribeEngine === 'module') {
                  await triggerModuleRpgEngine(
                    nonSystemNodes.slice(-deps.recentRounds),
                    aiNode.id,
                    character
                  );
                } else if (deps.scribeEngine === 'galgame') {
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
                    deps.scribeMode,
                    character
                  );
                }
              }
            }
          } else {
            console.log('[状态书] 跳过: scribeEnabled=%s scribeModelId=%s', deps.scribeEnabled, deps.scribeModelId);
          }

          // 2. 自动蒸馏（Galgame/scribe 完成后再触发，避免并发）
          if (deps.autoTriggerDistillation && deps.distillModelId) {
            const batch = await loadDistillationBatch();
            if (batch) {
                // 查找上一轮记忆结晶（取最新的 distilled 节点）
                const [prevDistilled] = await deps.queryNodesByConversation(deps.conversationId!, {
                  roles: ['distilled'],
                  limit: 1,
                });

                await deps.performDistillation({
                  nodes: batch.nodes,
                  sourceNodeIds: batch.plan.sourceIds,
                  roundStart: (prevDistilled?.distillationMeta?.roundEnd ?? 0) + 1,
                  roundEnd: (prevDistilled?.distillationMeta?.roundEnd ?? 0) + batch.plan.selectedRounds,
                  distillModelId: deps.distillModelId,
                  distillationPrompt: deps.distillationPrompt,
                  tplDistilledNodePrefix: deps.tplDistilledNodePrefix,
                  prevDistilledContent: prevDistilled?.content || null,
                  getModelById: deps.getModelById,
                  commitDistillationBatch: deps.commitDistillationBatch,
                });
                deps.onDistillationComplete?.();
            }
          }
        })().catch(console.error);
      } catch (e: any) {
        if (e.name === 'AbortError') {
          if (parser) {
            for (const chunk of parser.finish()) {
              if (!chunk.done) fullContent += chunk.content;
            }
          }
          const debugResponse = deps.debugMode && parser
            ? parser.getDebugSnapshot(fullContent)
            : undefined;
          const parsedStickerResponse = parseStickerResponse(
            stripReasoningBlocks(fullContent),
            stickerPack,
            deps.stickerMaxCount
          );
          if (parsedStickerResponse.content.trim() || parsedStickerResponse.usages.length > 0 || debugResponse?.events.length) {
            const partialNode: MessageNode = {
              id: generateId(),
              conversationId: deps.conversationId,
              role: target.type === 'charB_eavesdrop' ? 'charB' : target.type,
              senderName: character.name,
              content: parsedStickerResponse.content || '(空响应)',
              stickerUsages: parsedStickerResponse.usages.length > 0 ? parsedStickerResponse.usages : undefined,
              isArchived: false,
              timestamp: Date.now(),
              tokenCost: Math.ceil(fullContent.length * 0.5),
              tokenCostIsExact: false,
              tokenCostInput: preTryInputTokens,
              tokenCostTotal: (preTryInputTokens ?? 0) + Math.ceil(fullContent.length * 0.5),
              debugResponse,
            };
            await deps.addMessageNode(partialNode);
            const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, { limit: 100 });
            deps.onNodesRefresh(updatedNodes);
          }
        } else {
          setError(e.message || '发送失败');
        }
      } finally {
        setStreaming(false);
        clearStreamingContent();
        setStreamingTarget(null);
        abortRef.current = null;
      }
    },
    [deps]
  );

  const sendMessageToBoth = useCallback(
    async (userContent: string) => {
      if (!deps.conversationId || !deps.characterA || !deps.characterB || !deps.charAModelId || !deps.charBModelId) {
        setError('请先完成角色 A、角色 B 及各自模型的绑定');
        return;
      }

      const userNode: MessageNode = {
        id: generateId(),
        conversationId: deps.conversationId,
        role: 'user',
        senderName: '你',
        content: userContent,
        isArchived: false,
        timestamp: Date.now(),
      };
      await deps.addMessageNode(userNode);

      // A 与 B 均从写入玩家消息后的同一份时间线组装上下文，B 不会看到 A 的新回复。
      const [unarchived, distilledCandidates, scanTimeline] = await Promise.all([
        deps.queryNodesByConversation(deps.conversationId, {
          roles: ['user', 'charA', 'charB', 'system'],
          isArchived: false,
          limit: deps.recentRounds,
        }),
        deps.queryNodesByConversation(deps.conversationId, {
          roles: ['distilled'],
          limit: Math.max(1, deps.maxInjectedMemories),
        }),
        deps.queryNodesByConversation(deps.conversationId, {
          roles: ['user', 'charA', 'charB', 'system', 'distilled'],
          isArchived: false,
          limit: 2000,
        }),
      ]);
      const contextSnapshot = {
        unarchived,
        distilledCandidates,
        scanTimeline,
        allNodes: scanTimeline,
      };
      const options: SendOptions = {
        skipUserNode: true,
        existingUserNodeId: userNode.id,
        contextSnapshot,
      };

      await sendMessage(
        { type: 'charA', characterId: deps.characterA.id },
        userContent,
        options
      );
      await sendMessage(
        { type: 'charB', characterId: deps.characterB.id },
        userContent,
        options
      );
    },
    [deps, sendMessage]
  );

  const triggerEavesdrop = useCallback(async () => {
    if (!deps.conversationId || !deps.charBModelId || !deps.characterB) {
      setError('请先选择对话、角色B模型和角色B');
      return;
    }

    setStreaming(true);
    clearStreamingContent();
    setStreamingTarget({ type: 'charB', characterId: deps.characterB.id });
    setError(null);
    let fullContent = '';
    let parser: SSEParser | null = null;
    let responseUsage: TokenUsage | null = null;
    let jsonDebugResponse: DebugSseResponse | null = null;
    const stickerPack = deps.stickerEnabled ? deps.stickerPackB : null;

    try {
      const [unarchived, distilledCandidates, scanTimeline] = await Promise.all([
        deps.queryNodesByConversation(deps.conversationId, {
          roles: ['user', 'charA', 'charB', 'system'],
          isArchived: false,
          limit: deps.recentRounds,
        }),
        deps.queryNodesByConversation(deps.conversationId, {
          roles: ['distilled'],
          limit: Math.max(1, deps.maxInjectedMemories),
        }),
        deps.queryNodesByConversation(deps.conversationId, {
          roles: ['user', 'charA', 'charB', 'system', 'distilled'],
          isArchived: false,
          limit: 2000,
        }),
      ]);
      const latestCumulative = [...distilledCandidates].reverse().find((item) => item.distillationMeta?.cumulative);
      const distilled = latestCumulative ? [latestCumulative] : distilledCandidates;

      const charBWithEavesdrop: Character = {
        ...deps.characterB,
        systemPrompt:
          deps.characterB.systemPrompt +
          (deps.tplEavesdropAppend || DEFAULT_TPL_EAVESDROP_APPEND),
      };

      const wbEntries = await scanBoundWorldBooks(
        deps.characterB,
        buildWorldBookScanWindow(scanTimeline, deps.worldBookScanDepth),
        deps.maxWorldBookEntries
      );

      const model = await deps.getModelById(deps.charBModelId);
      if (!model) throw new Error('角色B模型未找到');

      const mvuScopeId = getMvuScopeId(deps.characterB.id, 'charB');
      const mvuContext = deps.mvuEnabled
        ? await loadMvuContext(deps.characterB, await deps.getNodesByConversation(deps.conversationId), mvuScopeId)
        : null;
      const stickerPrompt = buildStickerPrompt(stickerPack, deps.stickerMaxCount, deps.tplStickerPrompt);
      const mvuPrompt = mvuContext
        ? buildMvuPrompt(deps.tplMvuPrompt || DEFAULT_TPL_MVU_PROMPT, mvuContext.runtime, mvuContext.updateEntries)
        : '';

      const assembled = assembleContext({
        character: charBWithEavesdrop,
        targetRole: 'charB',
        otherCharName: deps.characterA?.name || '角色A',
        worldbookEntries: wbEntries,
        recentMessages: unarchived,
        distilledNodes: distilled,
        maxTokens: model.maxContextTokens,
        tplUserWrapper: deps.tplUserWrapper,
        tplOtherCharWrapper: deps.tplOtherCharWrapper,
        tplIdentityAnchor: deps.tplIdentityAnchor,
        tplWorldBookPrefix: deps.tplWorldBookPrefix,
        tplDistilledPrefix: deps.tplDistilledPrefix,
        tplStateBookPrefix: deps.tplStateBookPrefix,
        userName: deps.userName,
        userDescription: deps.userDescription,
        moduleRpgConfig: deps.moduleRpgConfig,
        appendedSystemPrompt: [stickerPrompt, mvuPrompt].filter(Boolean).join('\n\n'),
      });

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
          stream: deps.streamingEnabled,
          ...(deps.streamingEnabled && shouldRequestStreamUsage(model) ? { stream_options: { include_usage: true } } : {}),
          ...buildSamplingParams(model.temperature, model.topP),
        }),
        signal: abort.signal,
      });

      if (!resp.ok) throw new Error(`API 错误: ${resp.status}`);
      if (!deps.streamingEnabled) {
        const data = await resp.json();
        const message = data.choices?.[0]?.message || {};
        fullContent = String(message.content || data.choices?.[0]?.text || '');
        responseUsage = normalizeTokenUsage(data.usage);
        jsonDebugResponse = deps.debugMode ? createJsonDebugSnapshot(data, fullContent, responseUsage) : null;
      } else {

      const reader = resp.body!.getReader();
      parser = new SSEParser();
      fullContent = '';

      while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | null =
          setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
        const { done, value } = await reader.read();
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (done) {
          for (const chunk of parser.finish()) {
            if (chunk.done) continue;
            fullContent += chunk.content;
            publishStreamingContent(filterMvuStreamingText(filterStreamingReasoningText(fullContent)));
          }
          break;
        }
        for (const chunk of parser.parse(value)) {
          if (chunk.done) break;
          fullContent += chunk.content;
          publishStreamingContent(filterMvuStreamingText(filterStreamingReasoningText(fullContent)));
        }
      }
      }

      let tokenCost: number;
      let tokenCostIsExact: boolean;
      let tokenCostInput: number | undefined;
      let tokenCostTotal: number | undefined;
      let tokenCostReasoning: number | undefined;
      const tokenUsage = parser?.tokenUsage ?? responseUsage;
      if (tokenUsage && tokenUsage.completion_tokens > 0) {
        tokenCost = tokenUsage.completion_tokens;
        tokenCostIsExact = true;
        tokenCostInput = tokenUsage.prompt_tokens || undefined;
        tokenCostTotal = tokenUsage.total_tokens || (tokenCostInput ? tokenCostInput + tokenCost : undefined);
        tokenCostReasoning = tokenUsage.reasoning_tokens;
      } else {
        tokenCost = Math.ceil(fullContent.length * 0.5);
        tokenCostIsExact = false;
        tokenCostInput = assembled.metadata.tokenEstimate || undefined;
        tokenCostTotal = tokenCostInput ? tokenCostInput + tokenCost : undefined;
      }

      let mvuResponse = deps.mvuEnabled
        ? parseMvuResponse(stripReasoningBlocks(fullContent))
        : { content: stripReasoningBlocks(fullContent), operations: [], diagnostics: [] };
      let mvuFallback: MvuFallbackResult | null = null;
      if (mvuContext && shouldRequestStreamUsage(model) && mvuResponse.operations.length === 0) {
        const dialogue = [...unarchived.slice(-4), {
          senderName: deps.characterB.name,
          content: mvuResponse.content,
        }]
          .map((item) => `${item.senderName}: ${item.content}`)
          .join('\n');
        const fallbackPrompt = buildMvuFallbackPrompt(
          deps.tplMvuFallbackPrompt || DEFAULT_TPL_MVU_FALLBACK_PROMPT,
          mvuContext.runtime,
          mvuContext.updateEntries,
          dialogue
        );
        mvuFallback = await requestDeepSeekMvuFallback(model, fallbackPrompt);
        mvuResponse = {
          ...mvuResponse,
          operations: mvuFallback.operations.length > 0 ? mvuFallback.operations : mvuResponse.operations,
          diagnostics: [...mvuResponse.diagnostics, ...mvuFallback.diagnostics],
        };
      }
      const parsedStickerResponse = parseStickerResponse(
        mvuResponse.content,
        stickerPack,
        deps.stickerMaxCount
      );
      const debugResponse = deps.debugMode ? (parser?.getDebugSnapshot(fullContent) ?? jsonDebugResponse ?? undefined) : undefined;
      if (debugResponse && mvuFallback) {
        debugResponse.auxiliaryResponses = [{
          kind: 'mvu_fallback',
          rawResponse: mvuFallback.rawResponse ?? null,
          content: mvuFallback.content,
          reasoningContent: mvuFallback.reasoningContent,
          operationCount: mvuFallback.operations.length,
          diagnostics: mvuFallback.diagnostics,
        }];
      }
      const node: MessageNode = {
        id: generateId(),
        conversationId: deps.conversationId,
        role: 'charB',
        senderName: deps.characterB.name,
        content: parsedStickerResponse.content.trim() ? parsedStickerResponse.content : '(没说话)',
        stickerUsages: parsedStickerResponse.usages.length > 0 ? parsedStickerResponse.usages : undefined,
        isArchived: false,
        timestamp: Date.now(),
        tokenCost,
        tokenCostIsExact,
        tokenCostInput,
        tokenCostTotal,
        tokenCostReasoning,
        debugPrompt: deps.debugMode ? assembled.messages : undefined,
        debugResponse,
        ...(mvuContext ? {
          mvuData: createMvuNodeData(
            mvuContext.scopeId,
            mvuContext.runtime,
            mvuResponse.operations,
            [...mvuContext.initDiagnostics, ...mvuResponse.diagnostics]
          ),
        } : {}),
      };
      await deps.addMessageNode(node);

      const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, {
        limit: Math.max(100, deps.recentRounds * 2),
      });
      deps.onNodesRefresh(updatedNodes);

      // 旁听也触发状态书（如果模式匹配）— 串行触发避免限速 API 429
      if (deps.scribeEnabled && deps.scribeModelId) {
        const nonSystemNodes = await deps.queryNodesByConversation(deps.conversationId, {
          roles: ['user', 'charA', 'charB'],
          isArchived: false,
          limit: deps.recentRounds,
        });
        // 以角色 B 的 assistant 消息数作为轮数
        const assistantCount = await deps.countNodesByConversation(deps.conversationId, {
          roles: ['charB'],
          isArchived: false,
        });
        const triggerInterval = deps.scribeEngine === 'galgame'
          ? GALGAME_TRIGGER_INTERVAL
          : deps.scribeTriggerInterval;
        if (triggerInterval > 0 && assistantCount > 0 && assistantCount % triggerInterval === 0) {
          if (deps.scribeMode === 'charB' || deps.scribeMode === 'auto') {
            if (deps.scribeEngine === 'module') {
              await triggerModuleRpgEngine(
                nonSystemNodes.slice(-deps.recentRounds),
                node.id,
                deps.characterB
              );
            } else if (deps.scribeEngine === 'galgame') {
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
                deps.scribeMode,
                deps.characterB
              );
            }
          }
        }
      }
    } catch (e: any) {
        if (e.name === 'AbortError') {
          if (parser) {
            for (const chunk of parser.finish()) {
              if (!chunk.done) fullContent += chunk.content;
            }
          }
          const debugResponse = deps.debugMode && parser
            ? parser.getDebugSnapshot(fullContent)
            : undefined;
          const parsedStickerResponse = parseStickerResponse(
            stripReasoningBlocks(fullContent),
            stickerPack,
            deps.stickerMaxCount
          );
          if (parsedStickerResponse.content.trim() || parsedStickerResponse.usages.length > 0 || debugResponse?.events.length) {
            const partialNode: MessageNode = {
              id: generateId(),
              conversationId: deps.conversationId,
              role: 'charB',
              senderName: deps.characterB.name,
              content: parsedStickerResponse.content || '(没说话)',
              stickerUsages: parsedStickerResponse.usages.length > 0 ? parsedStickerResponse.usages : undefined,
              isArchived: false,
              timestamp: Date.now(),
              tokenCost: Math.ceil(fullContent.length * 0.5),
              tokenCostIsExact: false,
              debugResponse,
            };
            await deps.addMessageNode(partialNode);
            const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, { limit: 100 });
            deps.onNodesRefresh(updatedNodes);
          }
        } else {
          setError(e.message || '旁听失败');
        }
      } finally {
      setStreaming(false);
      clearStreamingContent();
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
      const batch = await loadDistillationBatch();
      if (!batch) {
        setError(`完整可蒸馏轮次不足，至少需要 ${Math.max(1, deps.triggerThreshold)} 轮，并保留最近 ${Math.max(0, deps.retainRecentCount)} 轮`);
        return;
      }

      // 查找上一轮记忆结晶
      const [prevDistilled] = await deps.queryNodesByConversation(deps.conversationId, {
        roles: ['distilled'],
        limit: 1,
      });

      await deps.performDistillation({
        nodes: batch.nodes,
        sourceNodeIds: batch.plan.sourceIds,
        roundStart: (prevDistilled?.distillationMeta?.roundEnd ?? 0) + 1,
        roundEnd: (prevDistilled?.distillationMeta?.roundEnd ?? 0) + batch.plan.selectedRounds,
        distillModelId: deps.distillModelId,
        distillationPrompt: deps.distillationPrompt,
        tplDistilledNodePrefix: deps.tplDistilledNodePrefix,
        prevDistilledContent: prevDistilled?.content || null,
        getModelById: deps.getModelById,
        commitDistillationBatch: deps.commitDistillationBatch,
      });
      deps.onDistillationComplete?.();
      const updatedNodes = await deps.queryNodesByConversation(deps.conversationId, { limit: 100 });
      deps.onNodesRefresh(updatedNodes);
    } catch (e: any) {
      setError(e.message || '蒸馏失败');
    }
  }, [deps, loadDistillationBatch]);

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
    sendMessageToBoth,
    triggerEavesdrop,
    triggerDistillation,
    triggerScribeSummary,
    triggerGalgameEngine,
    abortStream,
    implantMemoryArmed,
    armImplantMemory,
    disarmImplantMemory,
  };
}
