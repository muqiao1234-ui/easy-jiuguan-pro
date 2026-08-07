# 🍺 Easy酒馆Pro — 系统架构设计（v1.39 早鸟测试版）

> 本文档基于 **v1.39 早鸟测试版** 源码逐项核对重写，是项目唯一系统架构文档。它吸收合并了历史专题文档：旧《系统拓扑逻辑地图》（v2.4）、旧《状态书提示词拼装逻辑》（2026-07-14）、旧《蒸馏系统逻辑》（2026-07-14）——这些旧稿描述的是「文本状态书 + Galgame 双引擎、树状消息链表、7 store」的过时架构，已全部作废。用户向功能手册见 `user-guide.md`。

---

## 1. 技术栈与选型

| 层 | 技术 | 说明 |
|---|------|------|
| 框架 | React 18.3 + TypeScript 5.5 | 函数组件 + Hooks |
| 构建 | Vite 5.4 + vite-plugin-singlefile | 产出单个 `index.html`，可直接双击运行 |
| 样式 | Tailwind CSS 3.4（`darkMode: 'class'`） | 全组件双主题适配，WCAG 对比度审查 |
| 持久化 | localForage → IndexedDB | **12 个 store** + 消息 v3 分片索引 + 异步写锁 + 密钥保险库 |
| Markdown | react-markdown 10 | 加粗着色 + 表情包内联渲染 |
| 数据解析 | JSON5 + YAML | MVU InitVar 多格式兼容解析 |
| PWA | Service Worker（Cache-First）+ Web App Manifest | 离线可用；SW 用相对路径注册以兼容 GitHub Pages 子目录 |

**运行时依赖**（生产）：`react`、`react-dom`、`react-markdown`、`localforage`、`json5`、`yaml`。无 UI 库、无状态管理库、无路由库。

---

## 2. 分层架构

```
┌─────────────────────────────────────────┐
│  ① UI 视图层 (components/)               │
│  chat / settings / layout / ui /        │
│  characters / conversations / models /  │
│  worldbook                              │
├─────────────────────────────────────────┤
│  ② 业务逻辑层 (hooks/)                   │
│  useChat / useDistillation / useModels  │
│  useApp / useMessageNodes / ...         │
├─────────────────────────────────────────┤
│  ③ 引擎层 (utils/)                       │
│  context(拼装) / moduleRpg / mvu /      │
│  imageGeneration / comfyui / sync / ... │
├─────────────────────────────────────────┤
│  ④ 持久化层 (db/)                        │
│  localForage 12 store + 写锁 + 保险库    │
└─────────────────────────────────────────┘
```

---

## 3. 数据模型（src/types/index.ts）

### 3.1 消息节点（v3 扁平时间线）

`MessageNode` 为**扁平列表**（每对话一条时间线），**不再使用 parentId/childrenIds 树状链表**。分支 = 克隆节点链到新对话（`cloneToNewConversation`，批量 O(1) I/O）。

```
MessageRole = 'user' | 'charA' | 'charB' | 'system' | 'distilled' | 'scribe'
```

关键附加字段（挂载到节点上的子系统数据）：

| 字段 | 归属 | 用途 |
|---|---|---|
| `activatedWorldBookEntries` | user 节点 | 展示本次激活的世界书条目 |
| `tokenEstimate / tokenCost / tokenCostTotal` | 全部 | Token 统计（精确值优先来自 API usage） |
| `debugPrompt / debugResponse` | AI 节点 | 调试模式下的完整 Prompt / 原始返回快照 |
| `implantedMemory` | system 节点 | 手动植入记忆&状态书的标记 |
| `moduleRpgData {snapshot, source, diagnostics}` | AI 节点 | **模块化 Gal/RPG 快照**（v1.39 状态书唯一写入路径） |
| `scribeUpdate {rawText, isEnabled, mode}` | AI 节点 | 遗留文本状态书（只读兼容） |
| `galgameData` | AI 节点 | 遗留 Galgame 数值（只读兼容，可映射为 module 快照） |
| `mvuData {scopeId, operations, checkpoint, displayState}` | AI 节点 | MVU 变更操作 + 快照断点 |
| `stickerUsages` | AI 节点 | 表情包调用位置 |
| `distillationMeta {sourceNodeIds, roundStart, roundEnd, cumulative}` | distilled 节点 | 蒸馏批次元数据（累计摘要标记） |

### 3.2 存储 Schema（db/index.ts，12 store）

所有 store 位于同一 IndexedDB 数据库 `tavern_ai_sandbox`：

| Store 变量 | Store 名 | 内容 |
|---|---|---|
| modelsStore | `tavern_models` | 模型配置（**apiKey 恒为空串**，经 secretId 引用保险库） |
| secretsStore | `tavern_secret_vault` | **密钥保险库**：`{secrets: SecretEntry[], sync: SyncSettings}`；不进入备份与同步包 |
| charactersStore | `tavern_characters` | 角色卡（含 worldBookId / cacheWorldBookId / mvuEnabled） |
| conversationsStore | `tavern_conversations` | 对话（含 userName / userDescription / 表情包绑定） |
| conversationFoldersStore | `tavern_conversation_folders` | 对话文件夹（只存会话 ID） |
| messageNodesStore | `tavern_message_nodes` | **v3 分片**：`node:<id>` 单条记录 + `conversation_index:<id>` 元数据索引 |
| worldbooksStore | `tavern_worldbooks` | 世界书（`kind: 'manual' | 'cache'`，缓存书 entryLimit=10） |
| stickerPacksStore | `tavern_sticker_packs` | 表情包（Blob 直存，避免 Base64 膨胀） |
| imageChannelsStore | `tavern_image_channels` | 生图渠道配置（OpenAI/NovelAI/Nano Banana/ComfyUI） |
| imageTasksStore | `tavern_image_tasks` | 本机后台生图任务（**不进入备份/同步**） |
| globalStatesStore | `tavern_global_states` | 每对话独立状态书配置 |
| uiSettingsStore | `tavern_ui_settings` | 主题/壁纸/各开关/蒸馏与上下文配置/18 个 TPL 模板 |

### 3.3 并发安全：Store 级异步写锁

所有存储操作是「读整表 → 改 → 写回」模式。`withStoreLock` 为每个 store 维护独立 Promise 链，**同一 store 写操作串行**，不同 store 互不阻塞；纯读不入锁（getItem 原子）。蒸馏提交 `commitDistillationBatch` 在单锁内完成「归档来源 + 写入结晶 + 更新索引 + 失败回滚」。

---

## 4. 核心引擎

### 4.1 上下文拼装（utils/context.ts）

```
组装顺序（高优先级 → 低优先级）：
1. system：目标角色 System Prompt + 功能附加提示词（表情包/MVU 控制）
2. system：玩家身份（userName / userDescription，兼容 {{user}}）
3. system：本次扫描命中的世界书条目（按 priority DESC，Token 预算内）
4. system：蒸馏摘要（仅注入最新累计结晶；手动植入时跳过）
5. 对话历史：逆序截断，按 Token 预算（最近 25% 预算保底）
6. system：结尾身份锚点（防角色漂变）
```

- **Token 预算**：`maxContextTokens`（模型级）控制；高优先级内容优先，历史从旧到新丢弃。
- **角色隔离**：对方角色发言包裹「独立实体」标签（`DEFAULT_TPL_OTHER_CHAR_WRAPPER`），末尾注入身份锚点。
- **模块快照注入**：AI 节点的 `moduleRpgData.snapshot` 紧跟该消息后插 system 消息（线性呈现状态演变），随字段开关裁剪。
- **遗留状态书注入**：`scribeUpdate` 原文（文本）/ `galgameData` 模糊化描述（非对称，AI 看不到精确好感数值）。

### 4.2 消息发送与流式（hooks/useChat.ts）

- **A/B 独立模型**：角色 A、角色 B 可分别绑定不同文字模型，按角色独立控制成本；移除旧「对话模型勾选」，只保留蒸馏模型等专项绑定。
- **同时告知（旁听）**：同一条玩家消息按 A 后 B 顺序分别请求，两角色读取相同的发送前对话快照。
- SSE 流式：fetch + ReadableStream + `SSEParser`（处理 chunk 截断、`[DONE]`、usage 收集、reasoning_content 分离）；**30s 空闲超时**自动断开；流式渲染帧合并减少卡顿。
- 非流式回退：完整 JSON 响应；DeepSeek 等模型流式时请求 `stream_options.include_usage` 获取精确 Token。
- Token 统计：API usage 精确值优先，否则按 `字符数 × 0.5` 估算。
- 推理过滤：`stripReasoningBlocks` 支持 19 种标签（think/though/reasoning/analysis/cot/scratchpad/planning 等常见与畸形变体，兼容大小写/属性/未闭合），流式用 `filterStreamingReasoningText` 隐藏未闭合标签前缀。
- **副 AI 状态条**：输入框上方实时显示状态书/缓存世界书/蒸馏等副任务执行进度（发送前预告、执行中显示模型名与任务）。
- 触发器串行调度：AI 回复写库 → **先模块化 Gal/RPG 引擎**（间隔轮数判定 + 模式匹配）→ **再自动蒸馏**，串行避免限速 API 429；不阻塞主流程返回。
- MVU 处理：解析回复中的 `<UpdateVariable>` 块 → 本地校验执行 → 写入 `mvuData`；DeepSeek 无更新块时走独立兜底维护请求。
- 表情包处理：`parseStickerResponse` 剥离协议块、校验 ID、按位置记录 usage。

### 4.3 模块化 Gal/RPG 引擎（utils/moduleRpg.ts，v1.39 状态书唯一写入路径）

引擎类型 `ScribeEngine = 'module' | 'text' | 'galgame'`：**新写入一律 module**；`text`/`galgame` 仅保留兼容读路径（`legacyGalgameSnapshot` 把旧 Galgame JSON 映射为 module 快照）。

**触发**（useChat.ts ~1077）：`assistantCount % scribeTriggerInterval === 0`（默认 5，可调 1-50）+ 模式匹配（auto / charA / charB）。输入范围 `scanSize = max(4, recentRounds*2+1)`（默认 recentRounds=4 → 9 条）。

**提示词拼装**（`buildModuleRpgPrompt`，moduleRpg.ts:373）：

```
messages = [
  { role: "system", content: buildModuleRpgPrompt(basePrompt, config, previous) },
  ...(角色卡参考：system，可选),
  { role: "user",   content: "【刚完成的对话】\n{dialogue}\n\n现在只输出本轮状态变更 JSON。" },
]
```

`buildModuleRpgPrompt` 自动追加三段：
1. **【启用角色面板】**：`characterSlots`（charA/charB 名称与开关）生成匹配规则；
2. **【玩家启用字段及维护规则】**：仅列出 `config.fields` 中 enabled 的字段及 JSON 路径（世界横幅 / 角色面板 / 生命心情货币 / Buff / 背包 / 关系 / 事件 / 配角 / 备注 / 身体状态 / 身体特殊状态）；
3. **【当前合法状态，只读】**：`JSON.stringify(snapshot)`——AI 只返回**本轮变化**字段。

**API 参数**：`stream: false`、`max_tokens: 1800`、`temperature 0.2 / top_p 0.85`。

**输出处理**：
1. `stripReasoningBlocks` 过滤推理标签；
2. `parseModuleRpgResponse` 多级兜底解析（直接 JSON → 正则提取 → 容错修复 → 字段校验）；
3. `mergeModuleRpgSnapshot(parsed, previous, config)` **字段级白名单校验合并**——非法字段/非法身体状态/超长文本（`MAX_TEXT=240`、`MAX_LIST_ITEMS=12`、`MAX_BODY_SPECIAL_PRESETS=32`、`MAX_BODY_SPECIAL_STATES_PER_PART=6`）不覆盖旧状态，返回 `{snapshot, diagnostics}`；
4. 写入 `node.moduleRpgData = {snapshot, source:'module', diagnostics, rawResponse}`；解析失败保留上一份快照并记诊断。

**身体状态模块**：`BODY_PARTS` 14 部位（头/躯干/大臂/小臂/手/大腿/小腿/脚），`BodyStatusModule.tsx` 提供编辑器；状态颜色 `BODY_STATUS_META`（健康/轻伤/重伤/缺失）。**身体特殊状态系统**（默认关闭）：按角色 A/B 绑定、按部位多状态、粉色描边叠加、点击查看预设文本。

**附带能力**：开启 `scribeCacheWorldBookEnabled` 且绑定缓存书时，追加 `buildCacheWorldBookPrompt()` 维护 `<缓存世界书>`。

**UI**：`ModuleRpgCard.tsx` 为唯一渲染组件（聊天气泡 + 组装预览复用），RPG HUD 风格；`StateBookPanel.tsx` 的 `buildAssemblyPreview()` 提供预览示例（不写入数据库）。视觉细节见 `outputs/Easy酒馆Pro_模块化GalRPG_UI实现说明.md`。

### 4.4 MVU 引擎（utils/mvu.ts）

- 识别世界书控制条目：`[InitVar]` / `[mvu_update]` / `[mvu_plot]`。
- 协议识别：JSON Patch（RFC 6902）/ 脚本式 `_.xxx()` / 混合；混合卡优先 JSON Patch。
- InitVar 解析：JSON5 → 嵌入对象 → YAML → 逐行 YAML 候选，多层兜底；**不执行任何角色卡脚本、Tavern Helper 或动态 Schema**。
- 操作执行：`set / insert / delete / add / move`，含 old-value 校验（expectedValue）、路径解析、数组追加（`/-`）；失败操作记诊断并跳过。
- 快照断点：`MVU_CHECKPOINT_INTERVAL = 8`，每 8 个有效回复存完整快照；分支按时间线回放（`replayMvuState`）。
- 作用域：`characterId:role`，同卡绑 A/B 槽状态隔离。
- DeepSeek 兜底：`requestDeepSeekMvuFallback` 发 JSON-only 维护请求（temperature 0 / top_p 1）。
- 明确提示不推荐同时开启 MVU 与模块化 Gal/RPG。

### 4.5 世界书扫描（hooks/useWorldBookScanner.ts）

- 关键词匹配先走**字面量包含快速路径**（大小写无关），再走正则路径——但正则关键词先经 `escapeRegExp` 转义，**杜绝 ReDoS**。
- `alwaysActive` 条目无条件注入；结果按 priority DESC 取前 N。
- **废除旧插入冷却**，改为「扫描深度 `worldBookScanDepth` + 最大插入条目 `maxWorldBookEntries`」：扫描深度决定向前回读多少条历史 user 对话及其间的角色回复与记忆，最大插入条目决定单次注入上限。
- 世界书正文只在最终请求阶段组装，不写入历史消息；Debug 导出标明命中条目与预估 Token。

### 4.6 缓存世界书（utils/cacheWorldBook.ts）

- 模块化引擎（及遗留 text/galgame 读路径）附加 `<CACHE_WORLDBOOK_JSON>` 提示词 → 提取回复末尾 JSON 块 → upsert/delete 操作合并。
- 严格校验：只接受合法操作、关键词、正文与有限优先级（1-10）；关键词去重（已存在于手动 A 书的不重复写入）、价值截断 12000 字符、上限 10 条。
- 缓存词条「升华」：手动迁移到角色的 A 世界书（并入后从缓存书移除）。

### 4.7 蒸馏（utils/distillation.ts + hooks/useDistillation.ts）

**完整轮次规划器** `planDistillation(candidates, triggerThreshold=10, retainRecentCount=3)`（distillation.ts）：
1. 按时间升序扫描，仅处理 `user / charA / charB` 且未归档节点；`user` 开启新轮次，assistant 追加到当前轮次；
2. 只保留**有角色回复的完整轮次**，遇第一个无回复轮次即停止；
3. `availableRounds = 完整轮次数 - retainRecentCount`，`availableRounds < triggerThreshold` 返回 null（**至少 13 个完整轮次才触发**）；
4. 选中前 `triggerThreshold` 个完整轮次为来源——**绝不拆轮**。

**执行**（useDistillation.ts）：四段 messages（蒸馏提示词 → 上一轮累计记忆 → 完整对话+激活世界书 → 尾部强化提示词），模板占位 `{start}/{end}/{total}`；生成 `distilled` 节点（`distillationMeta.cumulative: true`）。

**事务式提交** `commitDistillationBatch(sourceIds, distilledNode)`（db/stores.ts）：单锁内校验来源（已归档/跨会话拒绝）→ 归档来源 + 写结晶 + 更新索引 → 失败整体回滚。

**累计记忆**：只注入最新累计结晶，历史结晶作为快照保留；记忆回廊可编辑（编辑最新累计结晶影响后续上下文）。蒸馏输出兼容 `content` / `text` / `reasoning_content` 返回结构。

### 4.8 表情包（utils/stickers.ts）

- 上限 2 组 × 8 张；静态图压缩 512px / WebP 82%，GIF ≤ 1.8 MiB（Blob 直存 IndexedDB）。
- 协议：`<EJP_STICKER>{"id":"..."}</EJP_STICKER>`，按调用位置插入气泡；每对话为 A/B 分别绑定不同组。
- 每次回复调用数量 `stickerMaxCount` 可调（默认 2）；控制提示词 `tplStickerPrompt` 可编辑。

### 4.9 智能生图（utils/imageGeneration.ts + comfyui.ts）

- 气泡「生图」入口：一句话描述（最高优先级）+ 历史扫描（1-10 轮）+ 角色卡人设 + 世界书命中 + 比例（1:1 / 3:4 / 16:9）+ 画风（国风仙侠 / 二次元 / 真人 / 美漫 / 自定义）+ 安全模式（改写敏感表达）。
- 提示词组装 AI 提炼中文正向/反向提示词，预览可手动编辑；生成图片插入时间线，支持删除/导出/重新生成。
- **后台任务**：`imageTasksStore` 独立存储；顶部显示任务状态/等待时间/重试阶段；失败可关闭、编辑并重新生成（读取最新绑定渠道）。
- **4 种渠道**（`imageChannelsStore`）：
  - OpenAI 兼容 `/v1/images/generations`（自动补全 URL）；
  - NovelAI 官方协议（`NOVELAI_IMAGE_API_URL`）；
  - Nano Banana / Gemini 原生协议（`NANO_BANANA_IMAGE_API_URL`）；
  - ComfyUI API 工作流（导入 API 格式 workflow + 手动/AI 生成映射草案，正式生图只做字段替换不额外消耗 AI）。
- 请求长耗时等待、退避重试、超时说明（默认超时 720s）；生图设置页测试图片功能；独立生图渠道不要求绑定文字主渠道。

### 4.10 备份 / 同步 / 密钥（utils/backup.ts, sync.ts, db/stores.ts）

- `createBackupPayload`：导出**剔除** apiKey/secretId（模型）、同步 Token 与 debugPrompt/debugResponse（消息）；表情包 Blob 转 dataUrl；生图任务与密钥保险库不进入备份。
- `normalizeBackupPayload`：表级结构校验 + 再次剥离内联密钥；导入先备份、失败回滚；**导入业务数据不覆盖本机密钥保险库**。
- 同步（`SyncCenterPanel`）：WebDAV（ETag 条件写）/ GitHub Gist（**按设备 ID 分文件**、选择最新有效数据）/ OneDrive（OAuth PKCE）/ Dropbox（OAuth PKCE）；冲突检测 `SyncConflictError`；OAuth 走 PKCE + sessionStorage 暂存、回调验证 state。
- 同步为**手动触发伪同步**；上传实时百分比/已上传大小/上传速度/预计剩余时间/取消按钮；100% 后仍等待服务商最终确认；手机端下载同步提示先手动备份（不自动触发下载前备份），桌面端自动生成安全备份。
- 密钥保险库：`SecretKind = apiKey | syncToken | syncPassword`；模型/同步/生图渠道以 `secretId` 引用；`migrateLegacyModelKeys` 自动迁移旧内联 Key。
- OAuth 要求 HTTP(S) 页面；`file://` 版本推荐 Gist / 本地 JSON。

### 4.11 成本预设与低速率模式

- `CostPresetPanel`：低耗 / 中耗 / 高耗一键调整上下文轮数、蒸馏、世界书、状态维护参数（新手预设入口）。
- 低速率模式（`apiFetch`）：请求间隔 ≥ 2.5s，429 自动重试 3s → 6s → 12s 三次；适用于 GLM-4.7-Flash、豆包等限速 API。

---

## 5. 关键流程

### 5.1 发送消息主流程

```
ChatInput 发送（Shift+Enter → A / 发送A / 发送B / 同时告知）
  → 插入 user 节点（重试场景复用既有节点）
  → 并行查询：未归档历史 / 蒸馏结晶 / 扫描时间线
  → 扫描双世界书（A 书 + 缓存书，扫描深度 + 最大插入）
  → 组装 MVU 上下文 / 表情包清单 / 玩家身份（{{user}}）
  → assembleContext（Token 预算 + 角色隔离 + 模块快照线性注入）
  → API 请求（SSE 流式 / JSON 一次性，30s 空闲超时）
  → 流式内容实时渲染（推理过滤 + MVU 块隐藏 + 表情包剥离）
  → 写 AI 节点（Token 统计 / debug 快照 / mvuData / stickerUsages）
  → 串行触发：模块化 Gal/RPG 引擎 → 自动蒸馏
```

### 5.2 模块化 Gal/RPG 状态书流程

```
达到触发间隔（assistantCount % interval === 0）
  → 取上一份 moduleRpgData.snapshot 作为只读基线（无则 createModuleRpgSnapshot）
  → applyModuleRpgCharacterSlots 同步角色面板名称/开关
  → buildModuleRpgPrompt（启用面板 + 字段规则 + 只读状态）
  → 独立书记 AI 请求（stream:false, max_tokens 1800, T0.2/P0.85）
  → stripReasoningBlocks → parseModuleRpgResponse（多级兜底）
  → mergeModuleRpgSnapshot 字段白名单校验合并（非法不覆盖）
  → 写入 node.moduleRpgData（diagnostics 记录解析失败）
  → 若开启缓存世界书联动：提取 <CACHE_WORLDBOOK_JSON> patch 合并进缓存书
```

### 5.3 蒸馏流程

```
AI 回复完成 / 手动点击
  → planDistillation（完整轮次分组 → 保留最近 N → 阈值判断）
  → 不足阈值：不调用模型（手动点击提示轮次不足）
  → 查询最新累计结晶 → 扫描区间世界书
  → 四段 messages 调用蒸馏模型
  → 生成 distilled 节点（cumulative: true）
  → commitDistillationBatch 单锁原子提交（归档 + 写结晶 + 更新索引，失败回滚）
```

### 5.4 分支流程

```
消息气泡「分支」
  → cloneToNewConversation(节点, 原对话)
  → 复制该节点及之前全部节点到新对话（批量 O(1)）
  → 切换为新对话，后续消息沿新时间线生长（分支保持独立消息时间线与输入历史）
```

---

## 6. 源文件全景（src/ 87 个文件）

```
src/
├── main.tsx / App.tsx / styles/index.css / module-preview.tsx（UI 独立预览页）
├── types/index.ts                  # 全部类型定义（ModuleRpg*/MvuNodeData/Sticker*/Sync*/Secret*/Image*）
├── utils/                          # 22 个引擎/工具文件
│   apiFetch / backup / cacheWorldBook / chatCompletionsUrl / comfyui /
│   constants / context / distillation / donateQrBase64 / easterEgg /
│   encoding / galgameEngine(遗留读) / githubCharacterRepo / id / imageGeneration /
│   logoBase64 / modelsUrl / moduleRpg / mvu / presets / responseText /
│   sillyTavernCard / sse / stickers / sync / wallpaper
├── hooks/                          # 12 个业务 Hook
│   useApp / useCharacters / useChat / useConversations / useDistillation /
│   useGlobalStates / useImageGenerationTasks / useMessageNodes / useModels /
│   useStickerPacks / useWorldBooks / useWorldBookScanner
├── db/index.ts + db/stores.ts      # 12 store + 写锁 + 保险库 + 蒸馏原子提交
├── components/
│   chat/ (17)   MessageBubble / MessageList / ChatInput / ChatArea / ModuleRpgCard /
│                StateBookPanel / BodyStatusModule / MvuPanel / MvuBubble /
│                GalgameCard(遗留) / ScribeBubble(遗留) / DistilledBubble /
│                ImageBubble / ImageGenerateModal / MarkdownRenderer / ModelSelector
│   settings/ (5)  SettingsPanel / CostPresetPanel / SyncCenterPanel /
│                  StickerSettingsPanel / ImageSettingsPanel
│   layout/ (4)   MainLayout / MobileLayout / Sidebar / TopBar
│   ui/ (6)       Button / Toggle / Modal / Icon / Dropdown / Tooltip
│   characters/ (4) CharacterManager / CharacterSelector / EasyCharacterBuilder /
│                  GitHubCharacterStore
│   conversations/ (1) ConversationList
│   models/ (2)   ModelManager / ModelPing
│   worldbook/ (1) WorldBookManager
└── pwa/sw.ts                       # Service Worker（相对路径注册）
```

---

## 7. 数据流要点（跨文件约定）

- **ID**：`generateId()`（crypto.randomUUID 封装）。
- **写锁**：所有 mutating 操作必须走 `mutateStore` / `withStoreLock`；纯读可直读。
- **消息节点**：写入必须同时维护 `node:<id>` 记录与 `conversation_index:<id>` 索引（timestamp + id 组合排序，同毫秒不遗漏）。
- **密钥红线**：apiKey 只存在于保险库；业务 store、导出、同步包、备份中永不出现。
- **Token 估算**：`estimateTokens = ceil(字符数 × 0.5)`。
- **模板占位符**：18 个 TPL 模板使用 `{占位符}` 语法，空字符串 = 使用默认。
- **气泡配色**：charA 翠绿 emerald / charB 紫罗兰 violet / user 蓝 / distilled 琥珀虚线 / scribe 琥珀。
- **触发串行**：副 AI（状态书/缓存世界书/蒸馏）全部串行执行，避免限速 API 429。

---

## 8. 版本演进对照（供迁移参考）

| 维度 | v1.3 内测（旧） | v1.39 早鸟测试（当前） |
|------|----------------|----------------------|
| 状态书 | 文本 + Galgame 双引擎并存 | **模块化 Gal/RPG 引擎**唯一写入路径；text/galgame 只读兼容 |
| 生图 | 无 | **智能生图系统**（四渠道 + ComfyUI 映射 + 后台任务） |
| 高级模板 | 15 项 | **18 项**（+生图提示词、ComfyUI 映射） |
| IndexedDB | 10 store | **12 store**（+image_channels、image_tasks） |
| 世界书扫描 | 插入冷却逻辑 | **扫描深度 + 最大插入条目**（废除冷却） |
| 对话 | 固定模型勾选 | A/B 独立模型、同时告知快照、{{user}}、第一句预设 |
| 设置页 | 单区 | 常用 / 高级 / 调试三分区 + 成本预设挡位 |
| 蒸馏 | 消息条数切片 | **完整轮次规划 + 事务提交 + 累计记忆** |
| 同步 | 基础版 | 上传进度/取消、Gist 设备隔离、手机端下载提示 |
| UI | — | 对比度审查 + 模块卡 RPG HUD 风格 + 副 AI 状态条 |
