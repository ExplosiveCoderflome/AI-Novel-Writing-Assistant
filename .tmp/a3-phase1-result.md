# A3 Phase 1 结果

分支：`feat/outline-feedback-a3`；起点：`7df90b2b`。

## 完成范围

- 已实现服务端摘要反馈与共享 API 类型。默认按章，支持每 N 章、卷末、关闭及手动分析，设置可保存 provider/model。
- 在既有摘要落库入口异步通知：章节摘要服务、旧版资产同步、最终资产摘要写入、手动章节摘要投影。
- 输入仅保存摘要和相关的可调整大纲节点；不查询或传入章正文，显式退出生成 required-context，避免继承上一章正文。
- 持久化运行、快照、次数、错误、逐项决定；pending/running 不阻塞生成；failed 与超时 running 支持显式重试。
- 每项建议对应 A1 提案，采纳复用 OutlineProposalService 创建版本。显式逐项采纳/拒绝支持混合处理、部分采纳与幂等；通用 A1 入口禁止绕过反馈采纳。
- 事务内校验 A2 策略和映射、摘要、工作版本与活动章纲；用户保留/固定字段不可修改。更新策略值与未来映射章纲，清除过期任务/场景与 StoryPlan；人物弧线和伏笔调整也使关联未来任务失效。
- 未绑定自动书与 B1 原稿修订书不会调用分析器。保留绑定原采用修订及 sourceDocumentHash，不修改原稿基线、过去章或当前章。
- 新增双数据库增量迁移；没有对协调器数据库执行迁移。客户端 UI 留待 phase 2。

## API

前缀沿用大纲挂载：`/api/outlines/:id/feedback`；返回 `{success:true,data}`。

| 方法/路径 | shape |
| --- | --- |
| GET `/` | OutlineFeedbackStatus：projectId、novelId、sourceRoute、settings、最近50条 runs（含 items） |
| PATCH `/settings` | `{mode:"chapter"/"every_n"/"volume"/"off",everyN?,provider?,model?}`；返回完整 settings |
| POST `/analyze` | `{chapterId,requestKey}`；返回 `{id,status,chapterId,chapterOrder}`，后台运行 |
| GET `/proposals` | 最近50条 run 的逐项建议，附 runId |
| POST `/:runId/retry` | 返回 `{id,status:"pending"}` |
| POST `/:runId/adopt` | `{operationIds:string[]}`；返回 `{id,items}` |
| POST `/:runId/reject` | 同上 |

item：`{operationId,proposalId,nodeId,fields,reason,status:"pending"/"adopted"/"rejected"}`。
设置是完整替换；省略 mode/everyN 采用 chapter/5。冲突返回 409；过期建议通过新的 manual requestKey 重新分析。

## 设计决定与维护边界

详细合同见 `docs/wiki/workflows/outline-text-feedback.md` 与 feature README。

- 反馈属于现有 planning/outline 子模块，复用 A1 版本与 diff、A2 policy，避免建立独立导演链。
- 固定判断仅用于触发频率、字段权限、输入边界与落库验证，创作建议由注册结构化 AI 资产产出，无关键字匹配降级。
- 独立项每次采纳产生一个版本；同 run 剩余项跟进自身已采纳版本，外部编辑必须重新分析。
- 字段调整限定 update_fields，不修改身份/章序/关系。输入最多后续8章、8人物、8伏笔，节点JSON≤12000字符、摘要≤3000字符；最多12项，每字段输出≤1600字符；输出3500 tokens，单次请求120秒。
- 进程内异步调度与持久化收据结合；pending 可由重复请求或 retry 重新调度，running 超过10分钟可显式恢复；attempt fencing 防止旧尝试回写。
- 拒绝不影响版本；采纳原子更新工作大纲、policy、章纲投影与 item 状态。

## 修改文件

- `shared/types/outlineFeedback.ts`
- `server/src/modules/planning/outline/feedback/{index.ts,README.md,domain/feedbackPolicy.ts,application/OutlineFeedbackService.ts,http/feedbackRoutes.ts}`
- `server/src/modules/planning/outline/application/OutlineProposalService.ts`
- `server/src/modules/planning/outline/infrastructure/OutlineRepository.ts`
- `server/src/modules/planning/outline/http/outlineRoutes.ts`
- `server/src/prisma/schema.prisma`、`schema.sqlite.prisma`
- `server/src/prisma/migrations/20261111150000_outline_feedback/migration.sql`
- `server/src/prisma/migrations.sqlite/20261111150000_outline_feedback/migration.sql`
- `server/src/prompting/prompts/outline/feedback.prompts.ts`
- `server/src/prompting/registry/promptAssetLoaderEntries.ts`、`core/requiredContext.ts`、`promptCatalog.ts`
- `server/src/services/novel/NovelChapterSummaryService.ts`
- `server/src/services/novel/runtime/ChapterArtifactSyncService.ts`
- `server/src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts`
- `server/src/services/novel/chapterEditor/persistence/ChapterArtifactProjectionStore.ts`
- `server/tests/outlineFeedback.test.js`
- `docs/wiki/workflows/outline-text-feedback.md`
- `README.md`、`docs/releases/release-notes.md`
- 本报告。

## 验证

全部通过：

1. `node node_modules/typescript/bin/tsc -p shared/tsconfig.json`
2. `node server/node_modules/prisma/build/index.js generate --config server/prisma.config.ts`
3. `node node_modules/typescript/bin/tsc -p server/tsconfig.json`
4. 两种 schema 的 `prisma validate --schema ...`。
5. `node --test`：outlineFeedback、outlineApplication、outlineDocument、outlineOpenBookProtection、outlineOpenBookMapping、outlinePromptAssets、outlineOpenBookNativeSqlite、novelProduction/manualChapterSyncSqlite、novelProduction/manualChapterConsumersSqlite：**59 tests / 59 pass / 0 fail**。

新增测试覆盖：四种触发策略、摘要隔离、未绑定/B1排除、非阻塞待分析、失败重试、去重、部分/逐项采纳、拒绝、幂等、新版本、当前/来源不变、过期摘要/策略/规划/版本、已写后章、锁定节点、人物弧线/伏笔未来任务失效、SQLite增量迁移保留数据、Prompt注册与正文上下文隔离。

pnpm 命令受系统 Corepack 缓存目录权限阻挡，已直接调用相同本地 TypeScript/Prisma 执行构建。手动同步回归输出了其预期冲突场景的 Prisma 唯一约束/CAS 日志，最终全部通过。

未运行真实模型、全量fast suite、客户端构建/UI验证或 PostgreSQL 实库迁移；本阶段服务器与共享构建、隔离SQLite测试覆盖相关路径。phase 2 负责 UI 接入和验收。

遵守限制：未读取/输出任何 `.env`、凭据文件；未 push、release 或调用 GitHub；未操作其他 worktree、进程或端口。仅使用当前工作区、本地工具与新建隔离测试库。
