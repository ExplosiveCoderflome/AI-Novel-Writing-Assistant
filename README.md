# AI 小说写作助手 v2

面向私有化部署的 AI 小说写作助手，采用 `pnpm workspace` Monorepo。
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

如果你使用 `Qdrant Cloud` 而不是本地 Docker，请把 `server/.env` 中的这两项改成你的云端实例：

```env
QDRANT_URL=https://your-cluster.us-west-2-0.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-cloud-api-key
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
- `server/src/prisma/migrations/20260306164500_rag_embedding_settings`

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

前端“系统设置”页现在也支持保存 `Embedding Provider / Embedding Model`，保存后会覆盖环境变量中的同名 RAG 设置并立即生效。

如果使用 `Qdrant Cloud`：

- `QDRANT_URL=https://<your-cluster>:6333`
- `QDRANT_API_KEY=<your-qdrant-cloud-api-key>`
- 不需要本地启动 `Docker Qdrant`

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
