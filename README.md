# 🍺 Easy酒馆Pro

<div align="center">

**本地优先的 AI 角色扮演沙盒 · 纯离线可用 · 双角色引擎 · 单文件 PWA**

[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

</div>

---

## 这是什么？

**Easy酒馆Pro** 是一个运行在浏览器里的 AI 角色扮演沙盒。你可以在里面创建任意角色（AI 角色卡），让它们和你对话、彼此互动，配合世界书、记忆蒸馏、状态追踪、Galgame 数值引擎等功能，搭建属于你自己的故事世界。

**核心特点：所有数据存在你的浏览器 IndexedDB 里，不上传任何服务器。** 即使你是第一次用 AI 角色扮演工具，内置的「核桃 & 花生」鼠族教学预设也能带你从零上手。

---

## 功能一览

### 🎭 双角色引擎
- 同时绑定两个 AI 角色（角色 A + 角色 B），各自拥有独立的角色卡、System Prompt 和气泡颜色
- 支持 **旁听模式**：让两个 AI 互相说话，你在旁边看戏
- 角色隔离：每个角色只看得到自己的 System Prompt 和自己该看到的对话，不会"串台"

### 📖 世界书 (World Book)
- 带关键词 / 别名的"按需小抄"：聊到相关话题才注入，平时不占上下文
- 每词条独立冷却机制，防止复读机；优先级分级，核心设定优先注入
- 支持 JSON 批量导入 / 导出，配合联网 AI 可一键批量扒取作品世界观

### 💎 记忆蒸馏 (Distillation)
- 自动或手动把长对话压缩成「记忆结晶」，替代原始消息持续参与上下文
- 让 AI 在长对话中不丢失早期设定，同时控制 token 消耗

### 🎮 Galgame 数值引擎
- 像素风数值面板（好感度 / 心情 / 警惕度），AI 每次回复自动更新
- **表 / 里好感度分离**：AI 看到模糊描述，玩家看到精确像素条——防止 AI 谄媚作弊
- 4 级递进 JSON 解析器，容错率极高

### 📜 状态书 (State Book)
- 吸附在 AI 气泡上的状态卡片，追踪当前场景、持有物品、角色状态等
- 文本模式（AI 总结）和 Galgame 数值模式双引擎

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

### ⚙️ 高级定制
- 11 项核心提示词模板可编辑（角色包裹、身份锚点、世界书前缀、蒸馏格式等）
- 三档采样参数预设（🎨 异想天开 / ⚖️ 中规中矩 / 📐 严格规矩），Temperature / Top-P 自由调节
- 每模型独立 maxContextTokens，Ping 延迟检测（HTTP 错误码翻译）
- SillyTavern V2 角色卡导入（PNG 隐写 + JSON）

### 🔒 隐私与部署
- **纯本地**：所有数据存储在浏览器 IndexedDB，不请求任何后端
- **单文件 PWA**：`vite build` 产出单个 `index.html`，可直接用浏览器打开
- Service Worker Cache-First，支持离线使用
- 导出数据自动剔除 API Key，防止意外分享泄露

### 📚 内置教学预设
- 首次打开自动注入 6 套教学对话，由「核桃（知性科研鼠族）」和「花生（可爱贵族鼠族）」全程引导
- 预设角色卡（XML 结构化）、世界书（鼠族生态）、模型模板（DS 4 PRO，无密钥）

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 + vite-plugin-singlefile（单文件输出） |
| 样式 | Tailwind CSS 3（`darkMode: 'class'`，全组件双主题适配） |
| 持久化 | localForage → IndexedDB（7 个 store + 异步写锁） |
| Markdown | react-markdown |
| PWA | Service Worker（Cache-First）+ Web App Manifest |

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/easy-jiuguan-pro.git
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
│   │   └── index.ts        # 全部 TypeScript 类型定义（24 个 Action）
│   ├── utils/
│   │   ├── constants.ts    # 默认配置 + 气泡颜色 + 11 个 TPL 模板
│   │   ├── context.ts      # 上下文拼装引擎 assembleContext
│   │   ├── galgameEngine.ts # Galgame 数值引擎（4 级 JSON 解析）
│   │   ├── sse.ts          # SSE 流式解析器
│   │   ├── id.ts           # UUID 生成
│   │   ├── wallpaper.ts    # 壁纸压缩
│   │   ├── sillyTavernCard.ts # SillyTavern V2 导入导出
│   │   └── presets.ts      # 内置预设资源 + 幂等注入
│   ├── hooks/
│   │   ├── useApp.tsx      # 全局状态 reducer + 持久化
│   │   ├── useChat.ts      # 消息发送 / 旁听 / 流式 / Galgame 触发
│   │   ├── useDistillation.ts # 蒸馏执行
│   │   ├── useWorldBookScanner.ts # 世界书扫描（防 ReDoS）
│   │   ├── useMessageNodes.ts   # 消息节点 CRUD + 分支克隆
│   │   ├── useModels.ts        # 模型 CRUD + Ping
│   │   ├── useGlobalStates.ts  # 每对话独立状态
│   │   ├── useConversations.ts # 对话 CRUD
│   │   ├── useCharacters.ts    # 角色 CRUD
│   │   └── useWorldBooks.ts    # 世界书 CRUD
│   ├── db/
│   │   ├── index.ts        # localForage 实例 + initDB
│   │   └── stores.ts       # CRUD 函数 + 异步互斥写锁
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
│  24 个 AppAction · 11 模板可编辑     │
│  boldColorize · theme · wallpaper    │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│  ⑤ IndexedDB (7 Store + 写锁)       │
│  models · characters · conversations │
│  message_nodes · worldbooks          │
│  global_states · ui_settings         │
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

---

## 请作者喝杯咖啡

如果你在使用中获得了乐趣，或觉得这个项目对你有帮助，欢迎通过下方支付宝二维码自由捐赠，支持继续开发与维护。

<div align="center">
  <img src="./assets/donate-qr.png" alt="支付宝捐赠二维码" width="200" />
  <p><small>支付宝扫码 · 自由捐赠，金额随意，心意最重要 ❤️</small></p>
</div>

---

## 许可证

MIT © 2026 [橙橙乔乔](https://github.com/your-username)

---

*Made with ❤️ and lots of 🧀 (花生 says hi!)*
