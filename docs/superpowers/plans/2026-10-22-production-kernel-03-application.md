# 长篇生产内核 03：应用执行与持久化 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在当前会话逐项执行；用户未授权子代理。

**Goal:** 保存每个作业的阶段结果、配置快照与选稿，恢复时复用已保存结果，并阻止失权和人工编辑后的旧写入。

**Architecture:** application 只依赖领域与端口。Prisma 仓储持有版本 CAS；阶段准备描述实际输入指纹，模型调用和预算预约均在数据库事务外。无法确认远端结果时返回 unknown，不能自动重发。

**Tech Stack:** TypeScript、Prisma 7、node:test、临时 SQLite。

**Spec:** ../specs/2026-10-22-production-kernel-design.md；03-application-proposal.md（用户已批准新表）。

## Global Constraints

- refactor/production-kernel 主工作区；V1 冻结，无新依赖；业务库不连接、不迁移。
- 所有应用源码每文件不超过 400 行；不导入导演、工作流或短篇模块。
- 新表按 ownerKey/chapterId 唯一；不同作业同章隔离。模型快照只接受明确字段，不存凭据。
- 北京时间 18:00 前不自动提交；实际文件记入本地清单。

## Task 1：执行器与端口

Files: application/ports.ts、application/unitExecutor.ts、application/requestIdentity.ts；tests/production/application/unitExecutor.test.js。

- [x] 先测试 direct pass、候选核对、保存后恢复不重复模型、输入变化快照拒绝、失权、预算拒绝、未知请求禁止重发。
- [x] `node --test server/tests/production/application/unitExecutor.test.js` 确认缺失导出失败。
- [x] 实现 `runUnit(request, ports)`：loadOrCreate → fence → decideNext → CAS 领取 → reserve → fence → execute → fence → CAS 保存。纯动作也保存。`StagePort.describe` 不得调用模型或写业务数据；返回实际输入指纹与 Prompt/配置版本。
- [x] execute 抛错不擅自判定远端未执行；保留 activeRequestKey，恢复只能查已持久结果或返回 unknown。budget 以 requestKey 幂等预约，拒绝不发请求。
- [x] 同一测试命令通过；状态对象与快照不被调用方修改。

## Task 2：Prisma 仓储与仅新增迁移

Files: infrastructure/progressStore.ts、src/prisma/schema{,.sqlite}.prisma、双迁移 `20261022151000_production_unit_run/migration.sql`；tests/production/productionKernelProgressSqlite.test.js；scripts/run-tests.cjs。

- [x] 先测试新表迁移、归属验证、同作业复用、不同作业隔离、CAS 冲突、三个阶段保存后的崩溃恢复。
- [x] 确认缺失仓储导出或迁移失败。
- [x] 添加批准的模型与双迁移；仓储接收 PrismaClient，不在模块 import 时创建连接。创建和归属校验在事务中完成；所有更新使用 id/version 条件。
- [x] 以 `DATABASE_URL=file:<临时目录>` 生成客户端；双 schema validate；仅临时库执行新增迁移。
- [x] 临时库集成测试注册 integration；build + 新测试 + 原有领域回归通过。

## Task 3：阶段、故事状态与配置

Files: infrastructure/stages/、infrastructure/storyState/、profiles/longChapter.ts。

- [x] 测试配置与规则盘点一致、选稿绑定哈希、阶段结果复用、提交前版本围栏。
- [x] 复用前确认底层服务是否写正文、触发旧 V2 分支或不可注入事务；消费者存在无法注入事务租约的缺口，详见补充方案。
- [x] `ChapterLifecycleService.saveWorkingContent` 当前仅按 id 写入，无法满足事务版本检查。用户已批准独立生命周期保存入口；正文和回执在同一事务检查并保存。
- [x] 阶段适配器＋真实仓储/生命周期/检查点的临时库链路通过：一章完成、三处崩溃、人工编辑、消费者失败恢复及保存后人工暂停；模型与消费者业务写入仍使用明确替身。
- [x] 用户已批准 `03-consumer-ownership.md`；真实消费者业务事务、完整 StoryStatePort 和注入装配在全 schema 临时库验收。空章完成及业务提交后退出恢复均不重复模型或业务写入；真实入口装配在 05 验收。

补充适配：`infrastructure/services/{preparation,modelAdapters,registeredWriter}.ts` 复用现有原生服务 API 和注册 writer；`storyState/{sources,extraction,reconciliation,checkpointStore,preparedRequest,timeline}.ts` 拥有只读输入、恢复和时间线边界。所有模型恢复只查持久结果，回填及严格复核输入在调用前冻结。`prompting/core/promptRunner.ts` 的文本请求接入既有物理预算入口；审校仍须注入持久且冻结的共用检查重试额度。

## Task 4：验收与交接

- [x] 更新模块 README、长期 Wiki、03 报告、中央记录与本地文件清单；新增 G1 补充方案及反例证据。
- [x] 新表与原子写入在临时库验收；03 应用/适配完成本地开发验证。真实入口、切换差异确认及发布流程分别在 05/06/07/08 验收，不声称整体完成。

2026-10-22 最新验证：完整服务端构建、182/182 生产测试（36 临时 SQLite）、三项新增消费者变异通过。G1 范围已获批准并实现，冻结目录保持零修改，详见 03 报告。
