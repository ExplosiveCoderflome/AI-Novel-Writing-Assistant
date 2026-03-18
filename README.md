# 这是对AI完全接入项目开发的一次尝试
# 项目中所有代码都是AI编写
# 目标：只需要进行书名配置 和 点击确认按钮 即可生成（理想）小说

<div align="center">

## AI Novel Writing Assistant v2

一个把 AI 写作、AI 规划、AI 工程开发同时推进的开源实验。

如果你想找的不是一个只会聊天的写作壳子，而是一个能把书名、设定、世界观、角色、大纲、章节、拆书、知识库、RAG、Agent 编排串成同一条生产链路的项目，这个仓库值得你跑起来看一遍。

当前主线版本：`codex/creative-hub-architecture`

当前重点方向：`Creative Hub + Agent Runtime + Novel Production Workflow`

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![AI](https://img.shields.io/badge/AI-LangChain%20%2F%20LangGraph-0EA5E9)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)

</div>

## 目录

- [项目介绍](#项目介绍)
- [为什么值得关注](#为什么值得关注)
- [适合谁](#适合谁)
- [核心能力](#核心能力)
- [升级记录](#升级记录)
- [功能预览](#功能预览)
- [典型使用流程](#典型使用流程)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [常用命令](#常用命令)
- [接口与页面概览](#接口与页面概览)
- [路线图](#路线图)
- [贡献指南](#贡献指南)
- [免责声明](#免责声明)

## 项目介绍

这是一个“AI 参与全链路开发 + AI 驱动全流程创作”的实验型开源项目。

它不只是想帮你写一段文字，而是试图把长篇小说创作里最重、最碎、最容易失控的环节逐步收敛成一套可复用的 AI 工作流，包括：

- 从书名、题材和设定出发的开书阶段
- 世界观、角色、知识库、拆书信息的持续注入
- 从大纲到章节的整本小说生产管线
- 基于 Agent 和 LangGraph 的规划、执行、追踪与回合总结

你可以把它理解为一个正在持续演化中的 AI 小说创作操作系统，而不是一个单点功能工具。

这个仓库对外开放的价值，不只是“可以用”，还在于它展示了一条更激进的路线：

- 用 AI 参与产品和代码本身的持续演化
- 用 AI 承担创作流程里的结构化工作
- 用工程化方式验证“最少输入 -> 最长输出”是否真的可以逼近

## 为什么值得关注

- 它不是一个 Prompt Demo。这里追求的是完整链路，而不是单轮对话效果。
- 它已经把小说、世界观、角色、拆书、知识库、RAG、模型路由和 Agent 运行时串到了同一个系统里。
- 当前分支已经进入 `Creative Hub` 阶段，重点不再只是“AI 能生成内容”，而是“AI 能否组织整个创作系统”。
- 如果你在研究 AI Native Product、Agent Workflow、LangGraph 编排、长篇创作一致性，直接看这个仓库会比看一堆概念图更有效。
- 如果你是创作者，这个项目的价值在于尽可能把高频、重复、重上下文依赖的创作劳动交给系统处理。

一句话说，这个项目适合那些不满足于“让 AI 写一段”，而想继续追问“AI 能不能接管整条小说生产链”的人。

## 适合谁

- 想验证 AI 是否真的能参与长篇小说生产的开发者
- 想做 AI 写作、AI Agent、AI 创作工作流产品的独立开发者或团队
- 想研究 `React + Express + Prisma + LangGraph + RAG` 如何落地到真实业务的工程师
- 想把世界观、角色、设定、拆书和章节生产串成一套系统的创作者

## 核心能力

### 1. Creative Hub 与 Agent 运行时

- 统一的创作中枢页面，集中承载对话、执行、工具调用结果和回合总结
- 基于 Planner、Tool Registry、Runtime 的结构化执行链路
- 支持调试视图、活动流、工具结果卡和阶段状态感知
- 当前版本已开始把创作、决策、执行、追踪统一收敛到 `Creative Hub`

### 2. 从设定到章节的小说生产管线

- 支持原创与续写两种模式
- 支持发展走向、结构化大纲、章节骨架、章节生成、章节审校、章节修复
- 支持从结构化大纲走向整本生产执行
- 正在逼近“书名 + 少量配置 -> 自动生成整本小说”的目标体验

### 3. 续写、拆书与知识注入

- 可从已有小说或知识库文档中选择续写来源
- 可绑定拆书分析结果，把剧情、人物、时间线等信息注入到续写上下文
- 支持拆书结果发布到知识库，用于后续创作复用
- 让“先分析，再生成，再回灌”的链路形成闭环

### 4. 世界观与角色系统

- 世界观创建、分层设定、快照管理、深化问答、一致性检测
- 小说内角色和基础角色库的双层管理
- 角色演化、时间线同步、世界规则检查
- 支持用结构化约束提升长篇创作稳定性

### 5. 知识库与 RAG

- 文档上传、启停、归档、版本管理
- Novel / World 维度的知识绑定
- Qdrant 向量检索 + 关键词检索 + RRF 融合
- 异步索引任务与状态追踪

### 6. 模型路由与配置

- 支持多模型提供商：OpenAI / DeepSeek / SiliconFlow / Anthropic / xAI
- 支持模型参数、API Key、Embedding Provider / Model 在线配置
- 当前版本已引入独立的模型路由配置页，方便把不同能力分配给不同模型

## 升级记录

如果你是第一次来到这个仓库，建议先看“分支演进历史”，再看“最近升级记录”，这样能更快理解项目为什么会变成现在这个样子。

### 分支演进历史

以下演进主线以当前仓库中的 `main`、`next/main-replacement`、`codex/v3`、`codex/creative-hub-architecture` 为基线；其中 `main` 当前以 `origin/main` 作为历史起点。

#### 1. `main`：单体原型期

- 项目最早期的可运行原型，整体采用 `Next.js + Prisma` 的单体结构。
- 页面、API 路由、LLM 调用和数据访问主要集中在根目录 `app/`、`lib/`、`prisma/`。
- 这一阶段已经覆盖小说生成、世界观、写作公式、聊天、角色、设置等核心能力，重点是快速验证“AI 辅助小说生产平台”能否跑通。

#### 2. `next/main-replacement`：工程重构与能力整合期

- 项目从单体 `Next.js` 应用重构为 `client + server + shared` 的 `pnpm workspace` Monorepo。
- 前端切换到 `React + Vite`，后端切换到 `Express + Prisma`，共享类型沉淀到 `shared/`。
- 这一阶段完成了世界观工作台、RAG/Qdrant 配置、拆书分析发布到知识库、章节大纲同步、新版小说编辑器等关键能力整合。

#### 3. `codex/v3`：Agent 化内核期

- AI 从“页面触发的功能调用”升级为“可规划、可追踪、可组合的运行时系统”。
- 新增 `server/src/agents/`、`planner/`、`toolRegistry`、`AgentRuntime`、`traceStore` 等核心模块。
- `NovelService` 的职责开始向 `NovelCoreService`、运行时辅助模块、工具层和任务适配层迁移，底层更适合扩展 Agent 工作流。

#### 4. `codex/creative-hub-architecture`：Creative Hub 双中枢期

- 当前分支在 Agent 内核之上继续升级，引入 `Creative Hub` 作为统一创作中枢。
- 后端新增 `server/src/creativeHub/`、LangGraph 中断/恢复链路、Agent Catalog、Novel Setup 状态判定、整本生产流程、回合总结等能力。
- 当前版本的核心目标，已经从“AI 能生成内容”升级为“AI 能否组织整个创作系统”。

### 最近升级记录

### 2026-03-19

- 知识库的 Embedding 配置现在会先按供应商展示匹配的模型，切换模型后也能更稳地对应新的集合命名方式，减少维度不一致带来的索引失败。
- 知识库索引和拆书分析的进度展示都更细了，用户能直接看到“查缓存 / 准备 notes / 生成章节”等阶段，以及当前正在处理的片段或章节。
- 拆书分析加入了可复用的 source notes 缓存和受控并发，同一版本、同一配置重复重建时会更快，单个 section 重新生成也不需要再整本重复跑 notes。

### 2026-03-18

- 新增“类型管理”模块，支持按树结构维护题材类型，也支持用 AI 先生成一版类型树；这套类型资产开始同时服务小说创建、标题工坊和世界观向导。
- 新增“标题工坊 + 标题库”双入口，既可以基于项目上下文生成标题，也可以按创作简报或参考标题批量产出候选，并把可用标题沉淀下来反复复用。
- 小说项目编辑流程补上“故事宏观规划”阶段，可以先把自然语言想法拆成卖点、冲突、主线钩子、成长路径和关键爆点，再整理成后续创作可直接消费的约束引擎。
- 世界观向导重做为“先选类型，再定蓝图”的流程：先生成概念卡和前置世界属性，再结合素材库补充细节，让后续公理和分层生成更稳定、更贴近目标题材。

### 2026-03-15 `57e13e2`

- 新增小说开书设定脑暴能力，基于当前小说上下文、世界观约束、故事圣经和知识库事实生成设定备选方案。
- 新增开书响应整理与回合总结能力，能给出当前阶段、影响摘要和下一步建议。
- 补充 planner/runtime 测试，覆盖 grounded setup options 与 turn summary 相关行为。

### 2026-03-15 `e53f42d`

- 扩展 Creative Hub 的 novel setup 流程，新增 `CreativeHubNovelSetupCard`、`CreativeHubTurnSummaryCard`、调试卡片和侧边栏强化展示。
- 后端新增 `NovelSetupStatusService`，对核心设定、故事承诺、题材风格、叙事配置、生产偏好、章节规格、世界观、角色和大纲进行阶段判定。
- Creative Hub 状态接口开始回传 `novelSetup` 与 `latestTurnSummary` 元数据，前后端链路形成闭环。

### 2026-03-13 `9b1d3c2`

- 保留自定义 LLM 模型选择，避免升级后覆盖用户手动选择的模型配置。

### 2026-03-13 `fb39b48`

- 落地整本小说生产工作流，新增 novel production 相关 tools、service、status service 和前端启动卡片。
- 引入整本生产审批、运行上下文、章节读取与任务追踪能力，支持从结构化大纲走到整本生产执行。
- 完成数据库迁移整理，并保留开发期数据库备份与恢复脚本。

### 2026-03-13 `9434c86`

- 引入 LangGraph 集成，为 Creative Hub / Agent 运行时提供更稳定的图式执行基础。

### 2026-03-12 `003b96f`

- 规划双中枢 AI 创作系统，明确后续 Creative Hub 与生产流的协同方向。

### 2026-03-12 `8c67aef`

- 完成基于 Agent 的创作系统草案，为后续工具编排与工作流落地建立方案基础。

### 2026-03-12 `5b308c1`

- 规划 AI 小说 Agent 的后续路线图，明确未来升级方向与系统边界。

### 当前验证状态

- 2026-03-19 已在本地执行 `corepack pnpm --filter @ai-novel/server test:book-analysis`
- 2026-03-19 已在本地执行 `corepack pnpm --filter @ai-novel/server test:routes`
- 2026-03-19 已在本地执行 `corepack pnpm --filter @ai-novel/client typecheck`
- 服务端拆书专项回归：`6/6` 通过
- 服务端路由回归：`12/12` 通过

## 功能预览

下面这些界面示意图，基本覆盖了当前版本最重要的功能入口。对于第一次了解这个项目的人，直接看图会比先读实现细节更快。

### 创作中枢

`Creative Hub` 是当前版本最核心的入口，用来承载对话、规划、工具执行和创作推进。

![创作中枢](./images/创作中枢.png)

### 小说列表

从这里进入小说创建、管理和编辑，是整本创作流程的起点。

![小说列表](./images/小说列表.png)

### 拆书分析

用于把参考作品拆成结构化知识，再回灌到后续创作流程中。

![拆书分析](./images/拆书.png)

### 知识库

用于管理文档、绑定知识和提供 RAG 检索上下文。

![知识库](./images/知识库.png)

### 世界观

用于构建世界规则、设定层级和一致性约束，是长篇创作稳定性的关键模块。

![世界观](./images/世界观.png)

### 角色库

用于沉淀角色资产，并支持在不同小说之间复用角色能力。

![角色库](./images/角色库.png)

### 任务中心

用于追踪系统中的异步任务、生成进度和执行状态。

![任务中心](./images/任务中心.png)

### 模型配置

用于管理模型提供商、模型路由和不同能力的调用策略。

![模型配置](./images/模型配置.png)

## 典型使用流程

### 从 0 到 1 生成一本小说

1. 在“小说列表”创建小说，填写基础信息，或直接从最少信息开始启动。
2. 进入 `Creative Hub` 或小说编辑页，让系统推进开书设定、故事承诺、风格和大纲决策。
3. 生成发展走向与结构化大纲，并同步章节骨架。
4. 绑定世界观、角色、拆书结果或知识库资料，补齐上下文约束。
5. 启动章节生成或整本生产流程，让 Agent 持续推进创作执行。
6. 在回合总结、世界一致性和角色演化的辅助下，持续修订并收敛成稿。

### 如果你只是想快速体验

1. 先跑起项目。
2. 创建一本小说。
3. 打开 `Creative Hub`。
4. 用最少的信息测试系统能推进到哪一步。

这是理解这个项目最直接的方式。

## 系统架构

```text
client (React + Vite + Tailwind + Plate)
  ├─ 页面层：Creative Hub、小说、拆书、知识库、世界观、角色库、设置
  ├─ 状态层：TanStack Query + Zustand
  └─ 体验层：富文本编辑、工具结果卡、活动流、阶段状态展示

server (Express + Prisma + LangChain/LangGraph)
  ├─ 路由层：creative-hub / novels / book-analysis / knowledge / worlds / ...
  ├─ Agent Runtime：planner / tool registry / runtime / answer composer
  ├─ Creative Hub：LangGraph 执行、中断恢复、回合总结、状态组织
  ├─ 业务服务：novel / world / knowledge / task / settings
  └─ RAG 与任务：切片、嵌入、向量写入、召回、异步索引和任务追踪

shared (TypeScript types)
  └─ 前后端共享的数据结构、API 契约与运行时类型
```

## 项目结构

```text
.
├─ client/                     # 前端应用
│  ├─ src/pages/               # Creative Hub / 小说 / 拆书 / 知识库 / 世界观 / 设置
│  ├─ src/api/                 # API 请求层
│  ├─ src/components/          # 组件与布局
│  └─ src/store/               # Zustand 状态
├─ server/                     # 后端服务
│  ├─ src/routes/              # API 路由
│  ├─ src/agents/              # Planner / Runtime / Tools / Trace
│  ├─ src/creativeHub/         # Creative Hub 图执行与状态组织
│  ├─ src/services/            # 小说 / 世界观 / 知识库 / 任务等业务服务
│  └─ src/prisma/              # 数据模型与迁移
├─ shared/                     # 前后端共享 types
├─ infra/                      # 基础设施配置
├─ docs/                       # 补充文档与审计记录
├─ scripts/                    # 开发辅助脚本
└─ README.md
```

## 快速开始

### 前置要求

- Node.js 20+（建议直接通过 `corepack pnpm` 调用）
- Docker（可选，仅在本地启用 Qdrant 时需要）

### 1. 安装依赖

```bash
corepack pnpm install
```

### 2. 配置环境变量

Windows:

```powershell
copy server\.env.example server\.env
```

macOS/Linux:

```bash
cp server/.env.example server/.env
```

至少配置一个 LLM 提供商的 API Key，例如 `OPENAI_API_KEY`。

### 3. 初始化数据库

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
```

### 4. 启动项目

```bash
corepack pnpm dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/api/health`
- RAG 健康检查：`http://localhost:3000/api/rag/health`

### 5. 可选：启动 Qdrant

```bash
docker compose -f infra/docker-compose.qdrant.yml up -d
```

如果暂时不使用 RAG，可以在 `server/.env` 中设置：

```env
RAG_ENABLED=false
```

## 环境变量

请参考：

- `server/.env.example`
- 根目录 `.env.example`

常用项示例：

```env
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=file:./dev.db

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

RAG_ENABLED=true
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=ai_novel_chunks_v1
```

拆书分析相关的可选调优项：

```env
BOOK_ANALYSIS_MAX_CONCURRENT_TASKS=2
BOOK_ANALYSIS_NOTES_CONCURRENCY=2
BOOK_ANALYSIS_SECTION_CONCURRENCY=2
BOOK_ANALYSIS_CACHE_SEGMENT_VERSION=1
```

- `BOOK_ANALYSIS_MAX_CONCURRENT_TASKS`：同时运行的拆书任务数上限
- `BOOK_ANALYSIS_NOTES_CONCURRENCY`：单次拆书在 source notes 阶段的并发片段数
- `BOOK_ANALYSIS_SECTION_CONCURRENCY`：单次拆书在章节生成阶段的并发 section 数
- `BOOK_ANALYSIS_CACHE_SEGMENT_VERSION`：分段算法版本号；调整分段策略后只需要升版本即可让旧缓存失效

## 常用命令

```bash
corepack pnpm dev
corepack pnpm dev:server
corepack pnpm dev:client

corepack pnpm typecheck
corepack pnpm build
corepack pnpm lint

corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm db:studio
```

## 接口与页面概览

### 前端主要页面

- `/` 首页
- `/creative-hub` 创作中枢
- `/novels` 小说列表
- `/novels/:id/edit` 小说总控台
- `/novels/:id/chapters/:chapterId` 章节编辑
- `/book-analysis` 拆书分析
- `/knowledge` 知识库
- `/worlds` 世界观列表
- `/worlds/:id/workspace` 世界观工作台
- `/writing-formula` 写作公式
- `/base-characters` 基础角色库
- `/tasks` 任务中心
- `/settings` 系统设置
- `/settings/model-routes` 模型路由设置

### 后端主要路由前缀

- `/api/creative-hub`
- `/api/agent-runs`
- `/api/agent-catalog`
- `/api/novels`
- `/api/novel-decisions`
- `/api/novel-chapter-summary`
- `/api/book-analysis`
- `/api/knowledge`
- `/api/worlds`
- `/api/base-characters`
- `/api/writing-formula`
- `/api/rag`
- `/api/llm`
- `/api/settings`
- `/api/tasks`

## 路线图

- [ ] 把“书名即生成”进一步落成默认主链路
- [ ] 增强长篇稳定性，包括人物关系、因果链和时间线一致性
- [ ] 继续强化 `Creative Hub` 的阶段感知、任务组织和生产调度能力
- [ ] 提供更强的可视化剧情图、冲突图和创作反馈面板
- [ ] 完善测试、质量门禁和持续集成能力

## 贡献指南

欢迎提交 Issue / PR。

建议的贡献方式：

1. Fork 仓库并创建分支。
2. 完成改动后运行 `corepack pnpm typecheck`，必要时补充测试。
3. 在 PR 中清楚说明“问题、方案、影响范围、验证方式”。

如果你也在探索 AI Native 应用、创作 Agent 或长篇生成工作流，这个仓库非常欢迎一起把路线走深。

## 免责声明

- 本项目用于工程探索与创作辅助，不保证生成内容的准确性、原创性或可商用性。
- 任何生产用途请自行评估版权、合规和内容安全风险。
- 对 AI 生成内容，始终建议保留人工审校环节。
