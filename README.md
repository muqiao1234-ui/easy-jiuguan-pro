# 🍺 Easy酒馆Pro

<div align="center">

**本地优先的 AI 角色扮演沙盒 · 纯离线可用 · 双角色引擎 · 单文件 PWA**

[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss)](https://tailwindcss.com)
[![Release](https://img.shields.io/badge/Release-v1.2_Public_Beta-f59e0b)](https://github.com/muqiao1234-ui/easy-jiuguan-pro)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

</div>

---

## 📋 最近更新 (v1.2 公测版)

**2026-07-19** — 合并 v1.2 内测功能，并完成长对话、蒸馏和发布链路加固

### 公测版新增与修复

- 🚀 **长对话 v3 分片索引**：消息按节点分片存储，聊天列表 80 条分页；普通发送、状态书和蒸馏只查询必要窗口，不再反复加载完整历史
- 💎 **完整轮次蒸馏**：自动/手动共用同一规划器，只处理完整 user + 角色回复轮次；不足阈值不执行，保留最近 N 轮不会再产生单轮或半轮摘要
- 🔒 **蒸馏并发保护**：会话内单任务互斥，提交时复核来源节点；归档和结晶写入失败会回滚，空摘要不会归档原对话
- ✏️ **可编辑记忆回廊**：读取当前会话全部记忆结晶，支持逐条编辑和保存；累计记忆只注入最新一份，减少重复 Token
- 🎭 **角色 A/B 独立模型**：两个角色可分别绑定不同模型，蒸馏模型继续独立配置，便于控制成本和能力分配
- 🧠 **推理标签过滤**：兼容 `<think>`、`<though>`、reasoning、analysis 等常见及畸形标签；流式正文隐藏推理内容，结构化 JSON 仍可回退提取
- 🛡️ **缓存世界书边界加固**：仅显式 cache 类型可由 AI 修改；JSON operation、key、value、priority 全面校验，避免误截断普通世界书
- ⚙️ **设置持久化与可读性**：蒸馏/上下文配置持久化，高级提示词直接显示可编辑实体默认值，连接问题说明适配浅色与深色主题
- 🌐 **GitHub Pages 自动发布**：Actions 使用 Node 20 执行 `npm ci` 和生产构建，仅发布 `dist/`，修复直接发布源码造成的白屏

### 内测版已包含

- 📚 **双世界书系统**：每个角色绑定 A 书（手动维护）+ 缓存书（AI 自动维护，10 条上限），并发扫描、合并注入
- 🔄 **缓存世界书 JSON 协议**：状态书/Galgame 通过 `<CACHE_WORLDBOOK_JSON>` 输出 upsert/delete 操作，支持手动“升华”到 A 书
- 🧩 **Easy人物卡组装器**：7 模块勾选式拼装（引导头/文风部/核心人设/安全词/逻辑约束/回复示范/输出格式）
- 🔍 **高级卡逆向**：AI 将世界书内容反向串联为主提示词，适配空白 System Prompt 的高级角色卡
- 📁 **对话文件夹收纳**：自定义名称、折叠和成员管理；删除文件夹不删除内部对话
- 🎓 **教学对话 v2**：新增 Easy角色卡与双世界书教程，默认教学内容自动归入预制教学文件夹
- 🔧 **设置与连接诊断**：常见模型错误说明覆盖 400/401/403/404/429/5xx/CORS，Ping 结果翻译 HTTP 错误
- 🧰 **13 项高级提示词**：包括状态书 AI 操控缓存世界书、蒸馏节点格式、身份锚点和世界书注入模板

---

## 这是什么？

**Easy酒馆Pro** 是一个运行在浏览器里的 AI 角色扮演沙盒。你可以在里面创建任意角色（AI 角色卡），让它们和你对话、彼此互动，配合世界书、记忆蒸馏、状态追踪、Galgame 数值引擎等功能，搭建属于你自己的故事世界。

**核心特点：所有数据存在你的浏览器 IndexedDB 里，不上传任何服务器。** 即使你是第一次用 AI 角色扮演工具，内置的「核桃 & 花生」鼠族教学预设也能带你从零上手。

---

## 功能一览

### 🎭 双角色引擎
- 同时绑定两个 AI 角色（角色 A + 角色 B），各自拥有独立的角色卡、System Prompt 和气泡颜色
- 角色 A / B 可分别绑定不同模型，按角色能力和成本独立配置
- 支持 **旁听模式**：让两个 AI 互相说话，你在旁边看戏
- 角色隔离：每个角色只看得到自己的 System Prompt 和自己该看到的对话，不会"串台"

### 📖 世界书 (World Book)
- 带关键词 / 别名的"按需小抄"：聊到相关话题才注入，平时不占上下文
- 每词条独立冷却机制，防止复读机；优先级分级，核心设定优先注入
- 支持 JSON 批量导入 / 导出，配合联网 AI 可一键批量扒取作品世界观
- 🆕 **双世界书绑定**：每个角色同时绑定手动 A 书（核心设定）+ AI 缓存书（动态笔记）
- 🆕 **缓存世界书**：AI 通过 JSON 协议自动维护，最多 10 条，支持"升华"迁移到 A 书

### 💎 记忆蒸馏 (Distillation)
- 自动或手动把长对话压缩成「记忆结晶」，替代原始消息持续参与上下文
- 让 AI 在长对话中不丢失早期设定，同时控制 token 消耗
- 自动和手动共用完整轮次规划器，不拆分 user 与角色回复，不足阈值不会生成低质量小批次
- 蒸馏任务具备互斥、来源复核、失败回滚和空摘要保护
- **记忆回廊可编辑**：玩家可以直接修订任意记忆结晶；新结晶记录来源节点和真实轮次范围

### 🎮 Galgame 数值引擎
- 像素风数值面板（好感度 / 心情 / 警惕度），AI 每次回复自动更新
- **表 / 里好感度分离**：AI 看到模糊描述，玩家看到精确像素条——防止 AI 谄媚作弊
- 4 级递进 JSON 解析器，容错率极高

### 📜 状态书 (State Book)
- 吸附在 AI 气泡上的状态卡片，追踪当前场景、持有物品、角色状态等
- 文本模式（AI 总结）和 Galgame 数值模式双引擎
- 可选联动角色缓存世界书，通过可自定义 JSON 提示词自动维护重要道具、角色和世界观变化

### 🤝 互相认识
- 一键让两个 AI 并发观察对方的角色卡，互相写出印象
- 印象自动写入世界书，建立双角色关系网

### 🌿 分支与重试
- 任意消息起点一键分支，克隆对话到平行世界（批量 O(1) I/O，秒开）
- 重新生成：级联删除后重发，复用原用户消息，不会产生重复气泡

### 🎨 主题与 UI
- 浅色 / 深色双主题，一键切换
- 自定义壁纸（自动压缩）+ 遮罩透明度
- **AI 气泡加粗变色**：角色 A 翠绿、角色 B 紫罗兰，浅深主题色阶自适应
- 移动端抽屉式布局，桌面端双栏布局，无缝切换
- ChatInput 折叠工具箱，界面简洁
- **长对话分页**：默认只渲染最新 80 条，可按需加载更早内容，流式输出按动画帧合并刷新
- **对话文件夹收纳**：自定义文件夹归类，通过管理界面添加/移出对话，删除文件夹不删对话

### ⚙️ 高级定制
- 13 项核心提示词模板可编辑（角色包裹、身份锚点、世界书前缀、蒸馏格式等）
- 三档采样参数预设（🎨 异想天开 / ⚖️ 中规中矩 / 📐 严格规矩），Temperature / Top-P 自由调节
- 每模型独立 maxContextTokens，Ping 延迟检测（HTTP 错误码翻译）
- SillyTavern V2 角色卡导入（PNG 隐写 + JSON）+ 🆕 导出 JSON
- 🆕 **Easy人物卡组装器**：7 模块勾选式拼装角色卡（引导头/文风部/核心人设/安全词/逻辑约束/示范/输出）
- 🆕 **高级卡逆向**：AI 将世界书内容反向串联为主提示词（适用于空白 System Prompt 的"高级卡"）
- 🆕 **常见模型连接问题**：折叠式错误码说明（400/401/429/CORS），替代废弃的延迟测试
- **推理内容过滤**：隐藏多种模型泄漏到正文的 think/reasoning/analysis 标签，同时保留状态书与 Galgame JSON 解析能力

### 🔒 隐私与部署
- **纯本地**：所有数据存储在浏览器 IndexedDB，不请求任何后端
- **单文件 PWA**：`vite build` 产出单个 `index.html`，可直接用浏览器打开
- Service Worker Cache-First，支持离线使用
- 导出数据自动剔除 API Key，防止意外分享泄露
- GitHub Actions 自动构建并发布 `dist/` 到 Pages，Vite 相对路径兼容仓库子目录

### 📚 内置教学预设
- 首次打开自动注入 8 套教学对话，由「核桃（知性科研鼠族）」和「花生（可爱贵族鼠族）」全程引导
- 预设角色卡（XML 结构化）、世界书（鼠族生态）、模型模板（DS 4 PRO，无密钥）
- 🆕 教学对话 v2：新增 Easy 角色卡和双世界书两套进阶对话，全链路覆盖

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 + vite-plugin-singlefile（单文件输出） |
| 样式 | Tailwind CSS 3（`darkMode: 'class'`，全组件双主题适配） |
| 持久化 | localForage → IndexedDB（8 个 store + 消息 v3 分片索引 + 异步写锁） |
| Markdown | react-markdown |
| PWA | Service Worker（Cache-First）+ Web App Manifest |

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/muqiao1234-ui/easy-jiuguan-pro.git
cd easy-jiuguan-pro

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本（单文件 HTML）
npm run build
# 产物在 dist/index.html，可直接用浏览器打开
```

> **注意**：本项目是纯前端应用，构建产物 `dist/index.html` 可直接双击打开，无需任何服务器。

---

## 项目结构

```
├── index.html              # HTML 入口
├── package.json
├── vite.config.ts          # Vite 单文件构建配置
├── tailwind.config.js
├── tsconfig.json
├── public/
│   └── manifest.json       # PWA Manifest
├── src/
│   ├── main.tsx            # React 入口 + SW 注册
│   ├── App.tsx             # 顶层组件 + 预设注入 + 视图分发
│   ├── types/
│   │   └── index.ts        # 全部 TypeScript 类型定义（25 个 Action）
│   ├── utils/
│   │   ├── constants.ts    # 默认配置 + 气泡颜色 + 13 个 TPL 模板
│   │   ├── context.ts      # 上下文拼装引擎 assembleContext
│   │   ├── galgameEngine.ts # Galgame 数值引擎（4 级 JSON 解析）
│   │   ├── sse.ts          # SSE 流式解析器
│   │   ├── id.ts           # UUID 生成
│   │   ├── wallpaper.ts    # 壁纸压缩
│   │   ├── sillyTavernCard.ts # SillyTavern V2 导入导出
│   │   ├── cacheWorldBook.ts  # 缓存世界书（AI 自动维护协议）
│   │   ├── distillation.ts # 完整轮次蒸馏批次规划器
│   │   ├── responseText.ts # think/reasoning 标签过滤
│   │   └── presets.ts      # 内置预设资源 + 幂等注入
│   ├── hooks/
│   │   ├── useApp.tsx      # 全局状态 reducer + 持久化
│   │   ├── useChat.ts      # 消息发送 / 旁听 / 流式 / Galgame 触发
│   │   ├── useDistillation.ts # 蒸馏执行 + 单任务互斥
│   │   ├── useWorldBookScanner.ts # 世界书扫描（防 ReDoS）
│   │   ├── useMessageNodes.ts   # 消息节点 CRUD + 分支克隆
│   │   ├── useModels.ts        # 模型 CRUD + Ping
│   │   ├── useGlobalStates.ts  # 每对话独立状态
│   │   ├── useConversations.ts # 对话 CRUD
│   │   ├── useCharacters.ts    # 角色 CRUD
│   │   └── useWorldBooks.ts    # 世界书 CRUD
│   ├── db/
│   │   ├── index.ts        # localForage 实例 + initDB
│   │   └── stores.ts       # CRUD + v3 消息索引 + 蒸馏提交/回滚 + 写锁
│   ├── components/
│   │   ├── chat/           # 聊天核心（ChatArea / Bubble / Input / GalgameCard 等）
│   │   ├── settings/       # 设置面板（8 大区块）
│   │   ├── layout/         # MainLayout / MobileLayout / Sidebar / TopBar
│   │   ├── ui/             # Button / Toggle / Modal / Icon / Dropdown / Tooltip
│   │   ├── characters/     # 角色管理 + 导入导出
│   │   ├── conversations/  # 对话列表 + 导出 TXT
│   │   ├── models/         # 模型管理 + 采样预设 + Ping
│   │   └── worldbook/      # 世界书管理 + 批量导入导出
│   └── pwa/
│       └── sw.ts           # Service Worker
└── outputs/
    └── Easy酒馆Pro_系统拓扑逻辑地图.md  # 完整系统拓扑文档
```

---

## 架构总览

```
┌─────────────────────────────────────┐
│  ① UI 视图层                        │
│  桌面/移动双布局 · 8 大设置区块      │
│  MessageBubble + GalgameCard + 工具箱 │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  ② 功能子系统                       │
│  世界书 · 蒸馏 · Galgame · 状态书    │
│  互相认识 · 分支 · 重试 · SSE 流式   │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  ③ 核心引擎                         │
│  assembleContext（Token预算+角色隔离） │
│  useChat（SSE 30s 超时 + 触发器调度） │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  ④ 状态与配置                       │
│  25 个 AppAction · 13 模板可编辑     │
│  boldColorize · theme · wallpaper    │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  ⑤ IndexedDB (8 Store + 写锁)       │
│  models · characters · conversations │
│  message_nodes(v3分片索引) · worldbooks │
│  global_states · ui_settings         │
│  conversation_folders                │
└─────────────────────────────────────┘
```

详细架构文档见 [`outputs/Easy酒馆Pro_系统拓扑逻辑地图.md`](./outputs/Easy酒馆Pro_系统拓扑逻辑地图.md)。

---

## 预设教学对话

首次打开软件会自动注入以下预设内容，让你无需任何配置即可体验全部功能：

| 对话 | 内容 |
|------|------|
| ⚡ 极速开工 | 配 API → 建角色 → 建对话 → 发消息，四步上手 |
| 🟢 基础交互与界面认知 | 气泡编辑、重试、分支、删除、主题/壁纸、移动端布局 |
| 🟡 世界书、蒸馏与深度认识 | 按需注入、冷却机制、优先级、记忆结晶、互相认识 |
| 🔴 状态书与 Galgame 数值引擎 | 文本模式 / 数值引擎、4 级解析、非对称注入、像素面板 |
| 🔵 世界塑造 | Easy 批量导入、括号引导、OOC 导演指令、优先级管理 |
| 🔵 角色加固 | XML 结构化角色卡、别名魔术、Temperature/Top-P 调校 |
| 🟣 Easy角色卡与跨平台导入 | PNG 隐写导入、7 模块组装器、高级卡逆向、导出分享 |
| 🟣 双世界书系统 | A 书+缓存书、AI 自动维护 JSON 协议、升华按钮、双书扫描 |

对话末尾预设了 Galgame 数值面板实物示范，直观展示像素风卡片。

---

## 最低要求

- **浏览器**：支持 IndexedDB、Service Worker、ES2020（Chrome 90+ / Firefox 90+ / Safari 15+）
- **Node.js**：>= 18（仅开发构建需要，运行不需要）

---

## 开发

```bash
npm run dev      # Vite 开发服务器，热更新
npm run build    # TypeScript 检查 + Vite 构建 → dist/index.html
npm run preview  # 预览构建产物
```

---

## 使用声明与分发

本项目遵循以下原则开源，旨在为 AI 角色扮演爱好者提供一个自由、纯粹的工具：

- **免费使用**：保留本项目的署名信息与捐赠入口的前提下，你可以自由下载、分享和使用。
- **非商业**：本项目**不得用于任何形式的盈利贩卖**，也**不得植入任何商业广告**。
- **唯一官方分发渠道**：B 站 [橙橙乔乔](https://space.bilibili.com/3119369)。请勿从其他不明来源下载，以防文件被篡改。

### 免责与责任边界

- 本项目仅提供工具框架，**对 AI 生成的任何内容不做任何保证或背书**。
- 使用 AI 服务时，请遵守当地法律法规与服务商的使用协议；**请勿将本项目用于任何违法违规用途**。
- 角色扮演内容涉及虚构情境，请区分虚拟与现实，理性使用。

---

## 常见问题

**Q: 需要服务器吗？**  
不需要。构建产物是单个 HTML 文件，直接双击打开即可使用。也可以部署到 GitHub Pages、Vercel、Netlify 等静态托管。

**Q: API Key 存在哪里？**  
浏览器 IndexedDB，纯本地存储，不会上传到任何服务器。导出数据时自动剔除 API Key。

**Q: 支持哪些 AI 模型？**  
兼容 OpenAI Chat Completions API 格式的服务商，包括 DeepSeek、OpenAI、各种兼容代理等。每个模型可独立配置 Base URL / API Key / 上下文长度 / 采样参数。

**Q: 两个角色会互相"串台"吗？**  
不会。每个角色有自己的 System Prompt，对方的发言会被包裹为「独立实体」标签，末尾还会注入身份锚点 System 消息防止角色漂变。所有模板均可自定义。

**Q: 点击手动蒸馏后为什么提示轮次不足？**
公测版只蒸馏完整对话轮次。默认阈值为 10 轮，并保留最近 3 轮，因此需要至少 13 个完整未归档轮次才会执行；这样可以避免只浓缩一轮或拆开用户消息与角色回复。

**Q: 编辑记忆回廊后会影响后续对话吗？**
编辑最新累计结晶会直接影响后续上下文。历史结晶作为快照保留，编辑历史条目只改变回廊记录；需要纠正 AI 当前记忆时，请修改回廊中的最新一份结晶。

---

## 请作者喝杯咖啡

如果你在使用中获得了乐趣，或觉得这个项目对你有帮助，欢迎通过下方支付宝二维码自由捐赠，支持继续开发与维护。

<div align="center">
  <img src="./assets/donate-qr.png" alt="支付宝捐赠二维码" width="200" />
  <p><small>支付宝扫码 · 自由捐赠，金额随意，心意最重要 ❤️</small></p>
</div>

---

## 许可证

MIT © 2026 [橙橙乔乔](https://github.com/muqiao1234-ui)

---

*Made with ❤️ and lots of 🧀 (花生 says hi!)*
