// ===== 基础枚举类型 =====

/** 消息角色 */
export type MessageRole = 'user' | 'charA' | 'charB' | 'system' | 'distilled' | 'scribe';

/** 状态书插入策略模式 */
export type ScribeMode = 'charA' | 'charB' | 'auto';

/** 状态书引擎类型 */
export type ScribeEngine = 'text' | 'galgame';

/** Galgame 数值引擎数据 — 依附于 assistant 消息节点 */
export interface GalgameData {
  name: string;
  health: string;
  mood: string;
  /** 警惕度 0-100 */
  vigilance: number;
  /** 表好感度 -100 到 100 */
  surfaceAffinity: number;
  /** 里好感度 -100 到 100 */
  hiddenAffinity: number;
}

/** 状态书吸附属性 — 绑定到 assistant 消息节点 */
export interface ScribeUpdate {
  /** 独立书记官生成的当前状态书内容 */
  rawText: string;
  /** 此节点是否成功插入了状态书 */
  isEnabled: boolean;
  /** 触发时的模式 */
  mode: ScribeMode;
}

/** 视图类型 */
export type ViewType = 'conversations' | 'worldbook' | 'characters' | 'statebook' | 'settings';

/** 发送目标类型 */
export type SendTargetType = 'charA' | 'charB' | 'charB_eavesdrop';

// ===== 核心数据模型 =====

/** AI 模型配置 */
export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  /** 延迟：-1 未测试, -2 超时, -3 Error/CORS, >=0 正常延迟(ms) */
  latency: number;
  /** 模型最大上下文 Token 数，用于上下文截断，默认 4000 */
  maxContextTokens: number;
  /** 采样温度（0-2），默认 0.8 */
  temperature: number;
  /** Top-P 核采样（0-1），默认 0.95 */
  topP: number;
}

/** 角色（头像支持 emoji / base64 data URI / SVG） */
export interface Character {
  id: string;
  name: string;
  /** 头像：emoji 字符 或 data:image/...;base64,... 格式 */
  avatar: string;
  systemPrompt: string;
  worldBookId?: string;
}

/** 会话 */
export interface Conversation {
  id: string;
  title: string;
  characterAId: string;
  characterBId: string;
}

/** 消息节点（扁平列表，每个对话一条时间线） */
export interface MessageNode {
  id: string;
  conversationId: string;
  role: MessageRole;
  senderName: string;
  content: string;
  /** 用于蒸馏：标记已被蒸馏处理的节点 */
  isArchived: boolean;
  timestamp: number;
  /** 该消息发送时激活的世界书条目（仅 user 消息，用于展示） */
  activatedWorldBookEntries?: { id: string; name: string }[];
  /** 该消息发送时预估消耗的上下文 token 总数 */
  tokenEstimate?: number;
  /** 是否手动植入了记忆结晶 & 状态书 */
  implantedMemory?: boolean;
  /** 状态书吸附属性 — 仅 assistant (charA/charB) 节点使用 */
  scribeUpdate?: ScribeUpdate;
  /** Galgame 数值引擎数据 — 仅 galgame 模式下使用 */
  galgameData?: GalgameData;
  /** 本消息消耗的 token 数（completion tokens），优先从 API usage 获取精确值 */
  tokenCost?: number;
  /** tokenCost 是否来自 API 原生返回（true=精确值，false/undefined=暴力估计） */
  tokenCostIsExact?: boolean;
}

/** 世界书（World Book）条目 */
export interface WorldBookEntry {
  id: string;
  keys: string[];
  value: string;
  priority: number;
}

/** 世界书 */
export interface WorldBook {
  id: string;
  name: string;
  entries: WorldBookEntry[];
}

/** 全局状态记录（每个对话独立一份） */
export interface GlobalState {
  conversationId: string;
  scribeContent: string;
  /** 以下为每对话独立的书记员配置 */
  scribeEnabled?: boolean;
  scribeInterval?: number;
  scribeTriggerInterval?: number;
  scribeSystemPrompt?: string;
  scribeModelId?: string | null;
  /** 状态书插入策略模式 */
  scribeMode?: ScribeMode;
  scribeEngine?: ScribeEngine;
  galgamePrompt?: string;
}

// ===== 发送 =====

/** 发送目标 */
export interface SendTarget {
  type: SendTargetType;
  characterId: string;
}

/**
 * sendMessage 的可选参数。
 * - `skipUserNode`：跳过插入新的 user 节点（用于重新生成场景，复用既有 user 节点）。
 * - `existingUserNodeId`：当 skipUserNode=true 时，指定要复用的既有 user 节点 ID。
 */
export interface SendOptions {
  skipUserNode?: boolean;
  existingUserNodeId?: string;
}

// ===== 浓缩/蒸馏 =====

/** 蒸馏结果 */
export interface DistillationResult {
  roundStart: number;
  roundEnd: number;
  summary: string;
  nodeId: string;
}

/** 蒸馏配置 */
export interface DistillationConfig {
  /** 触发阈值（对话轮数），默认 10 */
  triggerThreshold: number;
  /** 浓缩浓度 1-10，默认 5 */
  concentration: number;
  /** 是否自动触发，默认 false */
  autoTrigger: boolean;
  /** 自定义蒸馏提示词模板，{dialogue} 会被替换为对话文本 */
  distillationPrompt: string;
}

// ===== 上下文拼装 =====

/** 上下文拼装配接 */
export interface ContextAssemblyConfig {
  /** 最近保留轮数，默认 20 */
  recentRounds: number;
  /** 最大蒸馏节点数，默认 5 */
  maxDistilledNodes: number;
  /** 最大世界书条目数，固定 3 */
  maxWorldBookEntries: number;
}

// ===== SSE =====

/** SSE 数据块 */
export interface SSEChunk {
  content: string;
  done: boolean;
}

// ===== 拼装结果 =====

/** 拼装后的消息 */
export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 拼装后的上下文 */
export interface AssembledContext {
  messages: AssembledMessage[];
  metadata: {
    worldBookMatches: string[];
    archivedCount: number;
    distilledNodesUsed: string[];
    /** 本次上下文预估总 token 数 */
    tokenEstimate: number;
    /** 高优先级内容（system + scribe + worldbook + distilled）消耗的 token */
    highPriorityTokens: number;
    /** 本次实际激活的世界书条目（用于展示） */
    activatedWorldBookEntries: { id: string; name: string }[];
  };
}

// ===== App 全局状态 =====

/** 主题模式 */
export type ThemeMode = 'light' | 'dark';

/** 壁纸遮罩模式 */
export type WallpaperOverlayMode = 'light' | 'dark';

/** 壁纸配置 */
export interface WallpaperConfig {
  /** base64 data URI，空字符串=无壁纸 */
  image: string;
  /** 遮罩透明度 0-1，0=无遮罩，1=全遮罩 */
  overlayOpacity: number;
  /** 遮罩颜色模式 */
  overlayMode: WallpaperOverlayMode;
}

/** App 全局状态 */
export interface AppState {
  activeView: ViewType;
  currentConversationId: string | null;
  currentChatModelId: string | null;
  currentDistillModelId: string | null;
  /** 状态书总结模型 ID（第三书记员专用通道） */
  currentScribeModelId: string | null;
  isMobile: boolean;
  sidebarOpen: boolean;
  /** 全局主题模式 */
  theme: ThemeMode;
  /** 壁纸配置 */
  wallpaper: WallpaperConfig;
  /** AI 气泡加粗变色 — 开启后 AI 气泡内的加粗文字按角色色系着色 */
  boldColorize: boolean;
  /** 状态书是否启用 */
  scribeEnabled: boolean;
  /** 状态书注入间隔（每 N 轮注入一次），默认 1=每轮 */
  scribeInterval: number;
  /** 状态书 AI 自动总结触发间隔（每 N 轮触发一次），默认 5 */
  scribeTriggerInterval: number;
  /** 第三书记员自定义 System Prompt */
  scribeSystemPrompt: string;
  /** 状态书插入策略模式 */
  scribeMode: ScribeMode;
  /** 状态书引擎类型：text 传统文本 / galgame 数值引擎 */
  scribeEngine: ScribeEngine;
  /** Galgame 引擎自定义 Prompt（空则使用默认） */
  galgamePrompt: string;
  /** 互相认识功能自定义观察提示词（空则使用默认） */
  mutualObservePrompt: string;
  /** 思考模式开关 */
  thinkingEnabled: boolean;
  /** 调试模式 — 显示原始 Prompt 导出按钮 */
  debugMode: boolean;
  /** 低速率模式 — 针对限速 API（如 GLM-4-Flash）启用请求节流 + 429 自动重试 */
  lowRateMode: boolean;
  distillationConfig: DistillationConfig;
  contextConfig: ContextAssemblyConfig;
  // 高级提示词模板（空=用默认）
  tplUserWrapper: string;
  tplOtherCharWrapper: string;
  tplIdentityAnchor: string;
  tplWorldBookPrefix: string;
  tplDistilledPrefix: string;
  tplStateBookPrefix: string;
  tplEavesdropAppend: string;
  tplGalgameCharInjection: string;
  tplImplantMemoryPrefix: string;
  tplImplantScribePrefix: string;
  tplDistilledNodePrefix: string;
  tplReverseEngineer: string;
}

/** App Action（useReducer） */
export type AppAction =
  | { type: 'SET_VIEW'; view: ViewType }
  | { type: 'SET_CONVERSATION'; id: string | null }
  | { type: 'SET_CURRENT_CONVERSATION'; id: string | null }
  | { type: 'SET_CHAT_MODEL'; id: string | null }
  | { type: 'SET_DISTILL_MODEL'; id: string | null }
  | { type: 'SET_SCRIBE_MODEL'; id: string | null }
  | { type: 'SET_MOBILE'; isMobile: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_THEME'; theme: ThemeMode }
  | { type: 'SET_WALLPAPER'; config: Partial<WallpaperConfig> }
  | { type: 'SET_BOLD_COLORIZE'; enabled: boolean }
  | { type: 'SET_SCRIBE_ENABLED'; enabled: boolean }
  | { type: 'SET_SCRIBE_INTERVAL'; interval: number }
  | { type: 'SET_SCRIBE_TRIGGER_INTERVAL'; interval: number }
  | { type: 'SET_SCRIBE_SYSTEM_PROMPT'; prompt: string }
  | { type: 'SET_SCRIBE_MODE'; mode: ScribeMode }
  | { type: 'SET_SCRIBE_ENGINE'; engine: ScribeEngine }
  | { type: 'SET_GALGAME_PROMPT'; prompt: string }
  | { type: 'SET_MUTUAL_OBSERVE_PROMPT'; prompt: string }
  | { type: 'TOGGLE_THINKING' }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'SET_LOW_RATE_MODE'; enabled: boolean }
  | { type: 'UPDATE_DISTILLATION_CONFIG'; config: Partial<DistillationConfig> }
  | { type: 'UPDATE_CONTEXT_CONFIG'; config: Partial<ContextAssemblyConfig> }
  | { type: 'SET_ADV_TPL'; key: string; value: string };
