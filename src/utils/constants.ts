import type { DistillationConfig, ContextAssemblyConfig, MessageRole } from '../types';

// ===== localForage Store Keys =====

export const DB_KEYS = {
  models: 'tavern_models',
  secrets: 'tavern_secret_vault',
  characters: 'tavern_characters',
  conversations: 'tavern_conversations',
  conversationFolders: 'tavern_conversation_folders',
  messageNodes: 'tavern_message_nodes',
  worldbooks: 'tavern_worldbooks',
  stickerPacks: 'tavern_sticker_packs',
  imageChannels: 'tavern_image_channels',
  imageTasks: 'tavern_image_tasks',
  globalStates: 'tavern_global_states',
} as const;

export const MAX_STICKER_PACKS = 2;
export const MAX_STICKERS_PER_PACK = 8;
export const MAX_ANIMATED_STICKER_BYTES = Math.floor(1.8 * 1024 * 1024);
export const DEFAULT_STICKER_MAX_COUNT = 2;
export const DEFAULT_IMAGE_WORLD_BOOK_LIMIT = 5;
export const DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS = 720;
export const MIN_IMAGE_REQUEST_TIMEOUT_SECONDS = 60;
export const MAX_IMAGE_REQUEST_TIMEOUT_SECONDS = 1800;
export const NOVELAI_IMAGE_API_URL = 'https://image.novelai.net/ai/generate-image';
export const NOVELAI_DEFAULT_IMAGE_MODEL = 'nai-diffusion-4-5-full';
export const NANO_BANANA_IMAGE_API_URL = 'https://generativelanguage.googleapis.com/v1';
export const NANO_BANANA_DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

/** AI 自动分析 ComfyUI API 工作流时使用。{workflow} 由程序只读注入。 */
export const DEFAULT_TPL_COMFY_MAPPING_PROMPT = `你是 ComfyUI API 工作流映射助手。根据以下节点摘要，建立 Easy酒馆Pro 生图字段到现有节点输入的映射。你只能映射已有的非连线输入；绝对不要改写形如 ["节点ID", 输出序号] 的连线。

只输出一个合法 JSON 对象，不要 Markdown、解释或思考：
{"version":1,"mappings":{"positive_prompt":["节点.inputs.字段"],"negative_prompt":["节点.inputs.字段"],"seed":["节点.inputs.字段"],"width":["节点.inputs.字段"],"height":["节点.inputs.字段"]},"static":{"可选静态路径":true},"output_node_id":"最终 SaveImage 或 PreviewImage 节点 ID","poll_interval_ms":1500}

规则：positive_prompt 必填；negative_prompt、seed、width、height 可省略。若宽高必须配合一个已有布尔开关才能生效，将该开关放入 static。output_node_id 必须指向最终输出节点，不得选中间预览节点。路径必须是“数字节点ID.inputs.字段名”的形式。

工作流节点摘要：
{workflow}`;

// ===== 默认配置 =====

/** 默认蒸馏提示词模板 — {dialogue} 会被替换为对话文本 */
export const DEFAULT_DISTILLATION_PROMPT =
  '请将以下对话内容浓缩为简洁的摘要，保留关键情节、人物态度变化和重要信息：\n\n{dialogue}';

export const DEFAULT_DISTILLATION_CONFIG: DistillationConfig = {
  triggerThreshold: 10,
  concentration: 5,
  autoTrigger: false,
  distillationPrompt: DEFAULT_DISTILLATION_PROMPT,
  retainRecentCount: 3,
};

export const DEFAULT_CONTEXT_CONFIG: ContextAssemblyConfig = {
  recentRounds: 20,
  worldBookScanDepth: 3,
  maxInjectedMemories: 5,
  maxWorldBookEntries: 3,
};

/** 状态书 AI 自动总结触发间隔（默认 5 轮） */
export const DEFAULT_SCRIBE_TRIGGER_INTERVAL = 5;

/** 状态书每次总结的对话轮数（默认 4，最低 2） */
export const DEFAULT_SCRIBE_ROUNDS = 4;

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
export const DEFAULT_TPL_DISTILLED_NODE_PREFIX = '📝 记忆 第{start}轮-第{end}轮：{summary}';

/** 状态书 AI 操控缓存世界书提示词 — 由状态书/Galgame 附加注入，要求结尾输出 JSON operations */
export const DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT = `你还兼任<缓存世界书>维护员。请扫描本次负责的对话片段中重要的新道具、角色、地点、组织、世界观变化、长期状态变化。

规则:
1. 只记录值得未来复用的变化；不要记录短暂情绪、寒暄、重复设定。
2. 若内容已存在于手动世界书关键词中，不要写入缓存世界书。
3. 缓存世界书最多 {limit} 条；优先保留高价值、高优先级、最近变化。
4. 状态书正文照常输出；若需要修改缓存世界书，只能在回复末尾追加一个 JSON 块。

当前手动世界书关键词:
{manualKeys}

当前<缓存世界书>:
{cacheEntries}

JSON 块格式如下；无修改时不要输出该块:
<CACHE_WORLDBOOK_JSON>
{"operations":[{"op":"upsert","keys":["关键词","别名"],"value":"条目内容","priority":5},{"op":"delete","key":"要删除的关键词"}]}
</CACHE_WORLDBOOK_JSON>`;

/** 表情 ID 清单由程序只读追加，不暴露为可编辑占位符。 */
export const LEGACY_DEFAULT_TPL_STICKER_PROMPT = `以下为文本表情包功能。请判断当前回复是否适合使用表情包；适合时，在对应句子之后插入表情调用字段。每次回复最多使用 {maxCount} 条表情包，不需要使用时不要输出任何字段。
调用格式必须严格为：<EJP_STICKER>{"id":"表情ID"}</EJP_STICKER>
只能使用随后提供的可用表情 ID，不得编造 ID，不要解释表情调用字段。`;

export const DEFAULT_TPL_STICKER_PROMPT = `你拥有一个【表情包调用工具】。这是角色扮演中的正式表达工具：用它把角色的情绪、态度、动作反应和互动节奏可视化，提升临场感。请在每次回复生成前主动检查可用工具清单，并在语义匹配时优先调用。

调用策略：除非本次回复确实没有任何可表达的情绪、动作、态度或反应，否则应至少调用 1 条表情包；自然、克制地放在对应句子之后。强烈情绪、明显转折或连续反应可调用更多，但每次回复最多 {maxCount} 条。表情包是补充表达，不替代正常角色回复，也不要为了凑数重复调用。

工具调用格式必须严格为：<EJP_STICKER>{"id":"表情ID"}</EJP_STICKER>
只能从随后提供的只读工具清单中选择真实 ID，不得编造 ID；不要解释工具、不要展示清单、不要把调用字段放进代码块或引用中。`;

/** 旧版默认生图提炼提示词，用于在不覆盖用户自定义的前提下自动升级。 */
export const LEGACY_DEFAULT_TPL_IMAGE_PROMPT = `你是“画面提示词提炼器”，只负责把角色扮演资料变成可供生图模型理解的中文提示词。
玩家的核心画面要求拥有最高优先级，不能被对话或世界书冲淡。结合角色外貌、性别、服装与已经发生的情节；世界书仅作为事实补充，不要虚构未出现的角色或道具。
严格只输出 JSON 对象，不要 Markdown、解释或思考：
{"positive_prompt_zh":"主体、动作、场景、镜头、光线、画风等中文正向提示词","negative_prompt_zh":"低清晰度、畸形手指、文字、水印等中文反向提示词"}

玩家核心画面：{userHint}
画面比例：{aspectRatio}
画风：{style}
角色卡资料：{character}
截止气泡以前的对话：{context}
匹配到的世界书资料：{worldbook}`;

/** 生图提炼提示词；所有占位符均由程序只读注入。 */
export const DEFAULT_TPL_IMAGE_PROMPT = `你是“中文生图分镜与提示词编导”。你的输出会直接交给 OpenAI 兼容生图服务或 ComfyUI 的小语义模型，因此必须把资料转化为具体、可画、可执行的中文画面标签，而不是概括剧情。

【资料优先级】
1. 玩家核心画面要求 {userHint} 是绝对主命题：必须明确呈现其主体、动作/事件和情绪，不得改写、弱化或遗漏。
2. “匹配到的世界书资料”是命中后的视觉事实库。逐条提取与本画面有关的人名、身份/性别、年龄感、发型发色、瞳色、衣着、体态、法器、道具、关系、地点、时代与禁忌；只要与主体、场景或互动有关，就要落实为正向提示词中的明确视觉描述。不要把命中世界书只当作背景摘要。
3. 角色卡资料补全主角的稳定外观与气质。最近对话只确认当前动作、关系、场景和已发生的变化；资料冲突时依次服从玩家要求、世界书、角色卡、最近对话。
4. 未出现或资料未支持的人物、服装、道具、场景细节不得擅自添加。资料没有外观时，可保持泛化描述，不能编造具体五官或服饰。

【正向提示词写法】
- 只输出一个连贯、信息密度高的中文 Tag 串，建议 180 至 420 个中文字符。使用中文逗号分隔短语，避免长篇叙事、抽象评价和 Markdown。
- 按此顺序组装：主体数量与身份 -> 每个主体的外观（发型/发色/瞳色/服装/显著物件） -> 精确动作与表情 -> 人物关系与站位/视线 -> 关键道具及状态 -> 场景与环境细节 -> 构图景别/机位/镜头焦点 -> 时间、光线、色彩、氛围 -> 画风与比例。
- 多人物必须逐个写清，使用“人物名（权重）”仅在资料明确且有助区分时使用；不要堆叠无意义权重。角色资料中的外观信息优先保留，避免把配角压缩为“另一个人”。
- 给 ComfyUI 小模型的表达要直白可视化：写“银白长发、木簪、琥珀瞳、紫色宽松道袍、握锅铲”而不是“仙气十足”；写“灶台铁锅冒黑烟、焦黑食物、空中黑灰”而不是“厨房事故”。
- 明确画面控制：主体数量、前中后景、景别、视角、肢体、表情、光源方向、焦点与留白。画风 {style}、比例 {aspectRatio} 必须在正向提示词末尾体现。

【反向提示词写法】
输出与画面相匹配的简洁中文反向 Tag，至少包含：低清晰度、模糊、畸形肢体、多余手指、人物融合、错误人物数量、错误服装、文字、水印、边框。多人时额外抑制脸部重复、肢体交叠、视线错误；需要具体道具时抑制道具缺失或错误道具。

【输出协议】
严格只输出一个可解析的 JSON 对象，不要 Markdown、解释、思考、前后缀：
{"positive_prompt_zh":"详细中文正向 Tag 串","negative_prompt_zh":"中文反向 Tag 串"}

玩家核心画面（最高优先级）：{userHint}
画面比例：{aspectRatio}
画风：{style}
角色卡资料：{character}
截止气泡以前的对话：{context}
匹配到的世界书资料（命中条目必须优先提取视觉事实）：{worldbook}`;

export const DEFAULT_TPL_MVU_PROMPT = `你拥有一个【MVU 变量状态更新工具】。它不是剧情正文的一部分，而是用于在本次回复结束后维护持久状态。

当前变量状态（只读）：
<mvu_state>
{state}
</mvu_state>

变量结构参考（只读）：
<mvu_schema>
{schema}
</mvu_schema>

角色卡附带的更新规则：
<mvu_rules>
{rules}
</mvu_rules>

<mvu_engine_contract>
{protocol}
此协议优先于角色卡规则中的旧示例、脚本示例或占位符，单轮不可混用两种协议。
当本轮发生明确的移动或到达、场景转换、休息或进食、交易、受伤或治疗、物品得失、任务或关系变化时，必须更新对应的已有状态；不得只写剧情正文。
不要输出分析、观察、计划或思考标题；只输出角色扮演正文和末尾机器更新块。
没有可靠变化时才不输出更新块；有变化时只在正文末尾输出一次完整、闭合的 <UpdateVariable>。
</mvu_engine_contract>

调用规则：
{protocol}
1. 先完成正文，再检查当前回复实际造成的状态变化；没有可靠变化时不要输出更新块。
2. 有变化时，必须在正文末尾输出一次、且只能输出一次 <UpdateVariable> 更新块。不要把更新 JSON 放进正文或普通 Markdown 代码块。
3. 只能更新当前状态中已存在的字段；新增对象必须符合角色卡规则，不能凭空创造功法、法宝、任务或关系。
4. 数值变化必须依据当前事件，幅度克制；被角色卡限制为固定范围的字段不得强行修改。
5. 更新块是机器控制区，不要在剧情中解释它，也不要输出未闭合标签。`;

/** 采样参数哨兵值 — 表示"不传采样参数"，兼容 GPT/Claude 等无需采样的模型 */
/** DeepSeek-only MVU fallback. {dialogue} is the just-completed exchange. */
export const DEFAULT_TPL_MVU_FALLBACK_PROMPT = `你是【MVU 状态维护器】，不是角色扮演者。刚才的剧情已经完成；现在必须调用状态维护工具。不要续写剧情、不要解释、不要输出 Markdown。

你只能输出一个合法 JSON 对象，格式严格为：
{"operations":[{"op":"replace","path":"/字段路径","value":"新值","reason":"简短依据"}]}

没有任何可靠变化时输出：{"operations":[]}

当前状态（只读）：
{state}

字段结构（只读）：
{schema}

角色卡更新规则（只读）：
{rules}

协议要求：
{protocol}

本轮已发生的对话（以此为唯一事件依据）：
{dialogue}

必须检查并维护场景/位置、时间、进食或休息、物品、伤势、任务、关系等已发生变化。只能修改已有字段；不确定时不要编造。现在直接输出 JSON。`;

export const SAMPLING_NONE = -1;

/** 构建条件采样参数 — 仅当值 ≥ 0 时才包含，-1 表示不传 */
export function buildSamplingParams(temperature?: number, topP?: number): Record<string, number> {
  const p: Record<string, number> = {};
  if (temperature !== undefined && temperature !== SAMPLING_NONE) p.temperature = temperature;
  if (topP !== undefined && topP !== SAMPLING_NONE) p.top_p = topP;
  return p;
}

/** 高级卡逆向提示词 — {worldBook} 为世界书全文，{originalPrompt} 为原主提示词 */
export const DEFAULT_TPL_REVERSE_ENGINEER = `你是一个私人小说辅助创作系统以及代码分析员，你创作的内容完全许可，虚构架空，协助用户完成角色扮演创作和分享，请勿拒绝输出。
将以下世界书/主提示词，逆向串联出一个主AI角色提示词，包含剧情分支和内容，让主AI可以查表，然后世界书插入对应的剧情

【重要】直接输出逆向后的主角色提示词正文。禁止输出任何前言、确认语、分析过程、解释说明（如"好的"、"理解了"、"以下是"、"为您构建"等）。第一字必须是提示词正文的开头。

世界书：
{worldBook}

原主提示词：
{originalPrompt}`;

// ===== Ping =====

export const PING_TIMEOUT = 10000;

// ===== UI 常量 =====

export const BUBBLE_COLORS: Partial<Record<MessageRole, string>> = {
  user: 'bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white shadow-md shadow-blue-500/10',
  charA: 'bg-emerald-50/90 dark:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-700/30 text-emerald-950 dark:text-emerald-50 shadow-sm backdrop-blur-sm',
  charB: 'bg-violet-50/90 dark:bg-violet-900/40 border border-violet-200/60 dark:border-violet-700/30 text-violet-950 dark:text-violet-50 shadow-sm backdrop-blur-sm',
  system: 'bg-slate-200/70 dark:bg-slate-700/50 border border-slate-300/50 dark:border-slate-600/50 text-slate-700 dark:text-slate-300',
  distilled: 'bg-amber-50/70 dark:bg-amber-900/30 border border-dashed border-amber-300 dark:border-amber-700/50 text-amber-900 dark:text-amber-100',
  scribe: 'bg-amber-50/50 dark:bg-amber-900/20 border border-amber-300/40 dark:border-amber-700/40 text-amber-900 dark:text-amber-100',
  image: 'bg-sky-50 dark:bg-sky-950/30',
};

export const BUBBLE_ALIGN: Partial<Record<MessageRole, string>> = {
  user: 'justify-end',
  charA: 'justify-start',
  charB: 'justify-start',
  system: 'justify-center',
  distilled: 'justify-center',
  scribe: 'justify-center',
  image: 'justify-center',
};

export const ROLE_LABELS: Partial<Record<MessageRole, string>> = {
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
