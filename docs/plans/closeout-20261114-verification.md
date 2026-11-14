# 阶段 1 核销记录（2026-11-14）

## 范围与基线

- 工作树：`/workspace/anw-closeout-20261114`
- 分支：`feat/closeout-20261114`
- 核销基线 / 当前 HEAD：`4525fee645b56e78b06820fcea9f100991826d08`
- `origin/beta` 在开始时与该 HEAD 一致。
- 本阶段未连接用户数据库、远端资源或监听端口，未跑全量 i18n，未启动 GUI、发布、push 或合并。

## 定向回归

| 项目 | 结论 | 证据 | 缺口说明 |
|---|---|---|---|
| 预算不足直接提示追加额度 | 已通过 | `cd server && node --test tests/structuredBudgetErrorPassthrough.test.js ... tests/customProviderAutoProbeDefault.test.js`（构建后退出码 `0`）；断言 `budget refusal before dispatch escapes the structured chain typed` 通过。 | 测试输出同时有隔离 SQLite 缺表的非阻断日志，但不影响断言。 |
| 模型拒绝严格结构化格式时自动降级重试 | 已通过 | 同一命令退出码 `0`；`bare 400/422 rejection implicates the structured mode`、`chain falls back to the next strategy when json_schema gets a bare 400` 通过。 | 无。 |
| 模型路由结构化格式对导演调用生效 | 已通过 | 同一命令退出码 `0`；`a matching route format applies even with an explicit provider and model` 通过，且不同 provider/model 不泄漏格式。 | 无。 |
| 思考耗尽预算时提示先做兼容探测 | 已通过 | 同一命令退出码 `0`；已知/未知思考开关两条提示断言均通过。 | 无。 |
| 更新不存在的小说返回 404 | 已通过 | 同一命令退出码 `0`；HTTP 记录 `PUT /api/novels/novel-does-not-exist 404`，测试通过。 | 无。 |
| 新建自定义厂商默认自动探测兼容性 | 已通过 | 同一命令退出码 `0`；`POST /api/settings/custom-providers 201`，默认自动探测测试通过。 | 无。 |
| Windows / 本地 `manualChapterSave` 并发稳定性 | 已通过 | `cd server && node --test tests/novelProduction/manualChapterSaveSqlite.test.js tests/novelProduction/manualChapterSyncSqlite.test.js tests/production/manualKernelSqlite.test.js`；`manual chapter saves fence concurrent writes...` 与 `manual saves and timeline finalization roll back...` 均通过；独立 SQLite 的 manual save / sync 相关用例通过。 | 这是 Linux 本地 SQLite 证据，不等于 Windows GUI 验收。`manualKernelSqlite.test.js` 的 3 个跨进程生产内核用例在同一命令中失败，见下方“未通过/环境缺口”，未作代码修改。 |

### 运行前置与失败分类

首次直接运行上述 `server/tests` 时退出码为 `1`，原因是工作树没有 `server/dist`，报错为 `Cannot find module '../dist/app.js'` / `Cannot find module '../dist/db/prisma.js'`，不是测试断言失败。首次无 Prisma Client 的构建退出码为 `2`；执行 `pnpm --filter @ai-novel/server run prisma:generate && pnpm --filter @ai-novel/server build` 后退出码为 `0`，随后同一批定向用例按上表复跑。

`manualKernelSqlite.test.js` 的 3 个失败都停在 acceptance assessment：fixture 返回结果后记录 `acceptance_invocation_failed`，运行进入 `manual_recovery`，不是 manual save 的并发覆盖断言失败。失败日志明确为 `章节检查调用未完成，请保留正文并从章节页面重新审校。`。这需要后续单独修复 fixture / acceptance contract 或确认测试环境契约，不能在本阶段用放宽断言掩盖。

## 已有功能核销

| 项目 | 结论 | 证据 | 缺口说明 |
|---|---|---|---|
| A3 真实章节反馈面板 | 缺测试（代码合同通过） | `node --test client/tests/outlineFeedbackContracts.test.js` 退出码 `0`；断言默认关闭、未绑定/移动端隐藏，且 `client/src/pages/outlines/OutlineFeedbackPanel.tsx` 存在入口。`cd server && node --test tests/outlineFeedback.test.js` 中反馈持久化、逐项采纳/拒绝、不改原稿等 8 项相关断言通过。 | 没有 GUI 截图/人工交互证据；本阶段不能把旧章节页当 A3 通过。需要父任务安排桌面/浏览器验收，确认绑定入口、选择后采纳/拒绝和“不自动改纲”。默认开关未修改。 |
| 短篇 revision 服务与既有证据 | 已通过（代码/保存证据）；缺真实模型环境 | `cd server && node --test tests/manuscriptShortStoryRevisionSqlite.test.js tests/production/shortStoryReviewSqlite.test.js tests/shortStoryWorkflowContracts.test.js tests/shortStoryRevisionRecovery.test.js` 共 73 项，71 通过；revision 的确认基线、CAS 回执、采纳/撤回、连续导出、恢复/并发/人工编辑保护等断言通过。仓库已有 `docs/wiki/workflows/creation-studio-short-story.md`、`docs/wiki/debugging/short-story-structured-failures.md` 与测试 fixture 作为保存证据。 | 两个 `shortStoryRevisionRecovery.test.js` SDK 输出额度用例因隔离 fixture 缺少 `AppSetting` 表失败（退出码 `1`），不是模型输出断言失败。未调用真实生成模型；没有新增真模型证据。 |
| 笔名与封面提示词 | 已通过 | `cd server && node --test tests/novelCoverPromptSupport.test.js` 退出码 `0`；笔名进入正向封面提示词、空笔名保持 title-only、不会进入 negative constraints。 | 无。 |
| T1/T2 删除清理 | 已通过 | `cd server && node --test tests/novelDeleteCleanup.test.js` 退出码 `0`；21 项通过，覆盖各任务状态、事务回滚、小说隔离、独占图片、短篇关联记录。 | 无。 |

## PostgreSQL 迁移与 harness

| 项目 | 结论 | 证据 | 缺口说明 |
|---|---|---|---|
| 官方脚本 schema 参数、跨 schema view/sequence/类型、失败历史拒绝、独立双库 harness | 已通过（静态/隔离逻辑） | `cd server && node --test tests/postgresMigrateDeployPath.test.js` 退出码 `0`，13/13 通过：历史 checksum 不变、双 schema/dialect safe、空库缺陷分类、schema/search_path、view/sequence 非空、失败 `_prisma_migrations` 拒绝、双 disposable database harness 计划均有断言。 | 本机无可安全使用的 PostgreSQL；未连接用户库。 |
| PG cloud/live harness | 缺环境 | `cd server && node --test tests/pgCloudAcceptance.harness.test.js` 退出码 `1`，入口明确报 `PG harness requires postgresql DATABASE_URL`。 | 由父任务安排一次性隔离双库或云 PG；必须提供脱敏的 PostgreSQL `DATABASE_URL`、可建库权限和清理窗口。不得用 `prisma db push` 替代 `migrate deploy`。 |

## 本阶段修改

没有发现需要在本阶段直接修复的明确业务回归。保留失败证据，未放宽断言、未改历史 migration SQL、未改默认特性开关。
