# 2026-11-14 无 i18n 发布候选交接

## 候选与发布竞争面

- 工作分支：`feat/release-candidate-20261114`；候选起点及当前代码提交：`5a6cbde851266e327282574e619df144bab164f2`。阶段 2 验证基线：`5a6cbde`。
- 本轮范围：beta 已合入功能、阶段 2 验收夹具修复、更新说明单源及 README 精简；不含 i18n，不含 #239。候选相对 `origin/beta` 超前 2 个提交，相对 `origin/main` 超前 25 个；`origin/main` 另有 10 个候选尚未包含，`origin/beta` 没有候选独有缺口。共同历史点为 `4525fee645b56e78b06820fcea9f100991826d08`。
- 本轮 fetch 确认 `origin/beta=4525fee645b56e78b06820fcea9f100991826d08`、`origin/main=1df5b27b518fd3ebbc1c09899ee85f6cc35e4f23`。没有观察到远端分支推进。
- 最新正式 tag 仍是 `v0.8.1`，远端 tag 指向 `ae11c01cc2b43620bf24939b5d6f061af9389edd`；未发现本地或远端 `v0.8.2` tag。GitHub CLI 当前未认证，无法查询 Releases API；README 与完整更新说明均将 `v0.8.2` 标为待发布候选、无正式安装包。父任务执行发布动作前应通过有权限的 GitHub 账号再核对 release 页面。
- `desktop/package.json` 在候选为 `0.8.1`；用户给定 main 核对结果同为 `0.8.1`。若父任务发布 0.8.2，必须先在合并后的发布分支按项目版本规则更新 package、更新正式版说明并验证 exact tag `v0.8.2` 对应的新版本；本候选不得自行 bump/tag/push。特别注意 main 比本候选多 10 个提交，合并前核对是否包含影响发布的后续修复，并确认 README/release notes 的候选措辞与桌面内更新说明日期一致。
- 传输包：`/workspace/anw-release-candidate-20261114-source-5a6cbde.tar.gz`；SHA-256 记录于同目录的 `.sha256` 文件。包从提交 `5a6cbde851266e327282574e619df144bab164f2` 的 Git 源码树生成，包含其完整跟踪源码和文档；排除 `.git`、依赖目录、`.env*`、数据库、日志、构建/缓存输出、secret 与所有 i18n/ZCode 相关树和 patch。交接文档在包生成后单独提交，传输包对应代码起点仍是上面的 `5a6cbde`。

## 最小发布门

- `pnpm check:docs-manifest`：通过，36 份公开文档已登记。
- `node --test scripts/tests/release-notes-source.test.cjs`：通过，更新说明来源与 package 日期条目一致。
- `pnpm --filter @ai-novel/desktop build`：通过。
- `pnpm test:release-guards`：通过，21/21。首次在桌面 dist 未生成时运行有 3 项文件缺失；build 后重跑全过。
- 复用阶段 2（同一提交 `5a6cbde`）记录：server build、client typecheck、PostgreSQL 静态迁移/双库合同测试、manualKernel/shortStory 46 项专项测试均通过。本轮未重复这组大测试。
- 跟踪源码没有 i18n foundation、语言包、切换入口或相关依赖。架构 HTML 文档中原有 Archify 图表查看器包含自身 locale 文案，这是该独立文档查看器资源，不是产品国际化功能。

## A3 章节反馈验收

- 状态：**未启动**。验收端口 `43173`/`43174` 原为空闲；前端曾短暂返回 200。server 启动因 Prisma Client 未生成而退出：`Cannot find module '.prisma/client/default'`。本轮已停止前后端进程，当前无该两端口监听；没有运行 Prisma generate 或连接数据库。
- 隔离目录：`/tmp/anw-a3-acceptance/`；预定 SQLite 为 `file:/tmp/anw-a3-acceptance/outline-feedback.sqlite`，app-data 为 `/tmp/anw-a3-acceptance/app-data`。确认后端实际连接路径确实位于该目录再继续。
- 依赖准备后从仓库根目录执行：

  ```bash
  export COREPACK_HOME=/home/box/.local/share/corepack
  pnpm --filter @ai-novel/server prisma:generate
  mkdir -p /tmp/anw-a3-acceptance/app-data
  ```

- server 启动终端：

  ```bash
  export COREPACK_HOME=/home/box/.local/share/corepack
  export DATABASE_URL='file:/tmp/anw-a3-acceptance/outline-feedback.sqlite'
  export AI_NOVEL_RUNTIME=desktop
  export AI_NOVEL_APP_DATA_DIR=/tmp/anw-a3-acceptance/app-data
  export PORT=43173 RAG_ENABLED=false
  pnpm --filter @ai-novel/server exec ts-node-dev --transpile-only src/app.ts
  ```

- client 启动终端：

  ```bash
  export COREPACK_HOME=/home/box/.local/share/corepack
  VITE_API_BASE_URL=http://127.0.0.1:43173/api VITE_OUTLINE_FEEDBACK_ENABLED=true \
    pnpm --filter @ai-novel/client exec vite --host 127.0.0.1 --port 43174 --strictPort
  ```

- 访问 `http://127.0.0.1:43174/outlines`。隔离 SQLite 中先建小说与大纲项目，经「按这份大纲开书」绑定；需至少一章已保存 `ChapterSummary.summary`，并留有后续 planned 节点。配置只指向本机 mock 的模型路由，按已注册 `outline.text_feedback` 返回结构化建议；不使用外部 API/真实生成模型。打开绑定项目的「章节反馈」入口（或直接 `/outlines/:outlineId#outline-feedback-panel`）并触发手动分析。
- 验收标准：等待/分析期间系统不自动改纲；拒绝一条建议后状态更新但大纲修订号和节点值不变；重新分析后采纳另一条建议只修改获准字段并生成新修订；已写章节正文始终不变。不点击采纳时原稿保持不变。父任务自行完成 GUI 操作和截图；本交接不声称 GUI 通过。

## PostgreSQL 隔离双库

- 入口：`node scripts/acceptance/pg-cloud-harness.cjs`。必须显式提供专用 `PG_ADMIN_URL`，指向一次性隔离 PostgreSQL 实例的管理库（通常 `postgres`），不能使用用户/生产库凭证。账户需能创建数据库、设临时库 owner，并具备 `pg_terminate_backend` 和删除 harness 随机命名临时库的权限。
- harness 会生成唯一 `ai_novel_cloud_raw_<随机后缀>` 与 `ai_novel_cloud_official_<随机后缀>` 两库。raw 库仅执行裸 `prisma migrate deploy --config prisma.config.ts` 留作历史链证据；official 库执行 `scripts/deploy-prisma-postgres.cjs --fresh-empty-ok`，随后运行 `server/tests/pgCloudAcceptance.harness.test.js`，最后尝试清理双库。不会回退到 `db push`。若清理失败，先凭 harness 输出/报告核对随机库归属，不能按模糊库名手工删除。
- 命令示例（只可在专用隔离环境执行）：

  ```bash
  export PG_ADMIN_URL='postgresql://<专用验收账号>:<密码>@<隔离主机>:5432/postgres'
  node scripts/acceptance/pg-cloud-harness.cjs
  ```

- 单独执行 official acceptance 前，必须先用官方迁移脚本部署已创建的一次性库：`DATABASE_URL='<一次性 ai_novel_cloud_accept_* 库>' AI_NOVEL_DATABASE_MODE=postgresql pnpm --filter @ai-novel/server prisma:deploy:postgres`，再于 `server/` 执行 `DATABASE_URL='<同一一次性库>' RAG_ENABLED=false node --test tests/pgCloudAcceptance.harness.test.js`。优先使用上面的双库 harness 统一留证；禁止 `prisma db push`。
- 本机只有 PostgreSQL 17.11 `psql` 客户端；未安装 server/initdb/pg_ctl，未发现 Docker/Podman，5432 无监听。因此不能安全拉起临时 cluster；本轮未连接任何已有实例。父任务需提供专用隔离 PG 主机/容器环境，PG live 仍待验证，不新增收费云资源。

## 父任务发布前阻塞

- 先以已认证 GitHub 账号核对是否出现 `v0.8.2` Release/tag，确认 package version、tag、正式更新说明和安装包发布口径一致。
- 先整合 main 领先的 10 个提交并复核其对候选与 release notes 的影响；当前候选仍是 `0.8.1`，不具备发布 tag 前置条件。
- A3 需补 Prisma Client 生成后启动隔离 server/client、准备 mock fixture 并完成真实 GUI 验收；PG live 需专用 `PG_ADMIN_URL` 隔离双库环境。
- 本轮没有 i18n 文件/依赖/切换入口，没有开发 #239；没有 bump、tag、push、合并或发布。
