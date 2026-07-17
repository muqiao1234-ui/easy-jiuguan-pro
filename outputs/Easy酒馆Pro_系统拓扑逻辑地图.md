# Easy酒馆Pro · 系统拓扑逻辑地图

> 生成日期: 2026-07-17 | 版本: v2.2（对话文件夹收纳 · 模型连接问题透明化 · 双世界书架构升级）

---

## 一、技术栈与构建

| 维度 | 选型 |
|------|------|
| 框架 | React 18.3 + TypeScript 5.5 |
| 构建 | Vite 5.4 + vite-plugin-singlefile（**单 HTML 文件 PWA**，全部 JS/CSS 内联） |
| 样式 | Tailwind CSS 3.4，`darkMode: 'class'`，所有颜色 `dark:` 前缀双主题适配 |
| 持久化 | localForage 1.10 → IndexedDB，纯离线，不上传任何数据 |
| 部署 | 单 `index.html`，支持 GitHub Pages 子路径（SW 注册 `./sw.js` 相对路径） |

---

## 二、源文件全景清单

### 根入口
| 文件 | 职责 |
|------|------|
| `src/main.tsx` | 挂载 React Root + 注册 Service Worker（相对路径 `./sw.js`） |
| `src/App.tsx` | `AppProvider` 包裹 `AppInner`，初始化数据加载、对话切换、视图分发、壁纸层渲染、移动/桌面布局切换、分支回调 |

### types/
| 文件 | 职责 |
|------|------|
| `src/types/index.ts` | 全部 TypeScript 类型/接口/字面量联合集中定义 |

### utils/
| 文件 | 职责 |
|------|------|
| `utils/constants.ts` | 全局常量、默认配置、13 个 `DEFAULT_TPL_*` 模板、气泡颜色/对齐/标签映射 |
| `utils/context.ts` | 上下文拼装核心 `assembleContext`、Token 估算、世界书冷却计算 |
| `utils/cacheWorldBook.ts` | `<缓存世界书>` 工具：10 条上限、JSON operations 提取/合并、状态书 AI 维护提示词 |
| `utils/galgameEngine.ts` | Galgame 数值引擎：默认 prompt、prompt 构建、4 级 JSON 解析、非对称信息映射、像素条 |
| `utils/sse.ts` | SSE 流式响应解析器 `SSEParser`（捕获 tokenUsage） |
| `utils/id.ts` | `generateId()` → `crypto.randomUUID()` |
| `utils/wallpaper.ts` | 壁纸压缩 1920px / JPEG 0.75 |
| `utils/sillyTavernCard.ts` | SillyTavern V2 角色卡导入（PNG 隐写 + JSON）与导出 |
| `utils/logoBase64.ts` | 内嵌 Logo base64 |

### hooks/
| 文件 | 职责 |
|------|------|
| `useApp.tsx` | 全局状态 reducer + Context + IndexedDB 持久化（25 个 action） |
| `useChat.ts` | 消息发送/旁听/蒸馏触发/双世界书扫描/状态书维护缓存书/Galgame 自动触发/SSE 流式（30s 空闲超时） |
| `useDistillation.ts` | 蒸馏执行：调用蒸馏模型 → 生成 distilled 节点 → 原节点归档 |
| `useWorldBookScanner.ts` | 关键词扫描（防 ReDoS：escapeRegExp + 快速 includes 路径） |
| `useMessageNodes.ts` | 消息节点 CRUD、批量更新、分支克隆（O(1) 批量 I/O） |
| `useModels.ts` | 模型 CRUD + Ping 测试（HTTP 状态码编码 `-400-status`） |
| `useGlobalStates.ts` | 每对话独立的书记员配置（原子 `patchGlobalState`） |
| `useConversations.ts` | 对话 CRUD + 文件夹收纳/折叠/迁移 + best-effort 删除清理 |
| `useCharacters.ts` | 角色 CRUD（A 世界书 + 缓存世界书双绑定） |
| `useWorldBooks.ts` | 世界书及条目 CRUD + 批量导入 + 缓存世界书创建/10 条上限保护 |

### db/
| 文件 | 职责 |
|------|------|
| `db/index.ts` | 8 个 localForage store 实例 + `initDB()` |
| `db/stores.ts` | 全部 CRUD 函数 + `storeWriteLocks` 异步互斥锁 + `mutateStore` 统一写入入口 |

### components/
| 目录 | 组件 |
|------|------|
| `chat/` | ChatArea, MessageList, MessageBubble, ChatInput, MarkdownRenderer, GalgameCard, DistilledBubble, ScribeBubble, StateBookPanel, ModelSelector |
| `settings/` | SettingsPanel（8 大区块，详见第六节） |
| `layout/` | MainLayout, MobileLayout, Sidebar, TopBar |
| `ui/` | Button, Toggle, Modal, Dropdown, Icon（19 个 SVG）, Tooltip |
| `characters/` | CharacterManager（头像压缩 + A/缓存双世界书绑定 + SillyTavern 导入导出）, CharacterSelector, EasyCharacterBuilder（模块化人物卡组装 + 自定义文本保护） |
| `conversations/` | ConversationList（对话文件夹新建/折叠/管理/删除 + 大队列 + 对话新建/删除/导出 TXT，navigator.share 优先） |
| `models/` | ModelManager（采样三预设 + Ping + HTTP 错误标签）, ModelPing（常见模型连接问题折叠说明） |
| `worldbook/` | WorldBookManager（默认折叠 + 普通/缓存世界书分区 + JSON 批量导入/operations 修改 + 升华按钮） |

### pwa/
| 文件 | 职责 |
|------|------|
| `src/pwa/sw.ts` | Service Worker：Cache-First，预缓存 `/`，清理旧 cache，跳过 `/api/` `/v1/` |

---

## 三、消息流水线 · 完整案例拓扑

以「哈吉鼠 (charB)」对话为例，一条消息从输入到渲染的完整流水线：

```
     ┌──────────────┐
     │植入记忆&状态书 │──── 若开启: 插入 system Memory 节点（含最新蒸馏+状态书）
     │arm机制(一次性)│
     └──────┬───────┘
            ▼
     ┌──────────────────────────────┐
     │ 0. 用户输入文本              │
     └──────────┬───────────────────┘
                ▼
     ┌──────────────────────────────┐
     │ 1. 世界书扫描 · A书+缓存书匹配 │  ← escapeRegExp 防ReDoS + includes快路径
     │    匹配→activatedWorldBookEntries│  ← 每词条独立冷却(currentRound-cooldown)
     └──────────┬───────────────────┘
                ▼
     ┌──────────────────────────────┐  ┌─────────────────────┐
     │ 2. 上下文组装 assembleContext │◀─│ 五源注入              │
     │   高优预算: 85% (System+世界书 │  │ ① 角色SystemPrompt    │
     │   +蒸馏+状态书)               │  │ ② 世界书(逐条冷却)     │
     │   最近对话: 15-25% (逆序截断)  │  │ ③ 蒸馏记忆(maxDistilledNodes) │
     └──────────┬───────────────────┘  │ ④ 状态书/Galgame(非对称)│
                ▼                        │ ⑤ 最近对话(包裹隔离)   │
     ┌──────────────────────────────┐  └─────────────────────┘
     │ 3. 角色隔离 · 消息包裹头变换   │
     │   user → 【交互用户】「内容」  │
     │   对方 → 【独立实体(名)】「内容」│
     │   末尾 → 身份锚点 system       │
     └──────────┬───────────────────┘
                ▼
     ┌──────────────────────────────┐
     │ 4. SSE 流式 API 请求           │  ← 30s idle timeout
     │   (reasoning_effort if thinking)│     AbortError→部分保存
     └──────────┬───────────────────┘
                ▼
     ┌──────────────────────────────┐
     │ 5. AI 回复 (DeepSeek兼容       │  ← content / reasoning_content / text
     │    三字段解析)                 │
     └──────────┬───────────────────┘
                ▼
     ┌──────────────────────────────┐
     │ 6. 新增 assistant 节点入库     │  ← tokenCost = usage.completion_tokens
     │   + 回写 user 节点元数据       │     或 length*0.5 估计
     └──────────┬───────────────────┘
                ▼
     ┌──────────────────────────────┐  ┌──────────────┐  ┌──────────────┐
     │ 7. 后处理触发器                │─▶│ 状态书/Galgame │  │ 蒸馏检查      │
     │   scribeEnabled && modelId     │  │ count%interval │  │ unarchived    │
     │   assistantCount%interval=0   │  │ ===0 → 触发!   │  │ >=threshold   │
     │   scribeMode 匹配              │  └──────┬───────┘  │ →触发蒸馏     │
     └──────────┬───────────────────┘         │          └──────┬───────┘
                ▼                              ▼                 ▼
     ┌──────────────────────────────┐  ┌──────────────┐  ┌──────────────┐
     │ 8. 前端 UI 渲染               │  │ Galgame四段式  │  │ 蒸馏→distilled│
     │   MessageBubble + 操作工具栏   │  │ [system,user, │  │ 节点(ts+1ms)  │
     │   + GalgameCard/状态书吸附卡    │  │  assistant×N, │  │ 原节点归档    │
     │   + boldColorize 角色色系着色  │  │  user]        │  └──────────────┘
     └──────────────────────────────┘  └──────────────┘
```

### 阶段说明

| 阶段 | 动作 | 关键逻辑 |
|------|------|----------|
| 0 | 用户输入 | 植入记忆 arm 机制（一次性 system 节点），`Shift+Enter` 快捷发送 A |
| 1 | 世界书扫描 | 对角色 A 世界书与 `<缓存世界书>` 并行扫描；`escapeRegExp` 防 ReDoS；priority 降序；逐条独立冷却 |
| 2 | 上下文组装 | 高优先 85%（角色 + 世界书 + 蒸馏 + 状态书）+ 最近对话 15-25%；逆序截断 |
| 3 | 角色隔离 | USER_WRAPPER / OTHER_CHAR_WRAPPER / 末尾身份锚点（简化版单句） |
| 4 | API 请求 | SSE 流式 + 30s 空闲超时 AbortController；thinking 时附加 `reasoning_effort` |
| 5 | AI 回复 | `content` / `reasoning_content` / `text` 三字段兼容解析 |
| 6 | 写回元数据 | `activatedWorldBookEntries` / `tokenEstimate` / `tokenCost` / `tokenCostIsExact` / `implantedMemory` |
| 7 | 后处理触发 | 状态书/Galgame（`assistantCount % triggerInterval === 0`）；蒸馏（`unarchived >= triggerThreshold`） |
| 8 | UI 渲染 | 气泡 + 操作工具栏（分支/编辑/重试/删除）+ 吸附卡 + `boldColorize` 着色 |

---

## 四、状态书与 Galgame 数值引擎子系统

### 全局预设（持久化到 ui_settings）

| 配置项 | 可选值 | 作用 |
|--------|--------|------|
| `scribeEngine` | text / galgame | 文本总结模式 / 数值引擎模式 |
| `scribeMode` | charA / charB / auto | 状态书绑定到哪个角色 |
| `scribeModelId` | 模型 ID | 状态书独立模型通道（每对话可覆盖） |
| `scribeTriggerInterval` | 1-20 | 文本模式触发间隔（Galgame 固定 2） |
| `scribeCacheWorldBookEnabled` | boolean | 状态书 AI 是否读取并维护当前角色绑定的 `<缓存世界书>` |

### 触发调度

```
条件: scribeEnabled && scribeModelId && assistantCount>0
      && assistantCount % triggerInterval === 0
      && (scribeMode==='auto' || scribeMode===aiRole)

间隔:
  galgame → 固定 GALGAME_TRIGGER_INTERVAL = 2
  text   → scribeTriggerInterval（用户配置，默认 5）
```

### 双引擎分流

| | 文本模式 (text) | Galgame 数值引擎 |
|------|------|------|
| 函数 | `triggerScribeSummary` | `triggerGalgameEngine` |
| 上下文 | `[system(prompt), system(可选缓存书维护提示), user(纯对话)]` | `[system, system(可选缓存书维护提示), user(角色卡), assistant(状态书×N), user(对话)]` |
| 输入范围 | 全部非系统消息 | 最近 2 轮（`cleanDialogueText` 清洗） |
| Token / 温度 | 模型默认 | max_tokens=2000, temperature=0.3, top_p=0.85 |
| 解析 | 纯文本 | `parseGalgameResponse` 4 级兜底 + 名字强校验 |
| 产物 | `MessageNode.scribeUpdate` | `MessageNode.galgameData` |

### Galgame 非对称注入（防 AI 谄媚作弊）

| 对象 | 看到什么 | 来源函数 |
|------|----------|----------|
| 玩家（UI） | GalgameCard 精确数值（❤️×5, ⭐×3 等像素卡片） | `GalgameCard` 组件 |
| 主 AI（上下文） | 模糊描述：「角色当前状态疲惫，外在情绪傲娇，对方对你表现出好感与亲近…」 | `buildGalgameSystemInjection` + `affinityToDescription` |

两套模板：情况 A（当前回戏角色 → `[系统环境提示]…`）；情况 B（旁观 NPC → `[当前场景NPC状态]…`）。表里好感度都模糊化，防止 AI 自我谄媚。

### GalgameCard 图标映射

| 字段 | 映射 | 图标 |
|------|------|------|
| health | 1-5 ❤️ | 濒危=1 ~ 极佳=5 |
| mood | Switch | 傲娇→💢 欣喜→✨ 害羞→😊 愤怒→🔥 感动→🌟 悲伤→💧 恐惧→😨 冷漠→❄️ 惊讶→❓ 得意→😏 |
| vigilance | 分段 | <25→☀️松懈 <50→☁️平和 <75→🛡️警觉 ≥75→🗡️敌意 |
| surfaceAffinity | 1-5 ⭐ | <=-30→1 ~ >=70→5 |
| hiddenAffinity | 1-5 ❤️ | 同上 |

---

## 五、核心业务逻辑流程

### 5.1 上下文拼装（assembleContext）

```
预算分配:
  recentBudget = min(0.25*max, max(600, 0.15*max))
  highPriorityBudget = max - recentBudget

注入顺序（高优先 → 低优先）:
  ① 角色SystemPrompt（全额计入高优先）
  ② 世界书条目（逐条冷却检查，跳过未冷却条目，受高优先预算截断）
     模板: tplWorldBookPrefix.replace('{key}', keys[0]).replace('{value}', value)
  ③ 蒸馏记忆（skipAutoDistilled 时跳过，受高优先预算截断，最近 maxDistilledNodes 条）
     模板: tplDistilledPrefix.replace('{content}', ...)
  ④ 状态书/Galgame（遍历历史，紧跟 assistant 节点后注入 system 消息）
     模板: tplStateBookPrefix / buildGalgameSystemInjection
  ⑤ 最近对话（逆序截断至 recentBudget）
     user → tplUserWrapper 包裹
     对方角色 → tplOtherCharWrapper 包裹
     目标角色 → assistant 原文
     角色 system 节点（植入记忆）→ 原文
  ⑥ 末尾身份锚点 system
     模板: tplIdentityAnchor.replace('{charName}', ...).replace('{otherCharName}', ...)

metadata 输出: tokenEstimate / highPriorityTokens / worldBookMatches / distilledNodesUsed / activatedWorldBookEntries
```

### 5.2 角色隔离

| 机制 | 包裹模板（默认值，用户可编辑） | 目的 |
|------|------|------|
| USER_WRAPPER | `【交互用户 (真正的 user) · 场景输入】\n「 {content} 」` | 防止 AI 把 user 消息当成自己的话 |
| OTHER_CHAR_WRAPPER | `【独立实体 ({otherCharName}) · 场景输入】\n「 {content} 」` | 告知目标 AI"这是另一个独立实体"而非 user |
| 身份锚点（末尾 system） | `[当前角色: {charName}] 请以 {charName} 的身份回复。` | 近因效应对抗长对话角色漂变 |

### 5.3 世界书扫描与注入

- **扫描**：`useWorldBookScanner.scan(worldBookId, recentMessages, maxEntries)`
  - 快路径：`scanPoolLower.includes(key.toLowerCase())`
  - 兜底：`new RegExp(escapeRegExp(key), 'i')`（防 ReDoS）
  - 按 priority 降序取前 maxEntries
- **双绑定**：`Character.worldBookId` = A 世界书（手动维护）；`Character.cacheWorldBookId` = `<缓存世界书>`（状态书 AI 辅助维护，非必选）
- **合并**：`useChat.scanBoundWorldBooks()` 并行扫描 A/缓存两本书，去重后按 priority 排序，再受 `maxWorldBookEntries` 限制
- **缓存世界书限制**：`kind='cache'` 或 `entryLimit=10` 的世界书被视为缓存书，所有 UI/Hook/AI 写入最终只保留 10 条
- **冷却**：`cooldown = max(1, floor(recentRounds / 3))`，每条独立维护（`worldBookCooldownRef` Map），注入后开始冷却
- **注入**：`assembleContext` 内受 highPriorityBudget 截断，`tplWorldBookPrefix` 模板

### 5.4 蒸馏流程

```
触发: 手动 triggerDistillation / 自动(autoTriggerDistillation && unarchived>=threshold)
  ↓
拼装未归档节点文本 "{senderName}: {content}\n\n"
  ↓
套用 distillationPrompt 的 {dialogue} 占位
  ↓
非流式调用蒸馏模型
  ↓
生成 distilled 节点:
  role='distilled', senderName='记忆结晶'
  内容 = tplDistilledNodePrefix 模板（📝 记忆 第1轮-第{total}轮:{summary}）
  timestamp = 最后被蒸馏节点 ts + 1ms  ← 防蒸馏期间新消息导致时序错乱
  ↓
批量 batchUpdateNodes → 原节点 isArchived=true
```

### 5.5 状态书 / 第三书记员

- **属性化重构**：不再独立 scribe 消息节点，绑定到 assistant 节点的 `scribeUpdate` 属性
- **触发**：scribeEnabled && scribeModelId && assistantCount % triggerInterval === 0 && scribeMode 匹配
- **文本模式**：messages = `[system(scribeSystemPrompt), user(纯对话文本)]`；非流式；写 `scribeUpdate`
- **缓存世界书维护**：开启 `scribeCacheWorldBookEnabled` 且目标角色绑定 `<缓存世界书>` 时，状态书/Galgame 调用会追加 `buildCacheWorldBookPrompt()`；提示词模板来自 `tplCacheWorldBookPrompt || DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT`
- **JSON 修改接口**：AI 只能在结尾追加 `<CACHE_WORLDBOOK_JSON>{"operations":[...]}</CACHE_WORLDBOOK_JSON>`；前端用 `extractCacheWorldBookPatch()` 剥离，不污染状态书正文
- **写入策略**：`mergeCacheWorldBookEntries()` 支持 `upsert/delete`，按首关键词去重，priority clamp 1-10，并裁剪到 10 条
- **注入**：assembleContext 遍历时紧跟 assistant 后注入 system 消息（`tplStateBookPrefix`）
- **编辑**：气泡编辑模式可同时篡改 content 与 scribeUpdate.rawText
- **手动触发**：StateBookPanel 支持手动触发，四段式与 useChat 自动触发一致

### 5.6 Galgame 引擎

```
触发间隔: 每 2 轮（GALGAME_TRIGGER_INTERVAL=2）
  ↓
四段式上下文组装:
  ① system: buildGalgamePrompt(charName, customPrompt?)  ← 姓名强绑定
  ② user: 角色卡 systemPrompt → tplGalgameCharInjection 包裹
  ③ assistant×N: 最近 2 个 serializeGalgameData 状态书
  ④ user: 最近 2 轮 cleanDialogueText 清洗后对话
  ↓
参数: max_tokens=2000, temperature=0.3, top_p=0.85
  ↓
parseGalgameResponse(raw, charName):
  四级兜底: 直接parse / match{[\s\S]*} / 去换行parse / match{[^}]+}
  名字强校验: expectedName 错则强制修正+warn
  字段 clamp 到合法范围
  ↓
写入 assistant.galgameData → UI 渲染 GalgameCard
```

### 5.7 互相认识

```
入口: ChatInput 工具箱 🤝互相认识 按钮
  ↓
并发两个 AI 请求（Promise.all）:
  主 AI 分别观察对方角色卡 systemPrompt
  prompt = mutualObservePrompt || DEFAULT_MUTUAL_OBSERVE_PROMPT
  temperature=0.3, max_tokens=200
  ↓
cleanObservation 后处理:
  剥离 "好的/首先/我来" 等推理前缀
  保留含 "身高/穿着/带/戴" 等描述特征词段落
  兜底取最长段落
  ↓
写入世界书:
  为每个角色在其 A 世界书插入/覆盖 key=对方角色名、priority=10 的条目
  若角色无 A 世界书或绑定已被删除 → 自动新建 kind='manual' 并绑定
```

### 5.8 分支

```
MessageBubble 分支按钮 → ChatArea.handleBranch(nodeId)
  → useMessageNodes.cloneToNewConversation:
    取 branchPoint 及之前所有消息
    新建对话(标题+「(分支)」, 同 charA/charB)
    批量克隆(newId) → Stores.addMessageNodes 一次 I/O
    克隆源对话的 GlobalState
    切换到新对话
```

### 5.9 重试 / 重新生成

```
MessageBubble 重新生成按钮 → ChatArea.handleRetry(nodeId)
  仅对 charA/charB 节点生效
  向前找最近 user 节点（找不到报错）
  级联删除: 从被重试节点起到末尾全部删除（含后续 system/distilled/scribe）
  重新发送: sendMessage(target, userContent, { skipUserNode:true, existingUserNodeId })
    → 复用既有 user 节点，不再插新 user
    → isRetry=true，跳过植入记忆逻辑
```

### 5.10 流式 SSE

```
SSEParser.parse(Uint8Array):
  TextDecoder stream → buffer 拼接 → 按行 split
  识别 data: [DONE] / data: {...}
  json.choices[0].delta.content 累加
  json.usage → tokenUsage

useChat:
  fetch(..., stream:true)
  reader.read() 循环
  每次启动 30s idle timer → 超时 abort.abort()
  AbortError + fullContent 非空 → 仍保存为部分节点
```

### 5.11 Token 截断 / 预算

| 项 | 说明 |
|------|------|
| 估算 | 1 字符 ≈ 0.5 token（`estimateTokens`） |
| 预算 | `recentBudget = min(0.25*max, max(600, 0.15*max))`，高优先 = max - recentBudget |
| 截断 | 世界书/蒸馏受高优先预算限制；最近对话整体受 maxTokens 限制，逆序逐条累加 |
| 记录 | assistant `tokenCost` = `usage.completion_tokens`（精确）或 `length*0.5`（估计）；气泡底部显示 `✨ N Tokens` / `⚡ Est. N Tokens` |
| user | `tokenEstimate` 回写；气泡底部展示预估 token + 激活世界书列表 |

---

## 六、设置页全量拓扑（SettingsPanel）

SettingsPanel 内部用 `useApp` 派发，无 props。两个本地折叠状态：`observeOpen`、`advOpen`。

### Section 1 — 主题与壁纸

| 设置项 | 控件 | Action | 说明 |
|--------|------|--------|------|
| 主题模式 | 浅色/深色双按钮 | `SET_THEME` | 切换 Tailwind `dark` class |
| AI 气泡加粗变色 | Toggle | `SET_BOLD_COLORIZE` | 开启后 `<strong>` 按角色色系着色（A 翠绿/B 紫罗兰/scribe 琥珀），浅深主题各取 -700/-300 色阶 |
| 背景壁纸 | 上传/移除按钮 | `SET_WALLPAPER {image}` | `processWallpaper` 压缩 1920px JPEG 75% |
| 遮罩透明度 | range 0-1 | `SET_WALLPAPER {overlayOpacity}` | 仅有壁纸时显示 |
| 遮罩模式 | 白色/黑灰 | `SET_WALLPAPER {overlayMode}` | 仅有壁纸时显示 |

### Section 2 — 记忆蒸馏

| 设置项 | 控件 | Action | 说明 |
|--------|------|--------|------|
| 触发阈值(轮数) | range 5-50 | `UPDATE_DISTILLATION_CONFIG {triggerThreshold}` | 未归档消息达此值触发蒸馏 |
| 自动触发蒸馏 | Toggle | `UPDATE_DISTILLATION_CONFIG {autoTrigger}` | fire-and-forget |
| 蒸馏提示词模板 | textarea 4 行 | `UPDATE_DISTILLATION_CONFIG {distillationPrompt}` | `{dialogue}` 占位 |

### Section 3 — 上下文配置

| 设置项 | 控件 | Action | 说明 |
|--------|------|--------|------|
| 最近轮数 M | range 5-50 | `UPDATE_CONTEXT_CONFIG {recentRounds}` | 上下文窗口最近对话条数 |
| 最大蒸馏节点数 N | range 1-15 | `UPDATE_CONTEXT_CONFIG {maxDistilledNodes}` | 注入上下文的蒸馏记忆上限 |

### Section 4 — 独立状态书

| 设置项 | 控件 | Action | 说明 |
|--------|------|--------|------|
| 启用状态书(吸附到 AI 气泡) | Toggle | `SET_SCRIBE_ENABLED` | — |
| 默认维护`<缓存世界书>` | Toggle | `SET_SCRIBE_CACHE_WORLDBOOK_ENABLED` | 新对话/未设置对话的默认值，状态书面板可按对话覆盖 |
| 状态书引擎 | 文本/Galgame | `SET_SCRIBE_ENGINE` | Galgame = 超低消耗数值引擎，每 2 轮 |
| Galgame 引擎 Prompt | textarea 6 行 | `SET_GALGAME_PROMPT` | 仅 Galgame 模式显示 |
| 插入策略模式 | charA/charB/auto | `SET_SCRIBE_MODE` | — |
| AI 总结触发间隔 | range 1-20 | `SET_SCRIBE_TRIGGER_INTERVAL` | 仅文本模式 |

### Section 5 — 🤝 互相认识 · 观察提示词（可折叠）

| 设置项 | 控件 | Action | 说明 |
|--------|------|--------|------|
| 观察提示词 | textarea 8 行 | `SET_MUTUAL_OBSERVE_PROMPT` | `{charPrompt}` 占位 |
| 恢复默认 | 按钮 | — | 重置为 DEFAULT_MUTUAL_OBSERVE_PROMPT |

### Section 6 — 数据管理

| 操作 | 说明 |
|------|------|
| 导出数据 | 全部 store 为 JSON 下载，**导出时自动剔除 apiKey** |
| 导入数据 | JSON 恢复，导入前表级 schema 校验；写入失败会尝试回滚已写入 store；**强制清空 apiKey**（需手动重填） |
| 存储 | 全部 IndexedDB，不上传 |

### Section 7 — ⚠️ 高级提示词设置（可折叠）

警告框（theme-aware `bg-red-50 dark:bg-red-950/30`），展开后 13 个模板编辑器：

| # | 模板 key | 占位符 | 功能 |
|---|----------|--------|------|
| 1 | `tplUserWrapper` | `{content}` | 真正 user 消息包裹 |
| 2 | `tplOtherCharWrapper` | `{otherCharName}`, `{content}` | 对方角色消息包裹 |
| 3 | `tplIdentityAnchor` | `{charName}`, `{otherCharName}` | 结尾身份锚点 |
| 4 | `tplWorldBookPrefix` | `{key}`, `{value}` | 世界书注入前缀 |
| 5 | `tplDistilledPrefix` | `{content}` | 蒸馏摘要注入前缀 |
| 6 | `tplStateBookPrefix` | `{content}` | 状态书注入前缀 |
| 7 | `tplEavesdropAppend` | 无 | 旁听附加指令 |
| 8 | `tplGalgameCharInjection` | `{charPrompt}` | Galgame 角色卡注入 |
| 9 | `tplImplantMemoryPrefix` | `{content}` | 植入记忆结晶前缀 |
| 10 | `tplImplantScribePrefix` | `{content}` | 植入状态书前缀 |
| 11 | `tplDistilledNodePrefix` | `{total}`, `{summary}` | 蒸馏节点生成格式 |
| 12 | `tplCacheWorldBookPrompt` | `{limit}`, `{manualKeys}`, `{cacheEntries}` | 状态书AI操控 `<缓存世界书>` 时追加的 JSON 读写接口提示词 |
| 13 | `tplReverseEngineer` | `{worldBook}`, `{originalPrompt}` | 高级卡逆向提示词 |

每个有"恢复默认"按钮（`SET_ADV_TPL` value=''）。

### Section 8 — ⚠️ 调试功能

| 设置项 | 控件 | Action | 说明 |
|--------|------|--------|------|
| 调试·原始提示词下载 | Toggle | `TOGGLE_DEBUG` | 开启后 AI 气泡底部出现「📄 导出发送给该角色的原始 Prompt」按钮 |

---

## 七、状态层拓扑

### AppState 全部字段

| 字段 | 类型 | 持久化 | 说明 |
|------|------|--------|------|
| `activeView` | ViewType | ✗ | 当前导航视图 |
| `currentConversationId` | string\|null | ✗ | 当前对话 |
| `currentChatModelId` | string\|null | ✓ | 聊天模型 |
| `currentDistillModelId` | string\|null | ✓ | 蒸馏模型 |
| `currentScribeModelId` | string\|null | ✓ | 状态书模型 |
| `isMobile` | boolean | ✗ | 媒体查询检测 |
| `sidebarOpen` | boolean | ✗ | 侧边栏展开 |
| `theme` | 'light'\|'dark' | ✓ | 主题 |
| `wallpaper` | WallpaperConfig | ✓ | 壁纸配置 |
| `boldColorize` | boolean | ✓ | AI 气泡加粗变色 |
| `scribeEnabled` | boolean | ✓ | 状态书启用 |
| `scribeCacheWorldBookEnabled` | boolean | ✓ | 默认维护 `<缓存世界书>` |
| `scribeInterval` | number | ✗ | 状态书注入间隔（已由 triggerInterval 替代） |
| `scribeTriggerInterval` | number | ✓ | AI 总结触发间隔 |
| `scribeSystemPrompt` | string | ✓ | 书记员 System Prompt |
| `scribeMode` | ScribeMode | ✓ | 插入策略模式 |
| `scribeEngine` | ScribeEngine | ✓ | 引擎类型 |
| `galgamePrompt` | string | ✓ | Galgame 自定义 Prompt |
| `mutualObservePrompt` | string | ✓ | 互相认识观察提示词 |
| `thinkingEnabled` | boolean | ✓ | 深度思考 |
| `debugMode` | boolean | ✓ | 调试模式 |
| `distillationConfig` | DistillationConfig | ✗ | 蒸馏配置 |
| `contextConfig` | ContextAssemblyConfig | ✗ | 上下文配置 |
| `tpl*` (13 个) | string | ✓ | 高级提示词模板 |

### AppAction 全部 25 个

```
SET_VIEW, SET_CONVERSATION, SET_CURRENT_CONVERSATION,
SET_CHAT_MODEL, SET_DISTILL_MODEL, SET_SCRIBE_MODEL,
SET_MOBILE, TOGGLE_SIDEBAR,
SET_THEME, SET_WALLPAPER, SET_BOLD_COLORIZE,
SET_SCRIBE_ENABLED, SET_SCRIBE_CACHE_WORLDBOOK_ENABLED,
SET_SCRIBE_INTERVAL, SET_SCRIBE_TRIGGER_INTERVAL,
SET_SCRIBE_SYSTEM_PROMPT, SET_SCRIBE_MODE, SET_SCRIBE_ENGINE,
SET_GALGAME_PROMPT, SET_MUTUAL_OBSERVE_PROMPT,
TOGGLE_THINKING, TOGGLE_DEBUG,
UPDATE_DISTILLATION_CONFIG, UPDATE_CONTEXT_CONFIG,
SET_ADV_TPL (通用模板写入，key+value)
```

---

## 八、数据持久化层

### 三级存储架构

| 存储层 | Store | 内容 | 范围 |
|--------|-------|------|------|
| 持久化 UI | `ui_settings` | theme, wallpaper, boldColorize, scribeEngine/Mode, galgamePrompt, mutualObservePrompt, 13 个 tpl*, thinkingEnabled, debugMode, scribeEnabled, scribeCacheWorldBookEnabled | 跨会话全局 |
| 会话级 | `global_states` | scribeModelId, scribeEnabled, scribeTriggerInterval, scribeSystemPrompt, scribeCacheWorldBookEnabled | 每对话独立 |
| 运行时 | useChat hook | implantMemoryArmed, roundCounterRef, worldBookCooldown, lastPrompt | 内存，不持久化 |

### 8 个 IndexedDB Store

| Store | 内容 | CRUD 函数 |
|-------|------|-----------|
| `tavern_models` | 模型配置 | getAllModels / getModelById / addModel / updateModel / deleteModel |
| `tavern_characters` | 角色卡（A 世界书 ID + 缓存世界书 ID） | getAllCharacters / getCharacterById / addCharacter / updateCharacter / deleteCharacter |
| `tavern_conversations` | 对话 | getAllConversations / getConversationById / addConversation / updateConversation / deleteConversation |
| `tavern_conversation_folders` | 对话文件夹（只保存 conversationIds） | getAllConversationFolders / addConversationFolder / updateConversationFolder / mutateConversationFolders / deleteConversationFolder |
| `tavern_message_nodes` | 消息节点 | getMessageNodesByConversation / addMessageNode / **addMessageNodes**(批量) / updateMessageNode / deleteMessageNode / **batchUpdateNodes** / deleteMessageNodesByConversation |
| `tavern_worldbooks` | 世界书 | getAllWorldBooks / addWorldBook / updateWorldBook / deleteWorldBook |
| `tavern_global_states` | 每对话全局状态 | getGlobalStateByConversation / setGlobalState / **patchGlobalState**(原子) / deleteGlobalState |
| `tavern_ui_settings` | UI 设置 | getUISettings / setUISettings（锁内读改写合并） |

### 写锁机制

- `storeWriteLocks: WeakMap<LocalForage, Promise<void>>` — 每个 store 独立 Promise 链锁
- `withStoreLock(store, fn)` — 串接锁链尾部，rejection 吞掉防永久阻塞
- `mutateStore(store, fn)` — 统一 mutating 入口（锁内读改写）
- 纯读不入锁 — localForage.getItem 原子，写写互斥即可保证不丢数据

---

## 九、UI 层拓扑

### 消息气泡（MessageBubble）

| 元素 | 样式/逻辑 |
|------|-----------|
| 头像 | emoji 或 base64 图片（characterA/B.avatar） |
| 气泡形状 | 用户 `rounded-2xl rounded-br-sm`；AI `rounded-2xl rounded-bl-sm` |
| 气泡颜色 | `BUBBLE_COLORS`：user 蓝渐变白字、charA emerald 浅底深字、charB violet、system slate、distilled amber |
| Markdown | `<MarkdownRenderer boldColorize boldRole>` — 加粗按角色色系着色 |
| 状态书吸附卡 | `border-t border-dashed border-amber` + amber 背景文字 |
| Galgame 卡 | GalgameCard 像素风面板 |
| 操作工具栏 | hover 浮现：分支/编辑/重试/删除（圆角 icon 按钮） |
| 编辑模式 | textarea（user 气泡白字 + `bg-white/15`；AI 气泡 `bg-black/10 dark:bg-black/20`） + scribe 篡改 + Galgame 篡改 + 取消/保存 |
| 确认弹窗 | 重试确认 Modal + 删除确认 Modal |

### 输入栏（ChatInput）

| 层级 | 按钮 | 说明 |
|------|------|------|
| **主操作栏（常驻）** | 发送A / 发送B / 旁听 / ⏹停止(仅流式) / 📝工具 | 工具按钮靠右，琥珀色高亮态 |
| **次级工具栏（折叠展开）** | 🧠深度思考 / 🧬植入记忆 / 🤝互相认识(+hover提示) / 📜状态书 / 蒸馏 | `toolsOpen` 控制，展开时顶部分隔线 |

### 布局

| 组件 | 逻辑 |
|------|------|
| MainLayout | 桌面双栏：TopBar + Sidebar + Main |
| MobileLayout | 抽屉式侧边栏 + 底部 4-tab 导航 |
| Sidebar | 4 个 tab：对话/世界书/角色/状态书 |
| TopBar | Logo + 菜单按钮(移动) + 设置按钮 |

### 对话列表（ConversationList）

| 功能 | 逻辑 |
|------|------|
| 文件夹收纳 | `ConversationFolder.conversationIds` 引用对话 ID；同一对话只允许出现在一个文件夹 |
| 大队列 | 未被任何文件夹收纳的对话自动显示在“大队列” |
| 管理文件夹 | 弹窗内重命名、从大队列添加对话、把已收纳对话移回大队列 |
| 删除文件夹 | 二次确认；只删除文件夹记录，不删除内部对话 |
| 预制教学对话 | 首次升级/初始化后一次性收纳到“预制教学对话”文件夹，默认折叠；用户删除后不反复重建 |

---

## 十、系统总拓扑 · 五层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  ① UI 视图层                                                          │
│  桌面/移动适配 · 对话页 · 角色管理 · 世界书 · 状态书 · 设置(8区块)     │
│  MessageBubble(编辑/重试/删除/分支/调试导出) + boldColorize着色        │
│  ChatInput(主操作+折叠工具箱) · GalgameCard(像素风) · DistilledBubble  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  ② 功能子系统                                                        │
│  双世界书扫描器(A书+缓存书 · escapeRegExp防ReDoS · 逐条冷却)             │
│  状态书/Galgame双引擎(text总结 / galgame四段式 · 缓存书JSON维护)        │
│  记忆蒸馏(阈值触发 · ts+1ms防时序错乱)                                 │
│  互相认识(并发AI观察 · cleanObservation · 世界书交叉插入)              │
│  对话文件夹(收纳折叠 · 大队列 · 删除文件夹不删除对话)                  │
│  分支(批量克隆O(1)) · 重试(级联删除+复用user节点)                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  ③ 核心引擎层                                                        │
│  上下文组装引擎(assembleContext · Token预算 · 角色隔离 · 13模板可编辑)  │
│  聊天发送引擎(SSE流式 · 30s空闲超时 · DeepSeek三字段兼容)              │
│  Token截断(高优85%+对话15-25%) · tokenCost精确/估计记录               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  ④ 状态与配置层                                                      │
│  useApp reducer(25 actions) · AppState字段持久化                         │
│  高级提示词13模板(SET_ADV_TPL) · boldColorize · theme/wallpaper       │
│  互相认识Prompt · GalgamePrompt · 蒸馏配置 · 上下文配置                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────┐
│  ⑤ 数据持久化层 · IndexedDB (localForage) + 写锁                      │
│  models · characters · conversations · conversation_folders            │
│  message_nodes · worldbooks · global_states · ui_settings              │
│  storeWriteLocks(WeakMap) · mutateStore(锁内读改写) · 纯读不入锁        │
└─────────────────────────────────────────────────────────────────────┘
```

### 数据流向总结

```
角色卡(systemPrompt, 名字, 头像, worldBookId, cacheWorldBookId)
     ├──→ assembleContext (System Prompt 注入)
     │
世界书词条(keywords, value, priority)
     ├──→ A 世界书: 手动维护/互相认识写入/升华目标
     ├──→ <缓存世界书>: 状态书 AI JSON upsert/delete，最多 10 条
     ├──→ useWorldBookScanner (A书+缓存书关键词匹配 + escapeRegExp + 逐条冷却)
     ├──→ assembleContext (highPriorityBudget 内注入为 system)
     ├──→ 互相认识 (AI观察 → 交叉插入对方 A 世界书)
     │
蒸馏记忆(distilled节点, triggerThreshold)
     ├──→ assembleContext (skipAuto时跳过, 最近 maxDistilledNodes 条)
     │
状态书/Galgame(scribeUpdate / galgameData)
     ├──→ assembleContext (紧跟原 assistant 后注入)
     │    galgame: buildGalgameSystemInjection 非对称模糊(防谄媚)
     ├──→ 可选维护 <缓存世界书> (剥离 CACHE_WORLDBOOK_JSON 后写入)
     │
对话历史(user / charA / charB)
     ├──→ 角色隔离包裹 (tplUserWrapper / tplOtherCharWrapper)
     ├──→ 末尾身份锚点 (tplIdentityAnchor)
     └──→ assembleContext (recentBudget 逆序截断)

最终: messages[] → SSE API → AI 回复 → 前端渲染(boldColorize)
```

---

## 十一、关键工程加固点

| 修复项 | 问题 | 方案 |
|--------|------|------|
| 角色漂变 | 对方消息密度过高导致目标角色人格被覆盖 | 末尾身份锚点 + 包裹头区分 + 简化单句锚点 |
| 蒸馏时序错乱 | fire-and-forget 期间新消息导致记忆结晶串到新消息后 | distilled 节点 ts = 被蒸馏末尾 ts + 1ms |
| 世界书 ReDoS | `(a+)+b` 关键词灾难性回溯 | `escapeRegExp` 转义 + `includes` 快路径 |
| 缓存世界书过载 | 状态书 AI 自动写入导致条目膨胀、注意力过载 | `CACHE_WORLD_BOOK_LIMIT=10`，UI/Hook/AI merge 三层裁剪 |
| 状态书 JSON 污染正文 | AI 在状态书末尾输出缓存修改 JSON | `<CACHE_WORLDBOOK_JSON>` 标签剥离后再写 `scribeUpdate` / `galgameData` |
| Ping 假绿 | 401/404/500 按延迟误判可用 | `latency = -400 - status` 编码，UI 翻译回 HTTP 错误类 |
| Ping 负数误导 | HTTP 错误码显示为负数 ms | ModelManager 翻译 400/401/403/404/429/5xx，ModelPing 改为连接问题折叠说明 |
| 对话列表过长 | 长期使用后对话大队列难以扫描 | `conversation_folders` 独立 store 收纳折叠；删除文件夹只释放对话回大队列 |
| Galgame 解析碎裂 | 换行 + 额外文字导致 JSON.parse 失败 | 4 级递进解析 + 名字强校验 + 字段 clamp |
| 分支 O(n²) | 逐条 addMessageNode 全表读写 | `addMessageNodes` 批量单次读改写 |
| SW 子路径 404 | `/sw.js` 绝对路径在 Pages 子路径失败 | 改 `./sw.js` 相对路径 |
| 删除对话残留 | 三步串行一步失败留孤儿 | best-effort 独立 try-catch 三步 |
| globalState 竞态 | 读改写不在同一锁 | `patchGlobalState` 原子合并 |
| SSE 僵死 | 服务端不发 DONE 也不断流 | 30s idle timeout AbortController |
| 导出泄露 apiKey | models 原样序列化明文写入 | 导出剔除 apiKey，导入强制清空 |
| 备份导入半写入 | 多 store 逐项 setItem，中途失败造成数据不一致 | 导入前统一 schema 校验；写入阶段保存旧值并在失败时回滚 |
| 人物卡标签覆盖 | 安全词/输出要求手动编辑后，再点标签会静默覆盖自定义内容 | 手动编辑清空标签选中态；空选中态再点标签时追加到当前文本 |
| 编辑态用户气泡黑字 | 蓝底 `text-slate-900` 看不清 | 用户气泡编辑框 `text-white + bg-white/15` |
| 高级提示词不可编辑 | 功能性提示词硬编码导致用户无法审计/进阶 DIY | 全链路 13 个 `tpl*` 模板可编辑 + SettingsPanel 折叠编辑器 |
| 身份锚点过重 | 6 句锚点影响角色思考 | 简化为单句 `[当前角色: {charName}] 请以 {charName} 的身份回复。` |

---

## 十二、PWA 配置

| 项 | 配置 |
|----|------|
| 构建插件 | `viteSingleFile()` — 单 HTML，JS/CSS 全内联 |
| `assetsInlineLimit` | 100MB（全部资源内联） |
| manifest | `name: "Tavern AI Sandbox"`, `display: standalone`, `start_url: "."` |
| theme-color | `#0f172a` |
| viewport | `viewport-fit=cover` |
| SW 策略 | Cache-First，预缓存 `/`，跳过 `/api/` `/v1/`，清理旧 cache |
| SW 注册 | `./sw.js` 相对路径（适配 GitHub Pages 子路径） |

---

*本文档基于源码实读全量生成，覆盖全部功能、设置、子项与业务逻辑。*
