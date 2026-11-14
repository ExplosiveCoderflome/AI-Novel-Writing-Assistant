# 阶段 2 结果

- 验证基线：`4525fee6`
- 分支：`feat/closeout-20261114`
- 记录提交见 git。

## 完成内容

- 修正阶段1结果和核销文档中的基线自引用；统一记录验证基线 `4525fee6`。
- 修复 acceptance 跨进程测试 transport 替身的可选参数处理，三项 manual kernel 原断言通过。
- 短篇 recovery 隔离 fixture 在同一测试 client 中补建缺失的 `AppSetting`，并将兼容性查询连接指向该 client；两项 SDK 输出额度断言通过。
- 桌面应用内更新说明从 `docs/releases/release-notes.md` 读取当前 package version 对应日期条目；新增发布说明版本一致性 guard。README 明确 `v0.8.1` 为当前正式版本、`v0.8.2` 为候选且正式安装包未发布，并精简重复的 Token 缓存实现说明。
- 已更新桌面版本 wiki 中的更新说明单源规则。该阶段补充了稳定约束，故同步维护 wiki。

## 回归命令与结果

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `export COREPACK_HOME=/home/box/.local/share/corepack; pnpm --filter @ai-novel/server build` | `0` | 服务端构建通过 |
| `node --test server/tests/production/manualKernelSqlite.test.js server/tests/shortStoryRevisionRecovery.test.js` | `0` | 46 项通过，含 3 个跨进程用例、2 个 SDK 物理输出额度用例 |
| `node --test scripts/tests/release-notes-source.test.cjs` | `0` | package 版本、完整历史、应用内数据源与候选状态 guard 通过 |
| `pnpm --filter @ai-novel/client typecheck` | `0` | 应用内 markdown 数据读取类型检查通过 |
| `pnpm check:docs-manifest` | `0` | 36 份公开文档 manifest 通过 |
| `pnpm --filter @ai-novel/desktop build`，随后 `pnpm test:release-guards` | `0` / `0` | 先前 guard 直接运行因桌面 `dist` 未构建而有 3 项文件缺失；构建桌面后原 guard 全套 21 项通过 |
| `node --test server/tests/postgresMigrateDeployPath.test.js` | `0` | 13 项 PG 静态迁移与双库合同通过；未连接数据库 |

初次命令探索曾因 pnpm filter 的 Node test 参数不支持逗号列表而以退出码 `1` 结束；改为分别在工作区传入两个测试路径后，实际相关测试通过。未删除测试、跳过用例或改变断言。

## 父任务 GUI 验收：A3 章节摘要反馈

**代码检查开关**：`VITE_OUTLINE_FEEDBACK_ENABLED`，默认 `false`。只在一次性隔离验收环境中对 client 设置为 `true`；不要在日常 `.env` 或正式构建环境打开。入口在 `/outlines` 已绑定项目的「章节反馈」按钮，以及 `/outlines/:outlineId#outline-feedback-panel`。未绑定大纲、移动端和开关关闭时面板不显示。

**数据前置**：在隔离 SQLite 中建立一个小说和一个大纲项目，通过产品的「按这份大纲开书」流程绑定；小说至少有一个已完成且已保存 `ChapterSummary.summary` 的章节，以及后续未写正文、仍为 planned 的章节/大纲节点供建议使用。项目不是 `ManuscriptProject` 原稿修订项目。设置一个仅指向本机 mock 的模型路由，由 mock 对已注册的 `outline.text_feedback` 返回符合 schema 的结构化建议；不可配置外部 API。后端反馈只读取摘要，不需要、也不应准备章节全文。

**安全独立启动参考**（以下仅供父任务执行，本轮未启动服务）：先选择不含用户数据的临时目录，并确认 43173/43174 未占用；本路径禁止使用 3100 或 35173。准备隔离文件夹后分别启动：

```bash
export COREPACK_HOME=/home/box/.local/share/corepack
export DATABASE_URL='file:/tmp/anw-a3-acceptance/outline-feedback.sqlite'
export AI_NOVEL_RUNTIME=desktop
export AI_NOVEL_APP_DATA_DIR=/tmp/anw-a3-acceptance/app-data
export PORT=43173
export RAG_ENABLED=false
pnpm --filter @ai-novel/server exec ts-node-dev --transpile-only src/app.ts
```

另一个终端启动 client：

```bash
export COREPACK_HOME=/home/box/.local/share/corepack
VITE_API_BASE_URL=http://127.0.0.1:43173/api VITE_OUTLINE_FEEDBACK_ENABLED=true \
  pnpm --filter @ai-novel/client exec vite --host 127.0.0.1 --port 43174 --strictPort
```

目录需由验收者预先建立；确认实际 server 的 SQLite 连接路径落在该目录。测试先创建并绑定上述大纲，打开 `http://127.0.0.1:43174/outlines`，进入绑定项目后从章节反馈入口打开面板，触发手动分析并等待完成。逐项点击一条建议的「拒绝」：状态应更新且大纲修订号、节点值不变；再触发一次新分析，对另一条建议点击「采纳」：只允许建议涉及字段改变并生成新修订，已写章节正文不变。等待期间不应自行修改大纲；不点击采纳时原稿应始终不变。通过标准：运行状态和逐项决定可见、拒绝不生成修订、采纳仅更新获准字段、正文不被覆盖；可附大纲版本前后对照截图。必要时使用 mock 确保可重复输出，禁止调用真实模型或生成图片。

## 父任务 PG 云/隔离验收清单

本轮没有发现、读取或连接任何用户/生产数据库，也没有运行 PostgreSQL live 测试。

- 本地静态合同：`cd server && node --test tests/postgresMigrateDeployPath.test.js`（不连接数据库）。
- Live 双库完整流程：在一次性隔离 PostgreSQL 环境中设置 `PG_ADMIN_URL` 后执行 `node scripts/acceptance/pg-cloud-harness.cjs`。脚本生成唯一 raw/official 两个库：raw 库只记录裸 `prisma migrate deploy` 证据；official 库执行仓库官方 `scripts/deploy-prisma-postgres.cjs --fresh-empty-ok` 后运行 `pgCloudAcceptance.harness.test.js`，最后尝试清理两个临时库。裸 migrate 失败属于需要保留的历史链诊断，不能污染 official 库。
- `PG_ADMIN_URL` 使用专门的验收账号和独立主机/隔离实例，URL 中数据库名为管理库（如 `postgres`），不可用用户库凭证。账号需要 `CREATE DATABASE`、临时库 owner 权限、`pg_terminate_backend` 与 `DROP DATABASE` 清理权限。提供维护窗口，确保测试结束能核对报告并清理库；若自动清理失败，不得对不明确的库名手工删库，应先核验随机后缀和归属。
- 直接运行 PG harness 的前置是目标数据库已由官方迁移脚本完成 schema 部署：`cd server && DATABASE_URL='<脱敏的一次性 postgresql://.../ai_novel_cloud_accept_<随机名>' RAG_ENABLED=false node --test tests/pgCloudAcceptance.harness.test.js`。只允许临时库名匹配 harness/test/cloud 等 disposable 规则，禁止默认库名 `ai_novel`、`postgres`、`template0`、`template1`。
- 单库部署命令可在已创建的一次性库上用 `pnpm --filter @ai-novel/server prisma:deploy:postgres`（实际脚本要求 `DATABASE_URL` 为 PostgreSQL URL；空库场景优先采用上述带 `--fresh-empty-ok` 的官方双库 harness）。不得以 `prisma db push` 替代 `migrate deploy`。

## 未完成与安全边界

- A3 真实 GUI/截图验收留给父任务；本轮只提供路径与标准。
- PG cloud/live 验收留给父任务提供专用隔离基础设施后执行。
- i18n 仍从各既有 `85fd8560` 工作树继续，本轮未启动全仓 i18n。
- 未开发 #239；未 bump 版本、打 tag、push、合入 beta/main 或发布；未修改 Mintlify 五包后同步规则。
