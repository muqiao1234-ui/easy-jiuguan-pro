# 贡献指南

感谢你对 Easy酒馆Pro 的兴趣！本文档说明如何参与本项目。

---

## 行为准则

- 保持友善、尊重，欢迎所有水平的贡献者
- 讨论聚焦技术本身，拒绝任何人身攻击
- 遵守项目 MIT 许可证及「非商业」原则

---

## 我能贡献什么？

| 类型 | 说明 |
|------|------|
| Bug 修复 | 在 [Issues](../../issues) 中认领未分配的 bug，提交 PR |
| 功能建议 | 先开 Issue 讨论，达成共识后再实现 |
| 文档改进 | 修正错别字、补充说明、翻译等 |
| 预设内容 | 角色卡、世界书、教学对话等创意贡献 |

---

## 开发流程

```bash
# 1. Fork 并克隆
git clone https://github.com/<your-username>/easy-jiuguan-pro.git
cd easy-jiuguan-pro

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 构建验证
npm run build
```

---

## 提交规范

### 分支命名

- `fix/<简短描述>` — Bug 修复
- `feat/<简短描述>` — 新功能
- `docs/<简短描述>` — 文档改进

### Commit Message

```
<类型>: <描述>

[可选] 详细说明
```

类型：`fix` / `feat` / `docs` / `refactor` / `chore`

示例：
```
fix: 修复用户气泡编辑时深色主题文字对比度问题
feat: 新增世界书批量导入功能
docs: 补充 Galgame 数值引擎使用说明
```

### PR 要求

1. **一个 PR 只做一件事** — 不要混合多个不相关的改动
2. **确保 `npm run build` 通过** — 无 TypeScript 编译错误
3. **描述清晰** — PR 标题和正文说明做了什么、为什么
4. **关联 Issue** — 如果修的是已有 Issue，在描述中引用

---

## 项目结构速览

```
src/
├── types/        # TypeScript 类型定义
├── utils/        # 工具函数（上下文拼装、SSE、Galgame 引擎等）
├── db/           # localForage IndexedDB 封装
├── hooks/        # 自定义 React Hooks（状态管理 + 业务逻辑）
├── components/   # UI 组件（chat / settings / layout / ui 等）
├── pwa/          # Service Worker
└── styles/       # 全局样式
```

详细架构见 [`outputs/Easy酒馆Pro_系统拓扑逻辑地图.md`](./outputs/Easy酒馆Pro_系统拓扑逻辑地图.md)。

---

## 联系方式

- Bug & 功能建议：[GitHub Issues](../../issues)
- 其他交流：B 站 [橙橙乔乔](https://space.bilibili.com/3119369)