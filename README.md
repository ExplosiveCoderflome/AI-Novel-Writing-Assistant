# 这是对AI完全接入项目开发的一次尝试
# 项目中所有代码都是AI编写
# 目标：只需要进行书名配置 和 点击确认按钮 即可生成（理想）小说

<div align="center">

## AI Novel Writing Assistant v2

让小说创作从“复杂编排”走向“参数化生产”。

从书名到章节，从角色到世界观，从知识库到拆书时间线，尽量把高成本人工流程改造成可复用的 AI 流程。

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![AI](https://img.shields.io/badge/AI-LangChain%20%2F%20LangGraph-0EA5E9)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)

</div>

## 目录

- [项目定位](#项目定位)
- [核心能力](#核心能力)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [典型使用流程](#典型使用流程)
- [项目结构](#项目结构)
- [环境变量](#环境变量)
- [常用命令](#常用命令)
- [接口与页面概览](#接口与页面概览)
- [路线图](#路线图)
- [贡献指南](#贡献指南)
- [免责声明](#免责声明)

## 项目定位

这是一个“AI 参与全链路开发 + AI 驱动全流程创作”的实验型产品项目，目标不是做一个简单写作工具，而是逐步逼近：

**“输入最少信息（理想情况下只要书名）即可稳定生成可发布小说。”**

当前版本已经覆盖：

- 小说主流程（基础信息、发展走向、结构化大纲、章节）
- 续写模式（可从小说库或知识库来源续写）
- 拆书分析与知识回灌
- 角色体系与时间线
- 世界观构建与一致性检查
- RAG 检索增强

## 核心能力

### 1) 小说生产管线

- 支持原创与续写两种写作模式
- 发展走向（Outline）支持初次生成提示词
- 发展走向与结构化大纲支持二次 AI 修正（全文/选中片段）
- 支持将结构化大纲同步成章节骨架
- 支持章节批量生成、章节审校、章节修复、章节钩子生成

### 2) 续写能力

- 可选择续写来源：已有小说、知识库小说文档
- 若来源存在拆书结果，可选择绑定指定拆书结果
- 可选择引用拆书模块（总览、剧情、时间线等）
- 在续写上下文中可持续注入已选拆书信息（时间线可作为高权重参考）

### 3) 拆书分析（Book Analysis）

内置结构化拆书维度：

- 总览
- 剧情结构
- 故事时间线
- 人物系统
- 世界观设定
- 主题表达
- 文风技法
- 商业化卖点

并支持：

- 分模块编辑
- 分模块 AI 优化
- 发布到知识库（用于后续生成）

### 4) 角色系统

- 小说内角色：创建、编辑、删除、演化、时间线同步、世界规则检查
- 基础角色库：创建、编辑、删除、导入到小说
- 角色形象图：生成、多图管理、主图设置

### 5) 世界观系统

- 世界观创建与编辑
- 分层设定与快照
- 深化问答
- 一致性问题检测
- 世界观属性库复用

### 6) 知识库与 RAG

- 文档上传与版本管理
- 文档启用/停用/归档
- Novel/World 维度知识绑定
- Qdrant 向量检索 + 关键词检索 + RRF 融合
- 异步索引任务与状态追踪

### 7) 模型与配置

- 支持多模型提供商（OpenAI / DeepSeek / SiliconFlow / Anthropic / xAI）
- 支持模型参数与 API Key 配置
- 支持 Embedding Provider / Model 在线配置

## 系统架构

```text
client (React + Vite + Tailwind + Plate)
  ├─ 页面层：小说、拆书、知识库、世界观、角色库、设置
  ├─ 状态层：TanStack Query + Zustand
  └─ 编辑体验：富文本与 AI 修正交互

server (Express + Prisma + LangChain/LangGraph)
  ├─ 业务路由：novels / book-analysis / knowledge / worlds / ...
  ├─ AI 服务：生成、修订、审校、修复、续写注入
  ├─ RAG 服务：切片、嵌入、向量写入、召回与重排
  └─ Worker：拆书任务、图像生成任务、RAG 索引任务

shared (TypeScript types)
  └─ 前后端共享的数据结构与契约
```

## 快速开始

### 前置要求

- Node.js 20+（建议）
- pnpm 10+
- Docker（可选，仅本地 Qdrant 时需要）

### 1. 安装依赖

```bash
pnpm install
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

至少配置一个 LLM 提供商的 API Key（如 `OPENAI_API_KEY`）。

### 3. 初始化数据库

```bash
pnpm db:migrate
pnpm db:seed
```

### 4. 启动（前后端同时）

```bash
pnpm dev
```

启动后默认地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/api/health`
- RAG 健康检查：`http://localhost:3000/api/rag/health`

### 5. （可选）启动 Qdrant

```bash
docker compose -f infra/docker-compose.qdrant.yml up -d
```

如果不使用 RAG，可在 `server/.env` 中设置：

```env
RAG_ENABLED=false
```

## 典型使用流程

### 从 0 到 1 生成一本小说

1. 在“小说列表”创建小说并填写基础信息（可选续写模式）。
2. 进入“发展走向”生成初稿，必要时对全文或选中片段做二次修正。
3. 生成“结构化大纲”，同步章节骨架。
4. 执行章节生成管线，按需审校与修复。
5. 在角色页同步时间线并做角色演化。
6. 若有拆书/知识库资料，可绑定并在续写阶段持续引用。

## 项目结构

```text
.
├─ client/                     # 前端应用
│  ├─ src/pages/               # 业务页面（小说/拆书/知识库/角色/世界观等）
│  ├─ src/api/                 # API 请求层
│  ├─ src/components/          # 组件库
│  └─ src/store/               # Zustand 状态
├─ server/                     # 后端服务
│  ├─ src/routes/              # 路由层
│  ├─ src/services/            # 业务服务层
│  ├─ src/llm/                 # 模型调用封装
│  └─ src/prisma/              # 数据模型与迁移
├─ shared/                     # 前后端共享 types
├─ infra/                      # 基础设施配置（Qdrant compose）
└─ README.md
```

## 环境变量

请参考：

- `server/.env.example`
- 根目录 `.env.example`

常用项（节选）：

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

## 常用命令

```bash
pnpm dev
pnpm dev:server
pnpm dev:client

pnpm typecheck
pnpm build

pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

## 接口与页面概览

### 前端主要页面

- `/novels` 小说列表
- `/novels/:id/edit` 小说总控台（基础信息/大纲/章节/管线/角色）
- `/book-analysis` 拆书
- `/knowledge` 知识库
- `/worlds` 世界观
- `/base-characters` 基础角色库
- `/writing-formula` 写作公式
- `/settings` 系统设置

### 后端主要路由前缀

- `/api/novels`
- `/api/book-analysis`
- `/api/knowledge`
- `/api/worlds`
- `/api/base-characters`
- `/api/writing-formula`
- `/api/images`
- `/api/rag`
- `/api/settings`
- `/api/chat`

## 路线图

- [ ] 将“书名即生成”能力落地为默认主流程
- [ ] 增强长篇稳定性（人物关系、因果链、时间线一致）
- [ ] 提供可视化剧情图与冲突图
- [ ] 提供自动出版排版与多平台发布适配
- [ ] 完善测试与工程质量（lint/test/CI）

## 贡献指南

欢迎提交 Issue / PR。

建议贡献方式：

1. Fork 仓库并创建特性分支。
2. 提交改动并通过 `pnpm typecheck`。
3. 在 PR 中说明“问题、方案、影响范围、验证方式”。

## 免责声明

- 本项目用于工程探索与创作辅助，不保证生成内容的准确性、原创性或可商用性。
- 任何生产用途请自行评估版权、合规和内容安全风险。
- AI 生成内容建议保留人工审校环节。
