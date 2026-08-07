import type {
  Character,
  WorldBookEntry,
  MessageNode,
  AssembledContext,
  AssembledMessage,
  MessageRole,
  ModuleRpgConfig,
} from '../types';
import { buildModuleRpgSystemInjection, findLatestModuleRpgData } from './moduleRpg';
import {
  DEFAULT_TPL_USER_WRAPPER,
  DEFAULT_TPL_OTHER_CHAR_WRAPPER,
  DEFAULT_TPL_IDENTITY_ANCHOR,
  DEFAULT_TPL_WORLD_BOOK_PREFIX,
  DEFAULT_TPL_DISTILLED_PREFIX,
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
  /** 是否跳过自动注入的 distilled（因为用户已手动植入到消息内容里） */
  skipAutoDistilled?: boolean;
  // 高级提示词模板覆盖（空=用默认）
  tplUserWrapper?: string;
  tplOtherCharWrapper?: string;
  tplIdentityAnchor?: string;
  tplWorldBookPrefix?: string;
  tplDistilledPrefix?: string;
  tplStateBookPrefix?: string;
  /** Per-conversation player identity for SillyTavern {{user}} compatibility. */
  userName?: string;
  userDescription?: string;
  /** 追加在角色系统提示词末尾的可选功能提示词（如表情包控制） */
  appendedSystemPrompt?: string;
  /** 当前模块化 Gal/RPG 的字段配置，用于解析身体特殊状态的玩家文本。 */
  moduleRpgConfig?: ModuleRpgConfig;
}

export function replaceSillyTavernUserPlaceholders(text: string, userName?: string): string {
  return text.replace(/\{\{\s*user\s*\}\}/gi, userName?.trim() || '用户');
}

/** 粗略 Token 估算：1 字符 ≈ 0.5 Token */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length * 0.5);
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
 * 世界书注入：
 *   - 条目是否注入完全取决于本次的扫描窗口是否命中
 *   - 世界书正文只在本次 API 请求中作为 system 消息临时组装
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
  const userName = params.userName?.trim() || '用户';
  const userDescription = params.userDescription?.trim() || '';
  const replaceUser = (text: string) => replaceSillyTavernUserPlaceholders(text, userName);
  const recentBudget = Math.min(Math.floor(maxTokens * 0.25), Math.max(600, Math.floor(maxTokens * 0.15)));
  const highPriorityBudget = maxTokens - recentBudget;
  let usedTokens = 0;

  const sorted = [...params.recentMessages].sort((a, b) => a.timestamp - b.timestamp);

  // ── 1. 高优先级：System Prompt ──
  if (params.character.systemPrompt?.trim() || params.appendedSystemPrompt?.trim()) {
    const content = replaceUser([params.character.systemPrompt?.trim(), params.appendedSystemPrompt?.trim()]
      .filter(Boolean)
      .join('\n\n'));
    messages.push({ role: 'system', content });
    usedTokens += estimateTokens(content);
  }

  if (params.userName?.trim() || userDescription) {
    const content = [
      '【交互用户身份】',
      `当前正在交互的用户是：${userName}`,
      userDescription ? `用户的一句话设定：${replaceUser(userDescription)}` : '',
    ].filter(Boolean).join('\n');
    messages.push({ role: 'system', content });
    usedTokens += estimateTokens(content);
  }

  // ── 2. 世界书（仅注入本次扫描窗口命中的条目） ──
  const seenWorldBookValues = new Set<string>();
  for (const entry of params.worldbookEntries) {
    const valueSignature = entry.value.trim().replace(/\s+/g, ' ').toLowerCase();
    if (seenWorldBookValues.has(valueSignature)) continue;

    const keyLabel = entry.keys?.[0] || '未知';
    const content = replaceUser((params.tplWorldBookPrefix || DEFAULT_TPL_WORLD_BOOK_PREFIX)
      .replace('{key}', keyLabel).replace('{value}', entry.value));
    const entryTokens = estimateTokens(content);

    if (usedTokens + entryTokens > highPriorityBudget) break;

    messages.push({ role: 'system', content });
    metadata.worldBookMatches.push(entry.id);
    metadata.activatedWorldBookEntries.push({ id: entry.id, name: keyLabel });
    usedTokens += entryTokens;
    seenWorldBookValues.add(valueSignature);
  }

  // ── 3. 高优先级：蒸馏摘要（记忆结晶，仅在未手动植入时自动注入） ──
  if (!params.skipAutoDistilled) {
    for (const node of params.distilledNodes) {
      const content = replaceUser((params.tplDistilledPrefix || DEFAULT_TPL_DISTILLED_PREFIX)
      .replace('{content}', node.content));
      const nodeTokens = estimateTokens(content);

      if (usedTokens + nodeTokens > highPriorityBudget) break;

      messages.push({ role: 'system', content });
      metadata.distilledNodesUsed.push(node.id);
      usedTokens += nodeTokens;
    }
  }

  // 模块化 Gal/RPG 只注入最近一份有效快照，避免历史状态逐条回音式累积。
  const latestModuleState = findLatestModuleRpgData(sorted);
  if (latestModuleState) {
    const content = buildModuleRpgSystemInjection(latestModuleState, params.character.name, params.moduleRpgConfig);
    const stateTokens = estimateTokens(content);
    if (usedTokens + stateTokens <= highPriorityBudget) {
      messages.push({ role: 'system', content });
      usedTokens += stateTokens;
    }
  }

  metadata.highPriorityTokens = usedTokens;

  // ── 4. 低优先级：最近对话历史 —— 逆序截断 ──
  // 旧状态书与 Galgame 数据会在 findLatestModuleRpgData 中即时映射为最新快照。
  const accepted: MessageNode[] = [];

  // 角色隔离包裹头（支持用户自定义模板覆盖）
  const tplUser = replaceUser(params.tplUserWrapper || DEFAULT_TPL_USER_WRAPPER);
  const tplOther = replaceUser(params.tplOtherCharWrapper || DEFAULT_TPL_OTHER_CHAR_WRAPPER);
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
    } else if (msg.role === 'charA' || msg.role === 'charB') {
      estimated = estimateTokens(OTHER_CHAR_WRAPPER(msg.content));
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

  // 正序输出消息。模块化状态已在上方作为唯一最新快照注入。
  for (const msg of accepted) {
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: USER_WRAPPER(msg.content) });
    } else if (msg.role === params.targetRole) {
      messages.push({ role: 'assistant', content: replaceUser(msg.content) });
    } else if (msg.role === 'charA' || msg.role === 'charB') {
      messages.push({
        role: 'user',
        content: OTHER_CHAR_WRAPPER(replaceUser(msg.content)),
      });
    } else if (msg.role === 'system') {
      // 用户手动植入的记忆结晶 / 状态书 system 节点，原样作为 system 消息注入
      messages.push({ role: 'system', content: msg.content });
    }
  }

  // ── 5. 结尾身份锚点：防止长对话中对方角色 user 消息密度过高时发生角色漂变 ──
  const tplAnchor = params.tplIdentityAnchor || DEFAULT_TPL_IDENTITY_ANCHOR;
  messages.push({
    role: 'system',
      content: replaceUser(tplAnchor)
      .replace('{charName}', params.character.name)
      .replace('{otherCharName}', params.otherCharName),
  });

  metadata.tokenEstimate = usedTokens;

  return { messages, metadata };
}
