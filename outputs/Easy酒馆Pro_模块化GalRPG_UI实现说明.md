# Easy酒馆Pro 模块化 Gal/RPG UI 实现说明

> 更新：2026-08-06 · 适配 v1.3 内测版 ModuleRpgCard 视觉重构版

本文只说明「组装预览」和聊天气泡中的模块化 Gal/RPG UI 如何渲染、如何改外观。若只是改视觉，不需要修改书记 AI 请求、JSON 解析或世界书逻辑。

## 1. 先看整体关系

```text
角色回复节点 moduleRpgData
        |
        v
MessageBubble.tsx
        |
        +----> ModuleRpgCard.tsx  <---- 最终聊天气泡里的实际模块 UI
        |
状态书页面 StateBookPanel.tsx
        |
        +----> buildAssemblyPreview() 生成示例状态
        |
        +----> ModuleRpgCard.tsx  <---- 与最终气泡复用同一个组件
```

预览并不是另一套 HTML。它把示例数据传给 `ModuleRpgCard`，所以玩家在状态书页看到的排版与聊天中最终附着的模块相同。

> 新增（2026-08-06）：根目录 `module-preview.html` + `src/module-preview.tsx` 是独立预览页（亮/暗双主题对照，示例数据与 `buildAssemblyPreview()` 一致）；`vite.preview.config.ts` 可将它构建为单文件 `dist-preview/module-preview.html`，便于离线核对组件样式。

## 2. 主要文件与职责

| 文件 | 关键位置 | 用途 |
| --- | --- | --- |
| `src/components/chat/ModuleRpgCard.tsx` | 全文件 | 最终模块卡的全部视觉结构。改横幅、背包、数值块、事件、配角时主要改这里。 |
| `src/components/chat/BodyStatusModule.tsx` | `BODY_PARTS` / `BODY_STATUS_META` | 身体部位 SVG 路径与**编辑器**（BodyStatusModule 页面）用的状态颜色。 |
| `src/components/chat/StateBookPanel.tsx` | `buildAssemblyPreview()`，约第 33 行 | 生成仅供预览的示例内容，不写入数据库，也不发送给 AI。 |
| `src/components/chat/StateBookPanel.tsx` | `组装预览`，约第 260 行 | 角色面板开关、角色名称输入，以及预览卡挂载位置。 |
| `src/components/chat/MessageBubble.tsx` | 约第 297 行 | 把实际回复节点的 `moduleRpgData` 挂载到角色气泡下方。 |
| `src/utils/moduleRpg.ts` | `DEFAULT_MODULE_RPG_CONFIG`、`buildModuleRpgPrompt()` | 默认字段、角色槽位、书记 AI 的 JSON 维护协议。只改样式时通常不需要动。 |
| `src/types/index.ts` | `ModuleRpg*` 类型 | 模块状态、字段和角色槽位的数据结构。 |
| `module-preview.html` / `src/module-preview.tsx` | 全文件 | 独立组件预览页（亮/暗对照）。 |
| `vite.preview.config.ts` | 全文件 | 预览页单文件构建配置（输出 `dist-preview/`）。 |

## 3. 最终模块卡的视觉分区

文件：`src/components/chat/ModuleRpgCard.tsx`

当前组件由以下小组件组成：

1. `WorldBanner`
   - 顶部**世界横幅**：深色石板渐变（slate-800→900）+ 琥珀/青色光晕。
   - 左侧是时间徽章（⏱ 时钟图标 + 琥珀字），中间是当前地点（图标 + 大写小标签 + 白色大字），右侧是势力金印章（amber 渐变底 + 🚩 图标）。
   - 想改大小、颜色或层级，优先改这个函数的 Tailwind class。

2. `BodyPanel`（包裹 `BodyFigure`）
   - 深色「体魄」展示窗：`rounded-xl` 深色渐变底 + 左上角「体魄」标签 + 右上角绿色状态点。
   - `BodyFigure` 为 SVG 身体部位渲染；身体路径来自 `BodyStatusModule.tsx` 的 `BODY_PARTS`。
   - **状态颜色用组件内 `BODY_DISPLAY_META`**（不再是共享的 `BODY_STATUS_META`）：健康=玉色剪影、轻伤=青色发光、重伤=玫瑰红发光、缺失=半透明虚线；伤处带 `drop-shadow` 光晕。
   - 底部只显示出现过的状态图例（小圆点 + 文字）。

3. `StatTile`
   - 生命、心情、货币三个子面板，对应 `rose / cyan / amber` 三套色调。
   - 每卡：左侧 3px 色条 + 渐变底 + 图标 + 大写标签 + 大号数字 + 角落水印大图标。
   - 若要改为两列、增加图标、强化数字字号，修改 `STAT_TONE_STYLES` / `STAT_TONE_ICONS` 和 `CharacterBlock` 中的 `stats` 数组即可。

4. `CharacterBlock`
   - 单个角色面板的总布局：左侧 `BodyPanel`，右侧角色名（琥珀渐变竖条 + 渐隐线）、数值卡、状态药丸、背包、感情关系。
   - **状态（buff）**：青色药丸徽章（渐变底 + 发光圆点）。
   - **背包**：精修 CSS 包体——居中提手（`absolute -top-2.5` 圆角条）+ 渐变包身 + 物品菱形小标记。

5. `SectionTitle`
   - 分区小标题：图标 + 大写标签 + 渐隐装饰线（用于「事件」「配角」）。

6. 事件、配角、备注
   - 事件使用**任务日志条目**：左侧圆点（「进行中」= 琥珀色 `animate-pulse` 发光，其余灰色）+ 标题 + 状态徽章 + 详情。
   - 配角使用**徽章条目**：人物名 + 角色徽章（青）+ 位置（📍）+ 态度徽章（玫瑰红）。
   - 备注是最底部的琥珀左边线斜体说明文字。

## 4. 字段开关为什么会影响最终 UI

`ModuleRpgCard` 接收当前 `ModuleRpgConfig`。每个视觉区在渲染前都会检查对应字段是否开启：

```ts
enabled(config, 'character.inventory')
enabled(config, 'events')
enabled(config, 'world.location')
```

因此关闭「物品栏」后：

1. 书记 AI 不再维护 `inventory`。
2. 组装预览不显示背包。
3. 聊天气泡里的最终模块也不显示背包。

这保证预览、玩家配置和最终气泡是一致的。

## 5. 预览数据从哪里来

文件：`src/components/chat/StateBookPanel.tsx`

`buildAssemblyPreview(snapshot, config)` 不读取 AI 返回的具体剧情，而是根据当前字段开关填入可识别的示例：

- 世界：第 12 天、云岚城、青岚剑宗。
- 角色：轻伤、心情、灵石、状态、物品、关系。
- 事件：夜探旧城。
- 配角：沈掌柜。

角色名称仍使用玩家在「角色面板 1/2」填写的名称，或当前对话绑定角色的名称。

要改预览展示的文字，请只修改 `buildAssemblyPreview()`；不要把示例内容写入 `moduleRpgData`，否则会污染真实对话状态。

## 6. 角色面板 1/2 的工作方式

角色栏配置位于 `ModuleRpgConfig.characterSlots`：

```ts
{
  id: 'charA' | 'charB',
  enabled: boolean,
  name: string,
}
```

- 1 号面板默认开启，2 号面板默认关闭。
- 开启后，该面板会出现在预览和最终模块中。
- 名称会被放入书记 AI 的提示词。AI 可通过 `charA` / `charB`，或通过完全一致的名称找到要更新的 JSON 角色对象。
- 玩家关闭某个面板后，书记 AI 不会继续维护该面板；重新开启时会创建可用的空面板或保留已有槽位数据。

相关代码：

- 设置 UI：`StateBookPanel.tsx` 中的 `updateCharacterSlot()`。
- 默认面板：`moduleRpg.ts` 中的 `DEFAULT_CHARACTER_SLOTS`。
- 写入 AI 提示词：`moduleRpg.ts` 中的 `buildModuleRpgPrompt()`。
- 将当前配置同步到状态快照：`applyModuleRpgCharacterSlots()`。

## 7. 只改美术时的建议

### 改背包

在 `CharacterBlock` 中搜索「随身背包」。

- 外层 `relative rounded-xl border-2 ...` 是背包主体（amber 渐变）。
- 绝对定位的 `absolute -top-2.5 left-1/2 -translate-x-1/2 ...` 是居中提手。
- `character.inventory.map(...)` 中的 `span` 是每个物品文本块（带菱形小标记）。

可安全调整：边框颜色、圆角、间距、背景色、物品块字体大小。

### 改数值卡

在 `StatTile` 中调整三套 `STAT_TONE_STYLES` / `STAT_TONE_ICONS`，或改 `CharacterBlock` 内的：

```ts
<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
```

例如改为两列可使用 `sm:grid-cols-2`，但三项数值在窄屏会更容易出现不齐。

### 改世界横幅

在 `WorldBanner` 中调整：

```ts
sm:grid-cols-[auto_minmax(0,1fr)_auto]
```

它对应「时间 / 地点 / 势力」三段。不要把地点改成固定宽度，长地名在手机上需要中间列的 `minmax(0, 1fr)` 与 `truncate` 来避免溢出。

### 改身体图尺寸

在 `BodyPanel` 内 `BodyFigure` 的 SVG class 中改：

```ts
h-44 sm:h-52
```

若变大，请同时检查两角色同时开启时的手机高度，避免模块过长。

### 改身体状态颜色

在 `ModuleRpgCard.tsx` 顶部的 `BODY_DISPLAY_META` 调整 `fill / stroke / glow`，或在 `BodyStatusModule.tsx` 的 `BODY_STATUS_META` 调整**编辑器页面**的颜色（两处独立）。

## 8. 新增一个真正字段时，必须同步的地方

仅新增视觉文本不需要下面步骤；但要让书记 AI 维护一个新字段时，至少要同步修改：

1. `src/types/index.ts`
   - 给 `ModuleRpgFieldId` 和 `ModuleRpgCharacterState` / `ModuleRpgSnapshot` 加字段。

2. `src/utils/moduleRpg.ts`
   - `DEFAULT_MODULE_RPG_CONFIG` 增加字段配置。
   - `mergeModuleRpgSnapshot()` 验证并合并字段。
   - `buildModuleRpgPrompt()` 的 JSON 协议要能说明字段。

3. `src/components/chat/StateBookPanel.tsx`
   - `buildAssemblyPreview()` 增加对应示例值。

4. `src/components/chat/ModuleRpgCard.tsx`
   - 新字段的最终视觉区。

只改其中一处会出现「预览看得到但 AI 不维护」或「AI 写入了但 UI 不显示」的不一致。

## 9. 不建议直接改的区域

以下区域影响兼容性或 AI 维护稳定性，修改前建议备份：

- `parseModuleRpgResponse()`：负责从模型返回中恢复 JSON。
- `mergeModuleRpgSnapshot()`：负责阻止非法字段覆盖旧状态。
- `applyModuleRpgCharacterSlots()`：负责 1/2 号面板与真实快照同步。
- `MessageBubble.tsx` 中 `onSave`：负责将玩家编辑后的合法状态写回 IndexedDB。

## 10. 用独立预览页快速核对样式（可选）

1. 开发模式：访问 `http://localhost:5173/module-preview.html`（需要 dev server 运行）。
2. 离线单文件：`npx vite build --config vite.preview.config.ts` → 打开 `dist-preview/module-preview.html`。
3. 预览页展示亮/暗两组「组装预览」区块，示例数据与 `buildAssemblyPreview()` 一致。

> 注意：预览页没有 `AppProvider`，`ModuleRpgCard` 已做防御性降级（`useApp()?.state?.moduleRpgConfig || DEFAULT_MODULE_RPG_CONFIG`），因此能独立渲染；应用内行为不受影响。

## 11. 验证方式

1. 在状态书页开启角色面板并填写名称。
2. 开关「物品栏」「事件栏」等字段，确认左侧预览立即增减对应区域。
3. 发送一轮对话或点击「立即更新模块」。
4. 回到对话页，确认角色气泡下的模块与预览采用同一种布局。
5. 编辑模块 JSON，故意写入错误字段或非法身体状态，确认原数据没有被非法值覆盖。
