# 2026-11-14 发布候选交接

## 合并与版本

- 分支：`feat/release-candidate-20261114`。
- 已 fetch：`origin/main=1df5b27b`、`origin/beta=4525fee6`，均未继续推进。
- 已以普通 merge 合入 `origin/main`，合并提交为 `912bbf9f`；保留 main 文档站/英文站更新，根目录旧 `docs.json` 冲突按阶段2的 `mintlify-docs/docs.json` 归属保留删除。
- `desktop/package.json` 已从 `0.8.1` bump 到 `0.8.2`，提交为 `9f5d3c7f`。完整更新说明、README 最新更新、Mintlify 候选口径和应用内单源 guard 已同步。
- 未发现远端 `v0.8.2` tag；GitHub CLI 未认证，无法读取 Releases API，因此不能声称 GitHub Release 已核验。正式 Release、tag、安装包均未创建或上传；现有下载入口仍指向 `v0.8.1`。

## 回归与无 i18n

- `pnpm check:docs-manifest`：通过，36 份公开文档、17 个导演进度键。
- `node --test scripts/tests/release-notes-source.test.cjs`：通过；这是本轮 bump 直接影响的单源 guard。
- shared/server build：通过，用于启动 A3 的 `dist`。
- 未重复阶段2的 46 项专项和 21 项 release-guards。
- 本轮代码与文档差异未包含产品 i18n、语言切换、i18n foundation、ZCode 或 #239；传输包清单也未发现 i18n/ZCode 路径。

## A3 服务与 fixture

- 状态：**可访问，fixture 已就绪**。
- 浏览器 URL：`http://127.0.0.1:43174/outlines/a3-outline#outline-feedback-panel`。
- server：`127.0.0.1:43173`，PID `242146`，日志 `/tmp/anw-a3-acceptance/server.log`。
- client：`127.0.0.1:43174`，PID `238498`，日志 `/tmp/anw-a3-acceptance/client.log`。
- 本机 mock 模型：`127.0.0.1:43175/v1`，PID `244736`，日志 `/tmp/anw-a3-acceptance/mock-model.log`；只响应 `outline.text_feedback` 所需的确定性结构化 SSE，不访问外部模型。
- SQLite：`/tmp/anw-a3-acceptance/outline-feedback.sqlite`；app-data：`/tmp/anw-a3-acceptance/app-data`。环境仅对本次 client 设置 `VITE_OUTLINE_FEEDBACK_ENABLED=true`。
- 项目 ID `a3-outline` 已绑定小说 `a3-novel`；第1章有 `ChapterSummary.summary` 和已写正文，第2、3章为 planned。最终待操作 run：`1e900729-ebfa-455d-92a3-66e7e662440f`，两个建议当前均为 `pending`。
- 父任务操作顺序：打开 URL，查看“章节反馈”，对 `mock-summary` 点拒绝并核对状态；再对另一条建议点采纳。也可刷新确认分析完成后建议仍需逐项处理。
- 已验证证据：分析前 `/tmp/anw-a3-acceptance/evidence-before.json`；拒绝后 `/tmp/anw-a3-acceptance/evidence-after-reject.json`；采纳后 `/tmp/anw-a3-acceptance/evidence-after-adopt.json`。拒绝阶段修订号和节点值不变；采纳阶段从修订号1变为2，仅后续 `a3-s3.purpose` 变化；第1章正文始终为“已写正文：主角发现钥匙是假的。”。

## PG 脚本修复与隔离验收

- 修复提交：`8286e39e`。官方检查对 `pg_class.relkind`、`pg_type.typtype` 及相关名称显式 cast 为 `text`，并避免对已分类 inspect state 二次分类；未修改历史 migration SQL。
- `export COREPACK_HOME=/home/box/.local/share/corepack; node --test server/tests/postgresMigrateDeployPath.test.js`：退出码 `0`，14/14 通过。
- `PG_ADMIN_URL=postgresql://pgaccept@127.0.0.1:45432/postgres node scripts/acceptance/pg-cloud-harness.cjs`：退出码 `0`；raw 裸 `prisma migrate deploy` 仍按历史链失败并保留为证据，official fresh baseline/stamp/deploy 成功（112 个历史目录），官方 PG harness 5/5 通过；两库已清理。
- `DATABASE_URL=.../ai_novel_cloud_incremental_20261114 node scripts/deploy-prisma-postgres.cjs --fresh-empty-ok`：退出码 `0`；随后再次运行 managed 增量路径：退出码 `0`，`migrate deploy` 幂等完成。
- 隔离安全负例：已有用户表无迁移历史 + `--fresh-empty-ok` 退出码 `2`；新鲜空库缺少 `--fresh-empty-ok` 退出码 `2`。均未放行自动 stamp/deploy。
- 期间曾发现候选树 `server/dist` 为旧 SQLite client；按既有 A3 交接约定用 PostgreSQL schema 重新 `prisma generate` 并 `server build` 后复验，未修改 A3 服务（43173/43174/43175）。

## 传输包与阻塞

- 旧传输包 `/workspace/anw-release-candidate-20261114-0.8.2-9f5d3c7f.tar.gz` 已过期；应以本轮新包为准。
- 新包：`/workspace/anw-release-candidate-20261114-0.8.2-8286e39e.tar.gz`；SHA-256 与 `.sha256` 文件在 `/workspace/` 生成。
- 新包对应本轮修复提交 `8286e39e`，仅含 Git 跟踪源树；排除 `.git`、node_modules、env、数据库、日志、构建产物和 i18n/ZCode。
- 临时 PG 使用 `127.0.0.1:45432`，验收结束后执行 `pg_ctl -D /workspace/anw-pg-cluster -m fast -w stop`；未连接或占用系统 `5432`。
- 发布阻塞：需有权限的 GitHub 账号重新核对 `v0.8.2` Release 状态；随后由发布流程决定是否创建匹配 tag 和安装包。本轮已本地提交，未 push、未打 tag、未发布。
