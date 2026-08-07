// ===== 基础枚举类型 =====

/** 消息角色 */
export type MessageRole = 'user' | 'charA' | 'charB' | 'system' | 'distilled' | 'scribe' | 'image';

/** 状态书插入策略模式 */
export type ScribeMode = 'charA' | 'charB' | 'auto';

/** 状态书引擎类型 */
export type ScribeEngine = 'module' | 'text' | 'galgame';

export type BodyStatus = 'healthy' | 'minor' | 'severe' | 'missing';

export type BodyPartId =
  | 'head' | 'torso'
  | 'leftUpperArm' | 'leftForearm' | 'leftHand'
  | 'rightUpperArm' | 'rightForearm' | 'rightHand'
  | 'leftThigh' | 'leftCalf' | 'leftFoot'
  | 'rightThigh' | 'rightCalf' | 'rightFoot';

export type ModuleRpgFieldId =
  | 'world.date' | 'world.location' | 'world.faction'
  | 'character.body' | 'character.health' | 'character.mood' | 'character.buffs'
  | 'character.currency' | 'character.inventory' | 'character.relationships'
  | 'events' | 'supportingCharacters' | 'note';

export interface ModuleRpgField {
  id: ModuleRpgFieldId;
  label: string;
  enabled: boolean;
  prompt: string;
}

/** A visible character panel in the modular Gal/RPG card. */
export interface ModuleRpgCharacterSlot {
  id: 'charA' | 'charB';
  enabled: boolean;
  /** Player-facing name used by the scribe when choosing a JSON character slot. */
  name: string;
}

/** A player-authored special condition that can be attached to body parts. */
export interface ModuleRpgBodySpecialPreset {
  /** Stable identifier emitted by the scribe AI. */
  id: string;
  /** Character panel this preset is allowed to update. */
  characterSlot: 'charA' | 'charB';
  /** Body part this preset is allowed to update. */
  bodyPart: BodyPartId;
  /** Short label shown beside the highlighted body part. */
  label: string;
  /** Matching guidance shown to the scribe AI. */
  description: string;
  /** Full player-authored text shown after clicking the body part. */
  displayText: string;
}

export interface ModuleRpgBodySpecialConfig {
  /** Off by default so existing conversations do not gain extra prompt tokens. */
  enabled: boolean;
  /** Functional prompt text remains editable by the player. */
  prompt: string;
  presets: ModuleRpgBodySpecialPreset[];
}

export interface ModuleRpgConfig {
  version: 1;
  fields: ModuleRpgField[];
  /** At most two independent character panels. */
  characterSlots?: ModuleRpgCharacterSlot[];
  /** Optional body-part special conditions, disabled by default. */
  bodySpecialStates?: ModuleRpgBodySpecialConfig;
}

export interface ModuleRpgCharacterState {
  id: 'charA' | 'charB';
  name: string;
  body: Partial<Record<BodyPartId, BodyStatus>>;
  /** Preset IDs only. Display text is resolved from the player configuration. */
  bodySpecialStates: Partial<Record<BodyPartId, string[]>>;
  health: string;
  mood: string;
  buffs: string[];
  currency: { label: string; value: string };
  inventory: string[];
  relationshipToUser: string;
  relationships: Array<{ target: string; value: string }>;
}

export interface ModuleRpgEvent {
  title: string;
  status: string;
  detail: string;
}

export interface ModuleRpgSupportingCharacter {
  name: string;
  role: string;
  location: string;
  attitude: string;
}

export interface ModuleRpgSnapshot {
  schemaVersion: 1;
  revision: number;
  world: { date: string; location: string; faction: string };
  characters: ModuleRpgCharacterState[];
  events: ModuleRpgEvent[];
  supportingCharacters: ModuleRpgSupportingCharacter[];
  note: string;
}

export interface ModuleRpgData {
  snapshot: ModuleRpgSnapshot;
  source: 'module' | 'legacy';
  diagnostics?: string[];
  rawResponse?: string;
  editedAt?: number;
}

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

/** MVU 兼容引擎的安全操作。仅保存已解析的字面量，不执行角色卡脚本。 */
export interface MvuOperation {
  op: 'set' | 'insert' | 'delete' | 'add' | 'move';
  path: string;
  value?: unknown;
  expectedValue?: unknown;
  from?: string;
  reason?: string;
}

export interface MvuSchemaNode {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'any';
  properties?: Record<string, MvuSchemaNode>;
  elementType?: MvuSchemaNode;
  extensible?: boolean;
  recursiveExtensible?: boolean;
  required?: string[];
}

export interface MvuSnapshot {
  statData: Record<string, unknown>;
  schema: MvuSchemaNode;
  initializedWorldBookIds: string[];
}

/**
 * 依附在 assistant 节点的 MVU 数据。每八个有效回复保存一个完整快照，
 * 其他节点只保存变更操作，分支可按自己的时间线回放。
 */
export interface MvuNodeData {
  scopeId: string;
  operations: MvuOperation[];
  checkpoint?: MvuSnapshot;
  /** Resolved state after this reply, used by the collapsible MVU chat card. */
  displayState?: Record<string, unknown>;
  displayChanges?: Array<{ path: string; oldValue: unknown; newValue: unknown; reason?: string }>;
  diagnostics?: string[];
  /** True when this reply's MVU output could not pass local protocol validation. */
  validationFailed?: boolean;
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
  /** Named local secret used to resolve apiKey at runtime. Never exported or synced. */
  secretId?: string;
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
  /** 空白对话首次加载该角色时展示的开场白 */
  firstMessage?: string;
  /** 酒馆 V2 备用开场白，仅在缺少第一句时作为降级来源保留 */
  alternateGreetings?: string[];
  /** 新建或绑定对话时，自动启用 MVU 状态解析。 */
  mvuEnabled?: boolean;
  /** 主世界书：手动维护、常驻设定 */
  worldBookId?: string;
  /** 缓存世界书：由状态书 AI 辅助维护，最多 10 条 */
  cacheWorldBookId?: string;
}

/** 会话 */
export interface Conversation {
  id: string;
  title: string;
  characterAId: string;
  characterBId: string;
  /** Traditional character cards use this value to replace {{user}}. */
  userName?: string;
  /** A short, per-conversation player identity injected with the character prompt. */
  userDescription?: string;
  /** 当前对话中角色 A/B 各自绑定的表情包；空值表示关闭 */
  stickerPackAId?: string;
  stickerPackBId?: string;
}

/** A user-saved public GitHub repository for browsing compatible character cards. */
export interface GitHubCharacterRepository {
  id: string;
  owner: string;
  repo: string;
  branch?: string;
  addedAt: number;
}

/** 表情包中的单张图片。Blob 直接存入 IndexedDB，避免 Base64 体积膨胀。 */
export interface StickerItem {
  id: string;
  label: string;
  mimeType: string;
  size: number;
  blob: Blob;
}

/** 本地表情包；全局最多 2 组，每组最多 8 张。 */
export interface StickerPack {
  id: string;
  name: string;
  stickers: StickerItem[];
  createdAt: number;
}

/** AI 表情标签解析后的结构化定位，不把协议正文带入后续上下文。 */
export interface StickerUsage {
  packId: string;
  stickerId: string;
  offset: number;
}

/** 会话文件夹：只收纳会话 ID，删除文件夹不会删除会话本体 */
export interface ImageGenerationRecord {
  channelId: string;
  channelName: string;
  anchorMessageId: string;
  positivePrompt: string;
  negativePrompt: string;
  size: string;
  aspectRatio: '1:1' | '3:4' | '16:9';
  style: string;
  userHint: string;
  scanRounds: number;
  worldBookEntryIds: string[];
  createdAt: number;
}

export interface GeneratedImageData {
  blob: Blob;
  mimeType: string;
  generation: ImageGenerationRecord;
}

/** 本机后台生图队列。任务不参与备份或同步，避免跨设备遗留无效密钥引用。 */
export type ImageGenerationTaskStatus = 'queued' | 'generating' | 'downloading' | 'retry_wait' | 'failed';

export interface ImageGenerationTask {
  id: string;
  conversationId: string;
  anchorMessageId: string;
  anchorTimestamp: number;
  /** 重新生成已有图片时直接替换该图片气泡。 */
  replaceImageNodeId?: string;
  generation: ImageGenerationRecord;
  status: ImageGenerationTaskStatus;
  /** 已完成的重试次数，不含首次请求。 */
  attempt: number;
  maxRetries: number;
  nextRetryAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImageGenerationTaskDraft {
  conversationId: string;
  anchorMessageId: string;
  anchorTimestamp: number;
  replaceImageNodeId?: string;
  generation: ImageGenerationRecord;
}

export interface ComfyUiMapping {
  version: 1;
  mappings: {
    positive_prompt: string[];
    negative_prompt?: string[];
    seed?: string[];
    width?: string[];
    height?: string[];
  };
  /** 固定写入的工作流输入，例如启用自定义分辨率。 */
  static?: Record<string, string | number | boolean>;
  outputNodeId: string;
  pollIntervalMs?: number;
}

export interface ImageChannel {
  id: string;
  name: string;
  /** 独立的 OpenAI 兼容生图 API 地址，不复用文字模型渠道。 */
  baseUrl: string;
  /** 密钥管理器中的引用；不会随业务备份导出。 */
  secretId?: string;
  /** 旧版本字段，仅用于读取迁移，不再由新 UI 写入。 */
  modelId?: string;
  imageModel: string;
  /** 浏览器等待同步生图响应的最长秒数；服务端任务不会因前端超时自动取消。 */
  requestTimeoutSeconds?: number;
  kind: 'openai' | 'novelai' | 'comfyui' | 'nano_banana';
  /** ComfyUI 的 API 格式工作流，按渠道保存在本机。 */
  comfyWorkflow?: Record<string, unknown>;
  comfyMapping?: ComfyUiMapping;
  createdAt: number;
}

export interface ConversationFolder {
  id: string;
  name: string;
  conversationIds: string[];
  isCollapsed: boolean;
  createdAt: number;
}

/** A server-sent event captured while debug mode is enabled. */
export interface DebugSseResponseEvent {
  sequence: number;
  kind: 'json' | 'done' | 'invalid_json';
  /** Exact JSON payload after the SSE data: prefix, or [DONE]. */
  rawData: string;
  /** Parsed server payload, retained alongside rawData for inspection. */
  data?: unknown;
  parseError?: string;
}

/** Debug-only streaming response snapshot. Request secrets are never included. */
export interface DebugSseResponse {
  format: 'easyjiuguanpro.sse-response-debug.v1';
  transport: 'sse' | 'json';
  capturedAt: number;
  events: DebugSseResponseEvent[];
  tokenUsage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
  finishReason?: string;
  /** DeepSeek-style reasoning_content collected separately from visible content. */
  reasoningContent?: string;
  /** Unfiltered assistant content assembled from stream deltas, including MVU blocks. */
  rawContent: string;
  /** Non-streaming tool fallback responses, captured only when debug mode is enabled. */
  auxiliaryResponses?: Array<{
    kind: 'mvu_fallback';
    rawResponse: unknown;
    content: string;
    reasoningContent?: string;
    operationCount: number;
    diagnostics: string[];
  }>;
}

/** 消息节点（扁平列表，每个对话一条时间线） */
export interface MessageNode {
  id: string;
  conversationId: string;
  role: MessageRole;
  senderName: string;
  content: string;
  /** 普通 user 消息原本发送给的角色，用于删除 AI 回复后准确重发。 */
  replyTarget?: 'charA' | 'charB';
  /** 用于蒸馏：标记已被蒸馏处理的节点 */
  isArchived: boolean;
  timestamp: number;
  /** 该消息发送时激活的世界书条目（仅 user 消息，用于展示） */
  activatedWorldBookEntries?: { id: string; name: string }[];
  /** 调试模式下，此 AI 回复实际使用的完整 Prompt */
  debugPrompt?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  /** 调试模式下服务端实际返回的 SSE 数据，不包含请求密钥。 */
  debugResponse?: DebugSseResponse;
  /** 该消息发送时预估消耗的上下文 token 总数 */
  tokenEstimate?: number;
  /** 是否手动植入了记忆结晶 & 状态书 */
  implantedMemory?: boolean;
  /** 状态书吸附属性 — 仅 assistant (charA/charB) 节点使用 */
  scribeUpdate?: ScribeUpdate;
  /** Galgame 数值引擎数据 — 仅 galgame 模式下使用 */
  galgameData?: GalgameData;
  /** 模块化 Gal/RPG 引擎状态，绑定到生成该状态的角色回复。 */
  moduleRpgData?: ModuleRpgData;
  /** MVU 兼容变量状态的节点级操作/快照 */
  mvuData?: MvuNodeData;
  /** AI 在正文中调用的本地表情包及其插入位置 */
  stickerUsages?: StickerUsage[];
  /** Present only when role is image; never included in chat context. */
  imageData?: GeneratedImageData;
  /** 本消息消耗的 token 数（completion tokens），优先从 API usage 获取精确值 */
  tokenCost?: number;
  /** tokenCost 是否来自 API 原生返回（true=精确值，false/undefined=暴力估计） */
  tokenCostIsExact?: boolean;
  /** 输入 token 数（prompt tokens），来自 API usage 或上下文估算 */
  tokenCostInput?: number;
  /** 总 token 数（input + output），用于直观显示 */
  tokenCostTotal?: number;
  /** 支持思考模式的服务商返回的推理 token，已包含在 tokenCost 内。 */
  tokenCostReasoning?: number;
  /** 状态书/Galgame 引擎单独消耗的 token 数（独立 API 调用） */
  scribeTokenCost?: number;
  /** 蒸馏批次元数据；新版本结晶为累计摘要，上下文只需注入最新一份 */
  distillationMeta?: {
    sourceNodeIds: string[];
    roundStart: number;
    roundEnd: number;
    cumulative: boolean;
  };
}

/** 世界书（World Book）条目 */
export interface WorldBookEntry {
  id: string;
  keys: string[];
  value: string;
  priority: number;
  /** 酒馆 constant 条目：无关键词也应在每次组装提示词时注入。 */
  alwaysActive?: boolean;
  /** 酒馆世界书的备注/标签，用于识别 [InitVar]、[mvu_update]、[mvu_plot]。 */
  comment?: string;
}

/** 世界书 */
export interface WorldBook {
  id: string;
  name: string;
  entries: WorldBookEntry[];
  /** cache = 状态书 AI 辅助维护的缓存世界书 */
  kind?: 'manual' | 'cache';
  entryLimit?: number;
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
  /** 状态书 AI 是否同时维护绑定角色的缓存世界书 */
  scribeCacheWorldBookEnabled?: boolean;
  /** 是否让该对话的角色回复解析 MVU <UpdateVariable> 变更。 */
  mvuEnabled?: boolean;
  /** 状态书插入策略模式 */
  scribeMode?: ScribeMode;
  scribeEngine?: ScribeEngine;
  galgamePrompt?: string;
  moduleRpgConfig?: ModuleRpgConfig;
  moduleRpgPrompt?: string;
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
  /** Reuse one pre-response context snapshot for multiple sequential replies. */
  contextSnapshot?: {
    unarchived: MessageNode[];
    distilledCandidates: MessageNode[];
    scanTimeline: MessageNode[];
    allNodes: MessageNode[];
  };
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
  /** 滑动窗口：强制保留最近 N 个完整对话轮次不参与蒸馏，默认 3 */
  retainRecentCount: number;
}

// ===== 上下文拼装 =====

/** 上下文拼装配接 */
export interface ContextAssemblyConfig {
  /** 最近保留轮数，默认 20 */
  recentRounds: number;
  /** 世界书扫描时额外追溯的历史 user 消息条数，不含最新 user 消息 */
  worldBookScanDepth: number;
  /** 最大注入记忆数，决定 AI 最多看到多少条记忆，默认 5 */
  maxInjectedMemories: number;
  /** 单次请求最多注入的世界书条目数 */
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
  /** 对话角色 A 使用的模型 ID */
  currentCharAModelId: string | null;
  /** 对话角色 B 使用的模型 ID */
  currentCharBModelId: string | null;
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
  /** 状态书 AI 是否同时维护绑定角色的缓存世界书 */
  scribeCacheWorldBookEnabled: boolean;
  /** MVU 变量兼容模式的全局默认开关；对话级配置优先。 */
  mvuEnabled: boolean;
  /** 状态书注入间隔（每 N 轮注入一次），默认 1=每轮 */
  scribeInterval: number;
  /** 状态书 AI 自动总结触发间隔（每 N 轮触发一次），默认 5 */
  scribeTriggerInterval: number;
  /** 每次状态书总结的对话轮数（默认 4，最低 2），对话拆分为逐轮 user 消息 */
  scribeRounds: number;
  /** 第三书记员自定义 System Prompt */
  scribeSystemPrompt: string;
  /** 状态书插入策略模式 */
  scribeMode: ScribeMode;
  /** 状态书引擎类型：module 为模块化 Gal/RPG；旧值仅用于历史兼容。 */
  scribeEngine: ScribeEngine;
  /** Galgame 引擎自定义 Prompt（空则使用默认） */
  galgamePrompt: string;
  moduleRpgConfig: ModuleRpgConfig;
  moduleRpgPrompt: string;
  /** 互相认识功能自定义观察提示词（空则使用默认） */
  mutualObservePrompt: string;
  /** 思考模式开关 */
  thinkingEnabled: boolean;
  /** Whether chat completions use server-sent event streaming. */
  streamingEnabled: boolean;
  /** 调试模式 — 显示原始 Prompt 导出按钮 */
  debugMode: boolean;
  /** 低速率模式 — 针对限速 API（如 GLM-4-Flash）启用请求节流 + 429 自动重试 */
  lowRateMode: boolean;
  /** 表情包总开关；角色仍需在具体对话中绑定表情包 */
  stickerEnabled: boolean;
  /** 玩家控制的每次回复表情数量上限，默认 2 */
  stickerMaxCount: number;
  currentImageChannelId: string | null;
  /** 负责组装生图提示词的文字模型。实际生图由 currentImageChannelId 负责。 */
  currentImagePromptModelId: string | null;
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
  tplCacheWorldBookPrompt: string;
  tplReverseEngineer: string;
  tplStickerPrompt: string;
  tplMvuPrompt: string;
  tplMvuFallbackPrompt: string;
  tplImagePrompt: string;
  tplComfyMappingPrompt: string;
}

/** App Action（useReducer） */
export type AppAction =
  | { type: 'SET_VIEW'; view: ViewType }
  | { type: 'SET_CONVERSATION'; id: string | null }
  | { type: 'SET_CURRENT_CONVERSATION'; id: string | null }
  | { type: 'SET_CHAR_A_MODEL'; id: string | null }
  | { type: 'SET_CHAR_B_MODEL'; id: string | null }
  | { type: 'SET_DISTILL_MODEL'; id: string | null }
  | { type: 'SET_IMAGE_PROMPT_MODEL'; id: string | null }
  | { type: 'SET_SCRIBE_MODEL'; id: string | null }
  | { type: 'SET_MOBILE'; isMobile: boolean }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_THEME'; theme: ThemeMode }
  | { type: 'SET_WALLPAPER'; config: Partial<WallpaperConfig> }
  | { type: 'SET_BOLD_COLORIZE'; enabled: boolean }
  | { type: 'SET_SCRIBE_ENABLED'; enabled: boolean }
  | { type: 'SET_SCRIBE_CACHE_WORLDBOOK_ENABLED'; enabled: boolean }
  | { type: 'SET_SCRIBE_INTERVAL'; interval: number }
  | { type: 'SET_SCRIBE_TRIGGER_INTERVAL'; interval: number }
  | { type: 'SET_SCRIBE_ROUNDS'; rounds: number }
  | { type: 'SET_SCRIBE_SYSTEM_PROMPT'; prompt: string }
  | { type: 'SET_SCRIBE_MODE'; mode: ScribeMode }
  | { type: 'SET_SCRIBE_ENGINE'; engine: ScribeEngine }
  | { type: 'SET_GALGAME_PROMPT'; prompt: string }
  | { type: 'SET_MODULE_RPG_CONFIG'; config: ModuleRpgConfig }
  | { type: 'SET_MODULE_RPG_PROMPT'; prompt: string }
  | { type: 'SET_MUTUAL_OBSERVE_PROMPT'; prompt: string }
  | { type: 'TOGGLE_THINKING' }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'TOGGLE_STREAMING' }
  | { type: 'SET_LOW_RATE_MODE'; enabled: boolean }
  | { type: 'SET_STICKER_ENABLED'; enabled: boolean }
  | { type: 'SET_STICKER_MAX_COUNT'; count: number }
  | { type: 'SET_IMAGE_CHANNEL'; id: string | null }
  | { type: 'SET_MVU_ENABLED'; enabled: boolean }
  | { type: 'UPDATE_DISTILLATION_CONFIG'; config: Partial<DistillationConfig> }
  | { type: 'UPDATE_CONTEXT_CONFIG'; config: Partial<ContextAssemblyConfig> }
  | { type: 'SET_ADV_TPL'; key: string; value: string };
