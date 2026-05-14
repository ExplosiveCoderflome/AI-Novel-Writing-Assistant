# 自动导演执行面隔离与 API 保活计划

更新日期：2026-04-29

关联文档：

- [自动导演 Runtime 与恢复边界](../wiki/workflows/auto-director-runtime.md)
- [导演模式模块化与状态治理改造清单](./director-mode-module-state-refactor-checklist.md)
- [提示词工作台、上下文装配与统一步骤运行时方案](./prompt-workbench-context-and-step-runtime-plan.md)

## 1. 背景与事故结论

2026-04-29 在测试 `摸头杀驯化全公司兽化危机` 的自动导演恢复 / 继续链路时，出现以下现象：

- 点击“继续导演”后，`POST /api/novel-workflows/:id/continue` 长时间挂起。
- 同一时间，`/api/tasks/overview`、`/api/novel-workflows/novels/:novelId/auto-director`、`/api/novels/:novelId/volumes` 等普通查询接口也开始挂起。
- 后端日志显示任务进入 `runDirectorStructuredOutlinePhase -> chapter_list -> generateVolumes`，并伴随高内存预约锁竞争和大体积卷工作区读写。
- 将 continue 路由改为 `202 Accepted`、延后后台启动后，仍无法根治，因为重型自动导演执行仍在 Web API 主进程中运行。

最终判断：

> 这不是单个接口慢，也不是单纯前端轮询过多，而是自动导演执行面与 Web API 控制面没有隔离。重型小说生产链路运行在同一个 Node 进程内，导致事件循环、SQLite/Prisma 写锁和大对象处理共同拖住所有 API。

## 2. 必须禁止的架构形态

以下做法从本文生效后禁止重新引入：

1. API route 直接 `await` 自动导演长任务、章节生成、卷拆章、质量修复、批量执行或任何 LLM 生产链路。
2. Web API 主进程直接承担高成本 `structured_outline / chapter_list / chapter_detail_bundle / chapter_execution / quality_repair` 执行。
3. 用 `setImmediate`、`void Promise`、`fire-and-forget` 在同一个 Web API 进程里伪装后台任务，作为长期方案。
4. 前端在自动导演运行中反复轮询大体积小说资产接口，例如高频拉取 `volumes` 作为进度来源。
5. 活动任务状态接口返回完整 `seedPayload`、完整 `directorSession`、候选批次、运行时快照或章节大对象。
6. 用 UI 禁用按钮、减少轮询、延迟 toast 等方式掩盖后端执行面阻塞。
7. 让任务状态、运行时投影、产物真相继续散落在 route、service、seed payload 和前端缓存之间。

允许的短期过渡只能用于保护用户数据或停止事故扩散，不能作为完成标准。

## 3. 目标架构

自动导演必须拆为两个面：

```text
Web API 控制面
  - 接收命令
  - 返回轻量任务投影
  - 提供任务中心 / 小说页状态查询
  - 管理用户确认、策略配置和取消请求
  - 不执行重型生产链路

执行面 Worker
  - 领取任务租约
  - 执行 Step Module / NodeRunner
  - 调用 LLM
  - 处理大 prompt、大 JSON、结构化解析
  - 写 Artifact Ledger / DirectorEvent / WorkflowTask 状态
  - 按检查点幂等恢复
```

数据流统一为：

```text
前端继续 / 恢复 / 接管命令
  -> Web API command route
  -> DirectorRunCommand / WorkflowTask queued
  -> Worker lease
  -> DirectorRuntime Orchestrator
  -> Step Module
  -> PolicyEngine
  -> Artifact Ledger
  -> DirectorEvent
  -> Runtime Projection
  -> 前端轻量轮询
```

## 4. 模块边界

| 模块 | 职责 | 禁止事项 |
| --- | --- | --- |
| Web API routes | 验证输入、创建命令、返回 `202` 或轻量查询结果 | 不调用 LLM、不生成卷/章、不直接跑自动导演阶段 |
| Director Command Service | 将用户动作转成幂等命令，绑定 task/run/lease key | 不执行具体生产步骤 |
| Director Worker | 领取命令、续租、执行、失败落态、释放租约 | 不提供用户查询接口 |
| DirectorRuntimeService | 运行时门面、状态快照、事件、策略、节点调度 | 不直接绕过 Worker 被 route 调用长任务 |
| NodeRunner / Step Module | 标准执行单元、读写声明、策略判断、产物写入 | 不直接操作 UI 状态 |
| PolicyEngine | 覆盖保护、成本 gate、范围 gate、审批 gate | 不被前端绕过 |
| Artifact Ledger | 产物真相、版本、依赖、stale、保护状态 | 不只作为 seed payload wrapper |
| Runtime Projection | 面向 UI 的轻量状态 | 不返回完整大体积小说资产 |

## 5. 数据模型与持久化计划

### 5.1 DirectorRunCommand

用于记录所有可执行命令：

- `id`
- `taskId`
- `novelId`
- `commandType`: `continue | resume_from_checkpoint | retry | takeover | cancel | policy_update`
- `idempotencyKey`
- `status`: `queued | leased | running | succeeded | failed | cancelled | stale`
- `leaseOwner`
- `leaseExpiresAt`
- `attempt`
- `payloadJson`
- `errorMessage`
- `createdAt / updatedAt`

要求：

- 同一个 `taskId + commandType + idempotencyKey` 必须幂等。
- 重复点击继续只能复用或返回已有运行命令，不能启动第二条执行链。
- cancel 命令不能直接杀进程，先写取消意图，由 Worker 在安全检查点响应。

### 5.2 DirectorRun / StepRun / Event / Artifact

继续推进当前已落地的 additive schema：

- `DirectorRun` 代表一次可恢复的导演运行。
- `DirectorStepRun` 代表标准节点执行。
- `DirectorEvent` 代表可投影进度。
- `DirectorArtifact` / `DirectorArtifactDependency` 代表产物真相与依赖。

补齐要求：

- Web API 查询只读 projection，不扫描大体积 ledger。
- Worker 写事件必须 append-only，状态更新可投影。
- Artifact Ledger 必须支持缺失判断、stale 判断、用户内容保护和局部恢复。

### 5.3 WorkerLease

如果不单独建表，可先合并进 `DirectorRunCommand`；但语义必须存在：

- 租约必须有过期时间。
- Worker 启动时先回收过期租约。
- 服务重启后，不自动静默续跑，先进入待手动恢复或可继续队列，按当前产品策略执行。

## 6. 后端实施计划

### 阶段 1：命令化入口

目标：所有继续 / 恢复 / 重试入口先变成命令写入。

任务：

- 新增 `DirectorCommandService`。
- `POST /api/novel-workflows/:id/continue` 只创建 command，返回 `202`。
- `POST /api/tasks/recovery-candidates/:kind/:id/resume` 只创建 resume command，返回 `202`。
- `retryTask(..., resume: true)` 对自动导演任务转成 retry/resume command。
- API 返回体只包含 command id、task id、当前轻量状态，不再返回完整任务详情。

完成标准：

- route 层没有任何 `await runDirectorPipeline / continueTask / generateVolumes / repair / chapterExecution`。
- continue 接口在本机压力下 `P95 < 500ms`。
- 重复点击继续只产生一个 active command。

### 阶段 2：Worker 执行面

目标：自动导演重型执行从 Web API 主进程移出。

任务：

- 新增 `server/src/workers/directorWorker.ts`。
- 新增 Worker polling loop：领取 queued command、写 lease、执行、续租、完成或失败落态。
- root dev 脚本区分 `server api` 与 `director worker`，开发态可并行启动，但进程必须分离。
- 桌面宿主后续也必须分别管理 API 与 Worker 生命周期。
- Worker 内部调用现有 `NovelDirectorService / DirectorRuntimeOrchestrator` 的执行方法，但 route 不再直接调用这些执行方法。

完成标准：

- `3000` API 进程忙碌度不随结构化拆章生成显著上升。
- Worker 进程 CPU / 内存消耗可单独观察。
- Worker 崩溃不会让 API 进程停止响应。

### 阶段 3：执行方法瘦身与专用 Worker API

目标：避免 Worker 仍通过巨型 `NovelDirectorService` 门面绕回 API 语义。

任务：

- 抽出 `DirectorExecutionService`，只供 Worker 调用。
- `NovelDirectorService` 收敛为 API facade 与兼容入口。
- `continueTask` 拆成：
  - `createContinueCommand`
  - `prepareResumeContext`
  - `executeContinueCommand`
- `structured_outline` 拆为独立 step：`beat_sheet`、`chapter_list`、`chapter_detail_bundle`、`chapter_sync`。

完成标准：

- `NovelDirectorService` 不再承担 worker loop、command、route 和执行细节混合职责。
- 新增自动导演能力必须注册 Step Module，不允许直接加到主 service 分支。

### 阶段 4：轻量投影与前端降载

目标：前端运行中只读轻量状态，不用高频拉大体积资产。

任务：

- 新增或强化 `GET /api/novels/director/runtime/:taskId/projection`。
- 小说页运行中默认轮询 projection，周期不低于 `4000ms`。
- `GET /api/novel-workflows/novels/:novelId/auto-director` 只能返回活动任务轻量详情；不得把完整 `seedPayload` / `directorSession` 用作轮询响应。
- `volumes` 只在事件版本变化、用户切换到卷工作区或生成完成时刷新。
- 自动导演进度条、任务中心和侧栏都从 projection 读状态。
- 删除运行中对 `volumes` 的固定 2 秒 invalidate。

完成标准：

- 后台执行时，浏览器不再堆积 `volumes` 挂起请求。
- projection 响应体保持小于 `20KB`，P95 小于 `300ms`。
- 活动自动导演任务响应不得携带候选批次、章节正文、prompt 上下文、运行时大快照等执行面大对象。

### 阶段 5：SQLite / Prisma 写入隔离

目标：减少 Worker 写锁对 API 查询面的影响。

任务：

- Worker 写入使用短事务，不在事务内调用 LLM 或做大 JSON 计算。
- 大体积 workspace 文档写入前先在内存完成，事务只做最终落库。
- 对 `volumes` / runtime projection 查询提供轻量 select，避免读取不必要大字段。
- 长写入阶段通过 event 先写进度，避免 UI 等待完整 workspace。

完成标准：

- 后台拆章期间 `/api/tasks/overview`、runtime projection、任务详情不被 SQLite 写锁长期阻塞。
- Prisma query 日志不再出现同一长任务内持续阻塞普通查询的模式。

### 阶段 6：恢复、取消和失败语义

目标：Worker 化后恢复链仍然幂等、可解释、可手动接管。

任务：

- Worker 启动时扫描 stale lease，将命令标记为 `stale`，任务进入待手动恢复。
- 用户点击恢复创建新 command，不复用已 stale 的执行现场。
- cancel 写入取消命令和 abort intent，Worker 在 step 边界停止。
- 失败落态必须包含：
  - `lastHealthyStage`
  - `blockingReason`
  - `resumeAction`
  - `recoverableArtifactRefs`

完成标准：

- 服务重启后不会出现假 running。
- 取消、恢复、重试不会启动并发双链。
- 用户能看到从哪里恢复、为什么停、下一步是什么。

## 7. 前端实施计划

必须完成：

1. 自动导演运行中，页面只轮询 runtime projection。
2. `continue` 成功后按钮立刻退出 pending，显示“已提交继续请求 / 排队中 / 执行中”状态。
3. 运行中不再每 2 秒强制 invalidate `volumeWorkspace`。
4. 任务中心只读 task summary + projection，不读取大体积 workspace。
5. “打开当前任务位置”才拉对应业务资产。
6. 发生 Worker stale / failed 时，显示待恢复动作，不显示运行中。

用户体验目标：

- 新手看到的是“系统正在推进第几步”，不是浏览器卡住。
- 页面可继续点击任务中心、项目导航、查看当前进度。
- 长任务不会把整个工作台变成不可用。

## 8. 观测与回归测试

必须新增以下回归：

1. `continue route returns quickly`
   - 模拟执行服务阻塞 10 秒。
   - 断言 route `500ms` 内返回 `202`。

2. `api remains responsive while director worker is running`
   - 启动 Worker 执行长 structured outline mock。
   - 同时请求 `/api/tasks/overview`。
   - 断言普通接口仍在 `500ms` 内返回。

3. `duplicate continue is idempotent`
   - 同一 task 连点继续。
   - 断言只有一个 active command / lease。

4. `worker stale lease becomes manual recovery`
   - 模拟 Worker 中断。
   - 断言任务不显示 running，显示待手动恢复。

5. `running page does not poll heavy volumes repeatedly`
   - 前端测试或浏览器自动化检查运行态请求。
   - 断言高频轮询只命中 projection，不堆积 `volumes`。

6. `sqlite write lock does not freeze task overview`
   - 模拟 Worker 短事务写入。
   - 断言 overview 查询可返回。

验收必须包含真实 Prisma 抽样：

- 旧项目接管。
- 服务重启后手动恢复。
- `structured_outline` 从节奏板恢复到章节列表。
- 章节批量执行失败后恢复。
- 用户手动修改后影响分析和局部恢复。

## 9. 性能门槛

硬性门槛：

- `POST /continue`：P95 `< 500ms`。
- `/api/tasks/overview`：后台执行期间 P95 `< 500ms`。
- runtime projection：后台执行期间 P95 `< 300ms`。
- 自动导演运行中，前端不得持续堆积 pending XHR。
- Worker 崩溃后，API 仍可打开任务中心和恢复弹窗。

任何不满足以上门槛的提交，不得视为自动导演恢复链完成。

## 10. 防回滚规则

后续开发必须遵守：

- 新增自动导演执行能力时，先问“这是控制面还是执行面”。
- 控制面只能写 command 或读 projection。
- 执行面只能在 Worker 中运行。
- route 层出现以下调用时必须退回重构：
  - LLM invoke
  - `generateVolumes`
  - `runDirectorPipeline`
  - `runDirectorStructuredOutlinePhase`
  - `runChapterExecutionNode`
  - 大范围 repair / review
- 前端运行态新增轮询时，必须证明它读的是轻量 projection，不是完整业务资产。
- 如果为了赶进度临时绕过 Worker，必须在同一 PR 中标明临时范围、回滚计划和阻断验收原因；默认不得合并为完成态。

## 11. 推荐执行顺序

当前优先级调整为：

1. `P0-E0` 自动导演执行面隔离：命令化入口、独立 Worker、轻量投影、API 保活回归。
2. `P0-E1` 恢复链：在 Worker 语义下完成幂等恢复、stale lease、取消和手动恢复。
3. `P0-E1` Artifact Ledger 真相层：为 Worker 恢复和局部重放提供可查询产物真相。
4. `P0-E1` PolicyEngine 硬 gate：所有 Worker 写入动作继续受策略保护。
5. `P0-A` 真实 Prisma 抽样回归：验证旧项目、重启恢复、批量执行和改文局部修复。

执行面隔离没有完成前，不应继续扩大自动导演入口或新增更重的默认生成链路。

## 12. 2026-04-29 落地记录

本轮已完成第一版执行面隔离落地：

- 新增 `DirectorRunCommand` 持久化命令表，用于承载 `continue / resume_from_checkpoint / retry / takeover / cancel` 等自动导演控制面命令。
- `continue`、恢复、任务中心重试、follow-up 继续动作改为写入命令队列，不再从 Web API route 直接调用自动导演重型继续链。
- Worker 执行 `continue / resume_from_checkpoint / retry` 命令时必须强制进入真实恢复执行，不能因为任务表残留 `running` 状态而空转成功。
- Worker stale lease 回收必须同时清理同一任务下残留的 `DirectorStepRun.running`，避免 runtime projection 和任务详情继续展示假运行。
- 自动导演 `continue` 默认不得再执行完整 workspace / Artifact Ledger 影响分析；影响分析只能通过明确的检查入口触发，避免 SQLite 单写锁拖住控制面查询。
- 旧项目接管入口改为先创建轻量接管任务并写入 `takeover` command，实际接管校验、工作区分析和后续执行由 Director Worker 执行。
- 新增独立 `Director Worker` 入口，由 Worker 领取命令、续租、执行、落成功/失败/stale 状态。
- 前端运行态刷新拆成轻量 projection 轮询和产物边界刷新，移除自动导演运行中每 2 秒强刷 `volumes` 的行为。
- 活动自动导演任务详情中的 `pendingManualRecovery` 优先级必须高于 `queued/running` 展示；待恢复任务不得在顶部接管条、任务面板、步骤列表中显示为“运行中”。
- 新增边界回归测试，禁止自动导演控制面 route 重新直接调用 `continueTask`，并验证 dev/desktop dev 会启动独立 Worker。

本轮二次排查确认：只把 `continue` 改为 Worker 命令并不足以完成执行面隔离。点击继续后仍出现成批 pending XHR 的根因是三层压力叠加：

- SQLite 仍处于默认 `DELETE` journal 模式时，Director Worker 的写事务会阻塞 Web API 读请求；即使 API 进程和 Worker 进程已分离，数据库单写锁仍会把控制面拖住。
- `DirectorRuntimeStore` 每次运行态变化都重放并写入完整 steps/events/artifacts，同时把完整 `directorRuntime` 回写到 `NovelWorkflowTask.seedPayloadJson`，导致写锁窗口被放大。
- 小说编辑页和工作台侧栏在自动导演运行态仍会加载或批量刷新完整 workspace、卷工作区、质量报告、角色资源、伏笔台账等大对象；Worker 写锁期间这些请求会排队，形成浏览器侧 pending 堆积。

追加收口要求：

- SQLite 启动时必须配置 `WAL + synchronous=NORMAL + busy_timeout`，除非显式设置 `SQLITE_ENABLE_WAL=false` 进行诊断；桌面版和开发态都不得默认回退到 `DELETE` journal。
- 运行态持久化必须按 delta 写入，只处理变化的 step/event/artifact/dependency；不得在每次 mutation 中全量删除重建运行态，也不得继续把完整 runtime 塞回任务 seed payload。
- 自动导演运行中，前端只能轮询轻量 projection；完整业务资产只能在用户进入对应工作区、事件版本变化后的非运行态、任务完成或等待确认时按当前可见 tab 刷新。
- `waiting_approval` 是硬 gate/人工确认态，不属于需要持续轮询的 running 态；到达 gate 后应停止运行态轮询，等待用户明确继续。
- `waiting_approval` 的“继续”必须提交明确的 `resume` 确认语义；空 `continue` 命令只能排队执行，不能被解释为用户已同意当前 gate。
- `resume` 只能放行当前匹配的 `waiting_approval` 节点一次，不得持久化切换整条运行时策略，也不得绕过后续新的高风险 gate。
- 边界测试必须覆盖：SQLite WAL 配置存在、运行态持久化不再全量重写、前端运行态不再批量 invalidate 全部 workspace 资源。

仍需继续收口：

- 候选确认、标题修复等入口仍包含部分同步准备或旧式后台调度，后续必须逐步迁到可序列化 command。
- `NovelDirectorService.scheduleBackgroundRun` 仍保留兼容旧入口，不能作为新增能力的接入方式。
- Worker 化后的真实 Prisma 抽样仍需覆盖旧项目接管、重启恢复、章节批次恢复和取消后重试。

## 13. 2026-04-30 阶段总结

当前执行面隔离已从“方案确认”推进到“第一版可运行骨架”：

- `DirectorRunCommand` 已承载 `continue / resume_from_checkpoint / retry / takeover` 等控制面命令。
- 独立 Director Worker 已负责领取命令、续租、执行、成功/失败/stale 落态。
- 安全的 `continue / resume_from_checkpoint` 命令首次租约过期时会自动重排，避免短暂 Worker 停顿直接变成手动失败；同一命令重复过期仍转入手动恢复，避免频繁重复 LLM 调用。
- Worker stale 回收会同步清理残留 `DirectorStepRun.running`，减少 runtime projection 展示假运行。
- 前端运行态已从批量刷新完整工作区资产转向轻量 projection 轮询。
- 章节执行开始后会清理前序拆章确认 checkpoint，工作台侧栏可跟随真实章节执行阶段。

当前进度口径：

- 执行面隔离第一版：约 `75%`。
- 自动导演 Runtime MVP：约 `85%`。
- 完整统一运行时：约 `70%`。

下一轮优先收口：

- 确认 SQLite 在开发态和桌面态默认启用 `WAL + synchronous=NORMAL + busy_timeout`，并保留显式诊断开关。
- 确认运行态持久化按 delta 写入，不再每次 mutation 全量删除重建 steps/events/artifacts，也不继续把完整 runtime 塞回任务 seed payload。
- 确认自动导演运行中前端只轮询轻量 projection；完整业务资产只在用户可见工作区、任务完成或等待确认时按边界刷新。
- 把候选确认、标题修复等旧入口迁到可序列化 command，避免旧式后台调度绕过 Worker。
- 用真实 Prisma 数据抽样验证旧项目接管、重启恢复、章节批次恢复、取消后重试和标题修复失败后的主流程状态隔离。
