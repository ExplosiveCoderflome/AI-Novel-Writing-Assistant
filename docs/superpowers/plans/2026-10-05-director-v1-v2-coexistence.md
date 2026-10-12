# 导演 V1 / V2 共存 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在当前会话执行；不创建子代理。

**Goal:** 用户按小说选择 V1 或 V2，同时保证任务、恢复和执行相互隔离。

**Architecture:** 小说版本绑定与 epoch 是应用边界的写入围栏。V1 / V2 保留独立编排表；装配层向 V2 注入通用执行权限，V1 入口与 Worker 通过共用的所有权模块守卫，章节生成只复用底层业务能力。

**Tech Stack:** TypeScript、Express、Prisma、SQLite / PostgreSQL、React。

**Spec:** docs/superpowers/specs/2026-10-05-director-v1-v2-coexistence-design.md

## Global Constraints

- V2 内核不导入 V1；不双写两套生产状态。
- 不调用真实模型，不修改正文，不迁移对方的 Seed / 游标 / 确认门。
- 测试数据库必须为完整 schema 的独立临时库。
- 运行记录只读；界面使用项目 UI 原语和低边框布局。
- 不创建子代理，不推送，不合并 beta / main。
- 保留现有用户未提交文件。

## Task 1：持久化归属与版本切换

**Files:** shared/types/director/version.ts；server/src/modules/novel/director-routing/{index.ts,ownership.ts,http.ts,README.md}；两套 Prisma schema / 增量 migration；server/tests/directorNext/application/directorVersionIsolationSqlite.test.js。

**Interfaces:** `getNovelDirectorIdentity(id)`、`assertNovelDirectorVersion(id, version, epoch?)`、`canExecuteLegacyTask(taskId)`、`switchNovelDirectorVersion(id, version, expectedEpoch)`。

- [x] 在临时库通过真实 HTTP 验证历史识别与切换：V1 请求保留原链路，V2 记录继续进入 V2；跨版本命令不写数据。
- [x] 执行新增测试，观察缺少版本契约的失败。
- [x] 为 Novel 添加可空版本与 epoch；为 NovelWorkflowTask 添加版本与 epoch；V2 Run 不可变契约保存 executionEpoch。实现版本识别、事务写围栏与未结束任务检查。

```ts
await switchNovelDirectorVersion('book', 'v2', 0);
await assert.rejects(assertNovelDirectorVersion('book', 'v1', 0));
```

- [x] 运行独立测试，检查旧任务和章节完整快照保持不变。

## Task 2：开书、路由与命令隔离

**Files:** server/src/app/director/{entrySwitch.ts,newBook.ts,opening/*,entry/agentTools.ts,services.ts,productionComposition.ts}；server/src/app.ts；server/src/modules/novel/setup/http/novelBaseRoutes.ts；V1 命令接收与执行模块；shared/types/novelDirector.ts；V1 HTTP 请求 schema。

**Interfaces:** 所有开书请求可以携带 `directorVersion`；已有开书任务的选择冻结。V2 `open_run` 的权限检查在装配层，通用 execute permission 由 bootstrap 注入。

- [x] 新增 V1 / V2 开书任务选择及冲突回归测试。
- [x] 确认失败后，将全局冻结改为按小说与任务归属守卫；V1 请求放行原服务，V2 请求走 V2 开书适配器。
- [x] 小说列表 / 详情按各书版本投影来源；历史页面不因全局开关改写来源。

```ts
assert.equal(v1Book.workspaceSourceRoute, null);
assert.equal(v2Book.workspaceSourceRoute, '/lab/director/v2-book');
```

- [x] 运行入口隔离测试并核验不产生对方版本的运行记录。

## Task 3：后台调度与恢复隔离

**Files:** V1 lease、executor、healing 和 workflow runtime；NovelPipelineRuntimeService / NovelPipelineExecutor；V2 bootstrap / worker 通用授权端口；app 后台装配；recoveryCandidates 投影。

**Interfaces:** Worker 领取前与执行前校验归属；V1 recovery 只处理 V1 当前 epoch；V2 job 只由其 Run 显式恢复。

- [x] 新增租约与陈旧恢复混合 V1 / V2 样本，快照验证错误版本零写入。
- [x] 确认失败后实现双 Worker 启动和过滤；V1 开书选择 v2 的命令不被 V1 队列领取。

```ts
assert.equal(await legacyQueue.leaseNextCommand({workerId:'v1', leaseMs:30000}), null);
assert.deepEqual(await readV2Rows(), beforeV2Rows);
```

- [x] 验证切换递增 epoch 后旧任务不能复活；暂停与失败记录不被背景轮询清除。

## Task 4：用户选择与独立工作台

**Files:** client/src/pages/novels/autoDirector/{StageModelRun.tsx,useAutoDirectorCreateController.ts,AutoDirectorCreatePage.tsx,draft/*}；client/src/components/directorVersion/*；小说设置 / 工作台顶部；client/src/api/novel/*；client/src/lib/novelRoutes.ts。

**Interfaces:** 版本 GET / PUT 返回 version、epoch、可用版本和可切换状态；选择成功只导航，不发起生成。草稿保存 `directorVersion`。

- [x] 新增草稿与版本导航回归，观察版本缺失失败。
- [x] 开书默认 V2，可选择 V1；已有任务按服务端值恢复且冻结。
- [x] 小说设置提供版本切换；顶部展示导演版本与推进方式两个维度。
- [x] 运行客户端类型检查与聚焦测试；界面交互留给用户验收。

## Task 5：集成验证与文档提交

**Files:** docs/wiki/workflows/director-next-entry-and-takeover.md；相关模块 README；docs/releases/release-notes.md；README.md。

- [x] 更新长期隔离规则及按小说路由知识。
- [x] 运行 shared / server build、client typecheck 与上述入口、租约、恢复回归。仅在改动使前次检查失效时重跑。
- [x] 使用 readme-release-updater 检查范围并更新用户说明。
- [x] 单独暂存本阶段文件，提交 `新增：支持选择导演版本并隔离执行流程`。

## 验证记录（2026-10-06）

- V2 59 个测试文件、244 项通过；V1 26 个测试文件、153 项通过；补充命令状态、通知后续操作和正文复用 / 自动执行 4 个测试文件、68 项通过。均使用完整 schema 的隔离临时 SQLite，不调用真实模型。
- 补充终态 V1 任务仍有排队命令的切换回归：先复现错误切换，再加入排队命令阻断；真实 HTTP 隔离演练通过。最后改动仅收紧版本切换检查，复用此前其他回归结果。
- 历史未绑定候选任务的空版本按 V1 冻结；命令和 bootstrap 均拒绝写入 V2 选择。真实 HTTP 演练验证拒绝后整行不变。
- shared build、server build、client typecheck 通过；客户端草稿、版本路由与书架 8 项聚焦测试通过。客户端检查后仅将“创作代次”文案改为选择范围的操作说明，类型和交互结构不变，复用该结果；界面交互留给用户验收。
- 超长命令服务测试的职责为场景断言、持久化模拟和请求样本。将后两项移到 `tests/director/commands/fixtures/DirectorCommandFixture.js`，保留全部断言；场景文件约 1,210 行。
- 调试库备份：`server/.tmp/director-ownership-backup-20261006-001022.db`，780,873,728 字节，SQLite quick_check 为 ok。开发服务已同步四个字段；核验定义后只补记对应增量迁移，未重放旧迁移。
- 调试库 Novel 118、NovelWorkflowTask 299、DirectorNextRun 12、GenerationJob 642、Chapter 3,970，数量与备份相同。小说、V2 Run、正文作业和章节所有原字段均与备份一致。一项未绑定小说的历史 V1 排队任务由正常启动保护设为人工恢复；没有关联 V2 Run，未产生模型调用。
- 调试书 `director-opening-book-cmutto6sk000mdwvnlzypi79h` 的只读版本接口返回 v2 / epoch 0。保留原调试内容与历史来源。
- 不推送，不合并 beta / main。排除用户原有 00～09 计划、交接文档及 `_iso.cjs`。
