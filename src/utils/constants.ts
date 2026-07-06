import type { DistillationConfig, ContextAssemblyConfig, MessageRole } from '../types';

// ===== localForage Store Keys =====

export const DB_KEYS = {
  models: 'tavern_models',
  characters: 'tavern_characters',
  conversations: 'tavern_conversations',
  messageNodes: 'tavern_message_nodes',
  worldbooks: 'tavern_worldbooks',
  globalStates: 'tavern_global_states',
} as const;

// ===== 默认配置 =====

/** 默认蒸馏提示词模板 — {dialogue} 会被替换为对话文本 */
export const DEFAULT_DISTILLATION_PROMPT =
  '请将以下对话内容浓缩为简洁的摘要，保留关键情节、人物态度变化和重要信息：\n\n{dialogue}';

export const DEFAULT_DISTILLATION_CONFIG: DistillationConfig = {
  triggerThreshold: 10,
  concentration: 5,
  autoTrigger: false,
  distillationPrompt: DEFAULT_DISTILLATION_PROMPT,
};

export const DEFAULT_CONTEXT_CONFIG: ContextAssemblyConfig = {
  recentRounds: 20,
  maxDistilledNodes: 5,
  maxWorldBookEntries: 3,
};

/** 状态书 AI 自动总结触发间隔（默认 5 轮） */
export const DEFAULT_SCRIBE_TRIGGER_INTERVAL = 5;

/** 第三书记员 System Prompt — 上下文绝对隔离，仅接收纯对话文本 */
export const SCRIBE_SYSTEM_PROMPT =
  '你是不参与对话的独立客观书记官。请根据以下最近的对话内容，冷酷、客观地更新并精简当前的环境状态、时间、地点、交互物品状态及角色间的好感度变化。不要输出任何对话，仅输出最新的状态面板。';

/** 互相认识功能默认观察提示词 — {charPrompt} 为角色卡 systemPrompt 占位符 */
export const DEFAULT_MUTUAL_OBSERVE_PROMPT =
  '输出下方角色设定的第三人称外观描述（50-100字，只描述外貌、衣着、装备、体态、种族、可见气质等外部可观察信息。禁止内心分析、推理过程、解释与备注）。不要任何其他文字，立即开始：\n\n角色设定：\n{charPrompt}';

// ===== 高级提示词模板默认值 =====
// 所有模板使用 {占位符} 语法，运行时由 context.ts / useChat.ts 等消费方替换

/** 用户消息包裹模板 — {content} 为用户输入 */
export const DEFAULT_TPL_USER_WRAPPER = '【交互用户 (真正的 user) · 场景输入】\n「 {content} 」';

/** 对方角色消息包裹模板 — {otherCharName} 为对方角色名，{content} 为发言内容 */
export const DEFAULT_TPL_OTHER_CHAR_WRAPPER = '【独立实体 ({otherCharName}) · 场景输入】\n「 {content} 」';

/** 结尾身份锚点模板 — {charName} 为当前角色名，{otherCharName} 为对方角色名 */
export const DEFAULT_TPL_IDENTITY_ANCHOR =
  '[当前角色: {charName}] 请以 {charName} 的身份回复。';

/** 世界书注入前缀 — {key} 为词条首关键词，{value} 为词条内容 */
export const DEFAULT_TPL_WORLD_BOOK_PREFIX = '[世界设定: {key}] {value}';

/** 蒸馏摘要注入前缀 — {content} 为摘要内容 */
export const DEFAULT_TPL_DISTILLED_PREFIX = '[之前的对话摘要]\n{content}';

/** 状态书注入前缀 — {content} 为状态书内容 */
export const DEFAULT_TPL_STATE_BOOK_PREFIX = '[状态书更新]\n{content}';

/** 旁听附加指令 — 追加到角色 systemPrompt 末尾 */
export const DEFAULT_TPL_EAVESDROP_APPEND = '\n\n请基于以上对话内容，以你的角色身份给出一个自然的观察或反应。仅输出你的发言内容，不要输出描述或动作标记。';

/** Galgame 角色性格注入包装 — {charPrompt} 为角色卡 systemPrompt */
export const DEFAULT_TPL_GALGAME_CHAR_INJECTION = '{这是当前角色的角色提示词，状态书请以此角色逻辑判断感情}\n{charPrompt}';

/** 植入记忆结晶前缀 — {content} 为记忆内容 */
export const DEFAULT_TPL_IMPLANT_MEMORY_PREFIX = '[记忆结晶]\n{content}';

/** 植入状态书前缀 — {content} 为状态书内容 */
export const DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX = '[状态书]\n{content}';

/** 蒸馏节点生成格式 — {total} 为总轮数，{summary} 为摘要内容 */
export const DEFAULT_TPL_DISTILLED_NODE_PREFIX = '📝 记忆 第1轮-第{total}轮：{summary}';

// ===== Ping =====

export const PING_TIMEOUT = 10000;

// ===== UI 常量 =====

export const BUBBLE_COLORS: Record<MessageRole, string> = {
  user: 'bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white shadow-md shadow-blue-500/10',
  charA: 'bg-emerald-50/90 dark:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-700/30 text-emerald-950 dark:text-emerald-50 shadow-sm backdrop-blur-sm',
  charB: 'bg-violet-50/90 dark:bg-violet-900/40 border border-violet-200/60 dark:border-violet-700/30 text-violet-950 dark:text-violet-50 shadow-sm backdrop-blur-sm',
  system: 'bg-slate-200/70 dark:bg-slate-700/50 border border-slate-300/50 dark:border-slate-600/50 text-slate-700 dark:text-slate-300',
  distilled: 'bg-amber-50/70 dark:bg-amber-900/30 border border-dashed border-amber-300 dark:border-amber-700/50 text-amber-900 dark:text-amber-100',
  scribe: 'bg-amber-50/50 dark:bg-amber-900/20 border border-amber-300/40 dark:border-amber-700/40 text-amber-900 dark:text-amber-100',
};

export const BUBBLE_ALIGN: Record<MessageRole, string> = {
  user: 'justify-end',
  charA: 'justify-start',
  charB: 'justify-start',
  system: 'justify-center',
  distilled: 'justify-center',
  scribe: 'justify-center',
};

export const ROLE_LABELS: Record<MessageRole, string> = {
  user: '👤 你',
  charA: '💬',
  charB: '💬',
  system: '⚙️ 系统',
  distilled: '💎 记忆结晶',
  scribe: '📜 状态书',
};

/** 图片压缩目标宽度 */
export const AVATAR_MAX_WIDTH = 200;
/** 图片压缩质量 (0-1) */
export const AVATAR_QUALITY = 0.7;
