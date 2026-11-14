# 阶段 1 后续可执行清单

以下是基于当前 beta 代码、测试和计划的后续范围。每项只归入“已被此次功能覆盖”“仍有明确可执行缺口”“只是旧 deferred”三类。

## 旧 P2 项目

| 项目 | 标记 | 当前判断与后续动作 |
|---|---|---|
| 08 删除清单 | 已被此次功能覆盖 | 当前 `server/tests/novelDeleteCleanup.test.js` 已覆盖小说各任务状态、短篇关联记录、图片隔离和事务回滚；后续只需在 beta 集成验收中复用该命令，不再新造删除架构。 |
| #209 回归 | 只是旧 deferred | 当前 beta 已有对应能力和回归证据；若父任务能指出 #209 的具体剩余症状，再新增最小复现，否则不把旧编号扩展成新需求。 |
| RAG + PG | 仍有明确可执行缺口 | 先准备一次性隔离 PostgreSQL 双库和可清理权限；运行 `server/tests/pgCloudAcceptance.harness.test.js`，再运行 `server/tests/postgresMigrateDeployPath.test.js` 与 `pnpm --filter @ai-novel/server prisma:deploy:postgres` 的真实 `migrate deploy` 验收。验收口径：目标 schema 参数正确、view/sequence/type 保留、失败历史拒绝、双库彼此隔离、无 `db push`。无云 PG 前保持“缺环境”。 |
| 短篇 V2 接线 | 已被此次功能覆盖 | `server/tests/production/application/shortStoryAuditPolicy.test.js` 已证明默认关闭，短篇 revision/recovery/production 测试覆盖独立流程；后续只做 beta 集成验收，不开启 default-off 开关，不扩展新分支。 |

## 明确后续开发阶段

### 1. i18n 阶段（单独阶段，禁止在本阶段补做）

- 工作树分别使用 `/workspace/anw-i18n-foundation-20261114`、`/workspace/anw-i18n-zcode-director-20261114`、`/workspace/anw-i18n-zcode-openbook-20261114`，从各自停点 `85fd8560` 继续；不得把 i18n 改动带回本阶段提交。
- 先建立翻译键/默认语言合同，再按目录迁移 client 页面和 server 面向用户的错误文案；禁止全量机械替换。
- 每个子阶段跑对应 client/server typecheck 与既有定向测试，并人工核对初学者主路径的缺失键、变量插值和中文默认值。
- 验收：默认中文路径无缺失键；导演、开书、短篇、运行记录、恢复入口的关键按钮和错误提示均能切换语言；不改变 default-off 特性和运行时合同。

### 2. 更新说明单源（阶段2已实现）

- 目标目录：`docs/releases/release-notes.md`、根 `README.md` 的 `## 最新更新`、必要时 `docs/README.md`/站点 manifest。
- 保持 `docs/releases/release-notes.md` 为完整历史；同一日期合并到同一日期块；README 只保留最新日期块和历史链接。
- 阶段2由应用内更新说明直接读取完整更新历史；`test:release-guards` 中的发布说明合同测试会在桌面 package version 缺少日期条目时失败。
- `v0.8.2` 明确标记为待正式发布候选；`v0.8.1` 保留为当前正式桌面版本。以后提升 package version 时需在完整历史补入同版本日期条目。

### 3. README 精简（阶段2已实现）

- 保留新手写作入口、长短篇主路径、正式发行状态和完整更新记录链接；将细节指向现存文档与项目文档站，移除过长的缓存实现说明。
- `v0.8.2` 是候选而非已发布版本，正式桌面版当前为 `v0.8.1`。

### 4. 收尾前置验证

- 已修复 `manualKernelSqlite.test.js` acceptance transport fixture；阶段2相关命令退出码 `0`，原三项断言通过。
- 已在短篇 recovery 的隔离 SQLite fixture 补齐 `AppSetting` 并统一 SDK compatibility store 所用 client；阶段2相关命令退出码 `0`，两个额度用例按原断言通过。
- 父任务安排 A3 GUI/截图验收；启动方式和操作标准见阶段2结果文档。
- 父任务安排真实隔离 PG 双库 live 验证；没有 `DATABASE_URL` 时不要伪造通过。

## 明确禁止扩展

- **#239 绝不能开发。** 若仍有致谢需求，只作为后续发布说明任务单独列出。
- 致谢不在本阶段修改已发布说明或扩大范围；如后续需要，按 release-notes workflow 作为发布阶段任务执行。
