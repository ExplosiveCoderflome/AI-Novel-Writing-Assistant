# AI 小说写作助手 v2

面向私有化部署的 AI 小说写作助手，采用 `pnpm workspace` Monorepo。


启 Qdrant：docker compose -f infra/docker-compose.qdrant.yml up -d
跑迁移：pnpm db:migrate（确保新表落库）
触发一次重建：POST /api/rag/reindex（scope=all），再看 GET /api/rag/jobs 和 GET /api/rag/health
## 项目结构

```text
.
├── client/   # 前端（React + Vite + Tailwind + shadcn/ui）
├── server/   # 后端（Express + Prisma + LangChain/LangGraph）
├── shared/   # 前后端共享 TypeScript 类型
├── init.md
├── init1.md
└── package.json
```

## 环境准备

1. 安装依赖

```bash
pnpm install
```

2. 配置后端环境变量

```bash
copy server\.env.example server\.env
```

3. 启动向量库（Qdrant，可选但推荐）

```bash
docker compose -f infra/docker-compose.qdrant.yml up -d
```

4. 初始化数据库（迁移 + 种子）

```bash
pnpm db:migrate
pnpm db:seed
```

### 升级迁移（已有项目必须执行）

本次版本包含以下 Prisma 迁移：

- `server/src/prisma/migrations/20260305103000_world_generator_full`
- `server/src/prisma/migrations/20260305173000_rag_vector_infra`

执行步骤：

```bash
pnpm db:migrate
pnpm --filter @ai-novel/server prisma:generate
```

## 启动项目

```bash
pnpm dev
```

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/api/health`
- RAG 健康检查：`http://localhost:3000/api/rag/health`

## RAG 向量检索（Qdrant）

系统已内置 `Qdrant + Embedding API + 混合检索（向量 + 关键词 + RRF） + 异步索引 Worker`。

### 核心环境变量

- `RAG_ENABLED=true`
- `EMBEDDING_PROVIDER=openai|siliconflow`
- `EMBEDDING_MODEL=text-embedding-3-small`（默认）
- `QDRANT_URL=http://127.0.0.1:6333`
- `QDRANT_COLLECTION=ai_novel_chunks_v1`

完整变量见：

- `server/.env.example`
- `.env.example`

### 触发索引重建

```bash
# 全量
curl -X POST http://localhost:3000/api/rag/reindex \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d "{\"scope\":\"all\"}"
```

### 查看索引任务

```bash
curl -X GET "http://localhost:3000/api/rag/jobs?limit=50" \
  -H "Authorization: Bearer <token>"
```

## 常用命令

```bash
pnpm typecheck
pnpm build
pnpm dev:server
pnpm dev:client
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```
