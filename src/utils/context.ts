import type {
  Character,
  WorldBookEntry,
  MessageNode,
  AssembledContext,
  AssembledMessage,
  MessageRole,
} from '../types';
import { buildGalgameSystemInjection } from './galgameEngine';
import {
  DEFAULT_TPL_USER_WRAPPER,
  DEFAULT_TPL_OTHER_CHAR_WRAPPER,
  DEFAULT_TPL_IDENTITY_ANCHOR,
  DEFAULT_TPL_WORLD_BOOK_PREFIX,
  DEFAULT_TPL_DISTILLED_PREFIX,
  DEFAULT_TPL_STATE_BOOK_PREFIX,
} from './constants';

interface AssembleParams {
  /** 目标角色（正在请求回复的那一方） */
  character: Character;
  /** 目标角色在对话中的角色标识（charA 或 charB） */
  targetRole: MessageRole;
  /** 对方角色的显示名称 */
  otherCharName: string;
  worldbookEntries: WorldBookEntry[];
  recentMessages: MessageNode[];
  distilledNodes: MessageNode[];
  /** 模型最大上下文 Token 数，默认 4000 */
  maxTokens?: number;
  /** 世界书冷却轮数：每个词条独立冷却，注入后等待 N 轮才能再次注入，0=不冷却 */
  worldBookCooldown?: number;
  /** 每个词条的最后注入轮数记录（entryId → lastInjectedRound），会被原地更新 */
  worldBookCooldownState?: Map<string, number>;
  /** 当前对话轮数 */
  currentRound?: number;
  /** 是否跳过自动注入的 distilled（因为用户已手动植入到消息内容里） */
  skipAutoDistilled?: boolean;
  // 高级提示词模板覆盖（空=用默认）
  tplUserWrapper?: string;
  tplOtherCharWrapper?: string;
  tplIdentityAnchor?: string;
  tplWorldBookPrefix?: string;
  tplDistilledPrefix?: string;
  tplStateBookPrefix?: string;
}

/** 粗略 Token 估算：1 字符 ≈ 0.5 Token */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length * 0.5);
}

/**
 * 计算世界书冷却轮数。
 * 默认为最近保留轮数的 1/3，最少 1 轮。
 */
export function calcWorldBookCooldown(recentRounds: number): number {
  return Math.max(1, Math.floor(recentRounds / 3));
}

/**
 * 组装发送给 AI 的上下文。
 *
 * 状态书注入策略（属性化重构后）：
 *   - 不再在全局头部注入 scribeContent
 *   - 遍历历史消息时，若某个 assistant 节点的 scribeUpdate.isEnabled 为 true，
 *     则紧跟该 assistant 消息后插入一条 system 消息，内容为该节点保存的 rawText
 *   - 这样状态书作为"历史事实"按时间线线性注入，AI 能清晰看到状态演变
 *
 * Token 预算策略：
 *   - 始终为最近对话历史预留一部分预算（默认 25% 或 600 token，取高）
 *   - 世界书和蒸馏摘要按 token 预算截断
 *
 * 世界书冷却（每词条独立）：
 *   - 先注入，再开始冷却
 */
export function assembleContext(params: AssembleParams): AssembledContext {
  const messages: AssembledMessage[] = [];
  const metadata = {
    worldBookMatches: [] as string[],
    archivedCount: 0,
    distilledNodesUsed: [] as string[],
    tokenEstimate: 0,
    highPriorityTokens: 0,
    activatedWorldBookEntries: [] as { id: string; name: string }[],
  };

  const maxTokens = params.maxTokens && params.maxTokens > 0 ? params.maxTokens : 4000;
  const recentBudget = Math.min(Math.floor(maxTokens * 0.25), Math.max(600, Math.floor(maxTokens * 0.15)));
  const highPriorityBudget = maxTokens - recentBudget;
  const cooldown = params.worldBookCooldown ?? 0;
  const cooldownState = params.worldBookCooldownState ?? new Map<string, number>();
  const currentRound = params.currentRound ?? 0;
  let usedTokens = 0;

  // ── 1. 高优先级：System Prompt ──
  if (params.character.systemPrompt?.trim()) {
    const content = params.character.systemPrompt;
    messages.push({ role: 'system', content });
    usedTokens += estimateTokens(content);
  }

  // ── 2. 世界书（每词条独立冷却，受 token 预算限制） ──
  for (const entry of params.worldbookEntries) {
    const lastInjected = cooldownState.get(entry.id);
    if (lastInjected !== undefined && cooldown > 0) {
      const roundsSinceLast = currentRound - lastInjected;
      if (roundsSinceLast < cooldown) continue;
    }

    const keyLabel = entry.keys?.[0] || '未知';
    const content = (params.tplWorldBookPrefix || DEFAULT_TPL_WORLD_BOOK_PREFIX)
      .replace('{key}', keyLabel).replace('{value}', entry.value);
    const entryTokens = estimateTokens(content);

    if (usedTokens + entryTokens > highPriorityBudget) break;

    messages.push({ role: 'system', content });
    metadata.worldBookMatches.push(entry.id);
    metadata.activatedWorldBookEntries.push({ id: entry.id, name: keyLabel });
    usedTokens += entryTokens;

    cooldownState.set(entry.id, currentRound);
  }

  // ── 3. 高优先级：蒸馏摘要（记忆结晶，仅在未手动植入时自动注入） ──
  if (!params.skipAutoDistilled) {
    for (const node of params.distilledNodes) {
      const content = (params.tplDistilledPrefix || DEFAULT_TPL_DISTILLED_PREFIX)
      .replace('{content}', node.content);
      const nodeTokens = estimateTokens(content);

      if (usedTokens + nodeTokens > highPriorityBudget) break;

      messages.push({ role: 'system', content });
      metadata.distilledNodesUsed.push(node.id);
      usedTokens += nodeTokens;
    }
  }

  metadata.highPriorityTokens = usedTokens;

  // ── 4. 低优先级：最近对话历史 —— 逆序截断 ──
  // 状态书现在作为 assistant 节点的属性，紧跟在该消息后插入 system 消息
  const sorted = [...params.recentMessages].sort((a, b) => a.timestamp - b.timestamp);
  const accepted: MessageNode[] = [];

  // 角色隔离包裹头（支持用户自定义模板覆盖）
  const tplUser = params.tplUserWrapper || DEFAULT_TPL_USER_WRAPPER;
  const tplOther = params.tplOtherCharWrapper || DEFAULT_TPL_OTHER_CHAR_WRAPPER;
  const USER_WRAPPER = (content: string) =>
    tplUser.replace('{content}', content);
  const OTHER_CHAR_WRAPPER = (content: string) =>
    tplOther.replace('{otherCharName}', params.otherCharName).replace('{content}', content);

  // 逆序遍历，计算每个消息及其附带 scribeUpdate/galgameData 的 token 开销
  for (let i = sorted.length - 1; i >= 0; i--) {
    const msg = sorted[i];
    let estimated = 0;
    let scribeEstimated = 0;

    if (msg.role === 'user') {
      estimated = estimateTokens(USER_WRAPPER(msg.content));
    } else if (msg.role === params.targetRole) {
      estimated = estimateTokens(msg.content);
      // 状态书（文本模式）
      if (msg.scribeUpdate?.isEnabled && msg.scribeUpdate.rawText?.trim()) {
        const tplScribe = params.tplStateBookPrefix || DEFAULT_TPL_STATE_BOOK_PREFIX;
        scribeEstimated = estimateTokens(tplScribe.replace('{content}', msg.scribeUpdate.rawText));
      }
      // Galgame 数值（非对称注入 — 情况 A: 属于当前回戏角色）
      if (msg.galgameData) {
        scribeEstimated += estimateTokens(buildGalgameSystemInjection(msg.galgameData, true));
      }
    } else if (msg.role === 'charA' || msg.role === 'charB') {
      estimated = estimateTokens(OTHER_CHAR_WRAPPER(msg.content));
      if (msg.scribeUpdate?.isEnabled && msg.scribeUpdate.rawText?.trim()) {
        const tplScribe = params.tplStateBookPrefix || DEFAULT_TPL_STATE_BOOK_PREFIX;
        scribeEstimated = estimateTokens(tplScribe.replace('{content}', msg.scribeUpdate.rawText));
      }
      // Galgame 数值（非对称注入 — 情况 B: 属于旁观/NPC角色）
      if (msg.galgameData) {
        scribeEstimated += estimateTokens(buildGalgameSystemInjection(msg.galgameData, false));
      }
    } else if (msg.role === 'system') {
      // 用户手动植入的记忆结晶 / 状态书 system 节点，直接作为 system 消息注入
      estimated = estimateTokens(msg.content);
    } else if (msg.role === 'scribe') {
      continue;
    } else {
      continue;
    }

    if (usedTokens + estimated + scribeEstimated > maxTokens) break;
    usedTokens += estimated + scribeEstimated;
    accepted.unshift(msg);
  }

  // 正序输出消息，assistant 节点后紧跟其 scribeUpdate / galgameData
  // 身份隔离判定: 当前回戏角色的名字
  const activeCharName = params.character.name;
  for (const msg of accepted) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: USER_WRAPPER(msg.content) });
    } else if (msg.role === params.targetRole) {
      messages.push({ role: 'assistant', content: msg.content });
      // 状态书（文本模式）
      if (msg.scribeUpdate?.isEnabled && msg.scribeUpdate.rawText?.trim()) {
        const tplScribe = params.tplStateBookPrefix || DEFAULT_TPL_STATE_BOOK_PREFIX;
        messages.push({
          role: 'system',
          content: tplScribe.replace('{content}', msg.scribeUpdate.rawText),
        });
      }
      // Galgame 非对称注入 — 情况 A: 属于当前回戏角色
      if (msg.galgameData) {
        messages.push({
          role: 'system',
          content: buildGalgameSystemInjection(msg.galgameData, true),
        });
      }
    } else if (msg.role === 'charA' || msg.role === 'charB') {
      messages.push({
        role: 'user',
        content: OTHER_CHAR_WRAPPER(msg.content),
      });
      if (msg.scribeUpdate?.isEnabled && msg.scribeUpdate.rawText?.trim()) {
        const tplScribe = params.tplStateBookPrefix || DEFAULT_TPL_STATE_BOOK_PREFIX;
        messages.push({
          role: 'system',
          content: tplScribe.replace('{content}', msg.scribeUpdate.rawText),
        });
      }
      // Galgame 非对称注入 — 情况 B: 属于旁观/NPC角色
      if (msg.galgameData) {
        messages.push({
          role: 'system',
          content: buildGalgameSystemInjection(msg.galgameData, false),
        });
      }
    } else if (msg.role === 'system') {
      // 用户手动植入的记忆结晶 / 状态书 system 节点，原样作为 system 消息注入
      messages.push({ role: 'system', content: msg.content });
    }
  }

  // ── 5. 结尾身份锚点：防止长对话中对方角色 user 消息密度过高时发生角色漂变 ──
  const tplAnchor = params.tplIdentityAnchor || DEFAULT_TPL_IDENTITY_ANCHOR;
  messages.push({
    role: 'system',
    content: tplAnchor
      .replace('{charName}', params.character.name)
      .replace('{otherCharName}', params.otherCharName),
  });

  metadata.tokenEstimate = usedTokens;

  return { messages, metadata };
}
