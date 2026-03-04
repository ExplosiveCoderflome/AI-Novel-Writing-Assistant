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

3. 初始化数据库（迁移 + 种子）

```bash
pnpm db:migrate
pnpm db:seed
```

## 启动项目

```bash
pnpm dev
```

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/api/health`

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
