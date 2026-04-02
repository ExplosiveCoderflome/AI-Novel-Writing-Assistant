# 贡献指南

感谢你关注 AI 小说创作工作台！本文档帮助你了解项目、搭建开发环境，并找到合适的贡献方式。

> 如果你有任何疑问，欢迎提 Issue 或 Discussion。

---

## 项目概述

这是一个面向长篇小说的 AI 生产系统，目标用户是**完全不懂写作的新手**，让他们在 AI 的引导下完成从灵感到整本小说的创作。

核心功能：AI 自动导演开书 → 世界观/角色构建 → 卷战略/拆章 → 章节执行/审校/修复 → 整本生产。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite + TypeScript + TailwindCSS |
| 编辑器 | Plate（基于 Slate 的富文本编辑器）|
| 后端 | Express 5 + TypeScript |
| 数据库 | Prisma ORM + SQLite（默认）/ PostgreSQL |
| AI 编排 | LangChain / LangGraph |
| RAG | Qdrant 向量数据库 |
| 包管理 | pnpm monorepo |

---

## 开发环境搭建

### 前置要求

- Node.js ≥ 20.0.0
- pnpm ≥ 9.7.0（`npm install -g pnpm`）
- Git

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant.git
cd AI-Novel-Writing-Assistant

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example server/.env
cp .env.example client/.env
# 编辑 server/.env，填入至少一个 AI API Key（如 DEEPSEEK_API_KEY）

# 4. 初始化数据库
pnpm db:migrate
# 如果 migrate 失败，尝试：pnpm --filter @ai-novel/server prisma db push

# 5. 启动开发服务器
pnpm dev
# 访问 http://localhost:5173
```

### 常用脚本

```bash
pnpm dev              # 启动全部服务（前端 + 后端 + shared）
pnpm build            # 构建全部包
pnpm typecheck        # 类型检查
pnpm lint             # Lint
pnpm db:studio        # 打开 Prisma Studio 查看数据库
pnpm db:migrate       # 运行数据库迁移
pnpm test             # 运行全部测试
pnpm test:planner     # 只跑 planner 测试
```

---

## 架构概览

```
AI-Novel-Writing-Assistant/
├── client/               React 前端（AI 协作界面）
├── server/               Express 后端（AI 编排核心）
│   └── src/
│       ├── agents/       LangGraph Agent、工具定义
│       ├── graphs/       LangGraph 状态机定义
│       ├── prompting/    Prompt 资产唯一入口（⚠️ 见下方 Prompt 治理规则）
│       ├── routes/       REST API 路由
│       ├── services/     业务逻辑（novel/ 世界观/ 角色/ 写作引擎等）
│       └── prisma/       数据库 Schema
├── shared/               前后端共用 TypeScript 类型和 Zod Schema
└── scripts/              工具脚本
```

---

## 核心开发规范

### ⚠️ Prompt 治理（必须遵守）

`server/src/prompting/` 是产品级 Prompt 的**唯一新增入口**。

所有产品级 Prompt 必须：
1. 定义为 `PromptAsset`，放在 `server/src/prompting/prompts/<family>/` 下
2. 在 `server/src/prompting/registry.ts` 注册
3. 必须提供：`id`、`version`、`taskType`、`mode`、`contextPolicy`、`render()`

**禁止：**
- 在 service 文件里直接拼 `systemPrompt` 后调用 `invokeStructuredLlm`
- 在 service 里直接用裸 `getLLM()` 发起产品级 Prompt 调用

详见 [`server/src/prompting/README.md`](server/src/prompting/README.md)。

### ⚠️ AI-First 路由原则

产品中的意图识别、任务分类、路由决策**必须用 AI 实现**，禁止用：
- 固定关键词匹配
- 硬编码正则路由
- 手工分支表

只有以下场景例外：
- 输入验证或安全守卫
- 对已结构化 AI 输出的确定性后处理

### ⚠️ 单文件行数限制

单个源文件超过 **700 行** 必须拆分。目标：500-600 行。推荐阈值：600 行。

### 📝 README 更新工作流

提交代码时，如果改动有用户可见影响，**先更新 README.md 再提交 Git**。

---

## 如何贡献

### 找到合适的任务

**新手友好（无需深度熟悉代码库）：**
- 写/改进文档（CONTRIBUTING.md、API 文档、功能说明）
- 给 Issue 打标签（目前 3 个 open issue 均无标签）
- 复现 Bug 并提供更详细的复现步骤

**功能开发（需要熟悉代码库）：**
- 添加新的 Prompt 资产（参照现有 PromptAsset 结构）
- 实现 Issue 里记录的功能需求
- 优化 LangGraph 状态机

**架构/体验改进（需要深度熟悉）：**
- 重构超长源文件
- 改进 RAG 检索效果
- 优化 Creative Hub 的 Agent 行为

### 贡献流程

1. **Fork 仓库** 到你的 GitHub 账号
2. **创建分支**：`git checkout -b feat/你的功能名` 或 `fix/问题描述`
3. **开发**：遵守上面的架构规范
4. **自测**：运行 `pnpm typecheck && pnpm lint`
5. **提 PR**：描述清楚改动目的、做了什么、测试方式
6. **等待 Review**：维护者会在合理时间内处理

### Commit 信息格式（推荐）

```
feat: 新功能描述
fix: 问题修复描述
docs: 文档改动
refactor: 代码重构
test: 测试相关
chore: 构建/工具改动
```

---

## 当前可接任务

查看 [Open Issues](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/issues) 获取最新任务列表。以下是已知可行动项：

| 任务 | 类型 | 难度 |
|------|------|------|
| 创建 CONTRIBUTING.md（本文档）| 文档 | ⭐ 入门 |
| 给 Open Issue 打标签 | 文档/元数据 | ⭐ 入门 |
| 增加 Ollama 本地模型支持 | 功能 | ⭐⭐ 中等 |
| 调查/修复文档上传 2MB 限制 | Bug/功能 | ⭐⭐ 中等 |
| 编写模块设计文档（解决功能分散问题）| 文档 | ⭐⭐ 中等 |
| Review UI 改进 PR [#7](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/pull/7) | 代码审查 | ⭐ 入门 |

---

## 数据库开发提示

```bash
# 查看数据
pnpm db:studio

# 重置数据库（⚠️ 会清除所有数据！）
pnpm --filter @ai-novel/server prisma db push --force-reset

# 添加迁移（修改 schema.prisma 后）
pnpm db:migrate
```

> ⚠️ **危险操作**：执行任何数据删除操作前，确保已有完整备份。

---

## 遇到问题？

1. 先搜 [Existing Issues](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/issues)
2. 如果没找到，提一个新 Issue，请包含：
   - 环境信息（Node 版本、操作系统）
   - 复现步骤
   - 期望行为 vs 实际行为
   - 相关日志或截图

---

再次感谢你的贡献！ 🙏
