# 导演模式模块化与状态治理改造清单

更新日期：2026-05-05

本文基于当前 `beta` 分支代码、最近一轮导演模式 Worker / Command / Projection 改造，以及现有自动导演重构计划整理。它不是新的愿景文档，而是下一轮开发的收口清单：把“自动导演、继续执行、恢复、接管”统一收敛到同一个 Pipeline Engine，让步骤模块真正拥有输入、输出、进度检查和恢复契约。

## 1. 当前结论

根因分类：**Incomplete closure**。

最近版本已经完成了第一层基础设施改造：`DirectorRunCommand`、独立 Director Worker、运行时 projection、部分 `DirectorRun / DirectorStepRun / DirectorEvent / DirectorArtifact` 记录、`WorkflowStepModule` 描述符、NodeRunner / PolicyEngine 接入。这些改造解决了一部分“Web API 被长任务拖死”和“任务假运行”的问题。

但当前仍没有完成导演模式的核心闭环：

- 自动导演、继续执行、恢复、接管仍然带有各自流程语义，而不是统一 command 入口。
- `WorkflowStepModule` 目前更像步骤目录和契约描述，很多步骤没有自己的 `buildInput / inspectProgress / execute / validateOutput / commit / recover`。
- 步骤状态、任务状态、运行时命令状态、章节状态和 UI projection 仍然多源并存。
- 章节执行进度仍偏向运行时上报和固定百分比，不是基于章节产物、审稿结果、修复票据和状态提交的可重算进度。
- `DirectorRuntimeStore`、`NovelDirectorService`、`DirectorWorkspaceAnalyzer`、`novelDirectorAutoExecutionRuntime` 等文件仍然过长或职责偏混合，超过或接近项目架构阈值。

一句话：**执行面隔离已有第一版，步骤模块化只有半套，状态治理尚未闭合。**

## 2. 目标架构

目标不是再增加一条“继续执行链”或“恢复链”，而是统一为：

```text
User Command
  -> DirectorCommandInterpreter
  -> DirectorPipelineEngine
  -> DirectorStateReader
  -> StepModuleRegistry
  -> StepInputAssembler
  -> StepModule.execute(input)
  -> StepOutputValidator
  -> DirectorStateCommitter
  -> DirectorProjection
```

原则：

- **Command 只是意图**：`start / continue / resume / recover / takeover / approve / pause / cancel` 都只是命令。
- **Pipeline 只负责编排**：选择下一个模块、组装输入、执行、提交、推进，不写具体业务逻辑。
- **StepModule 才是能力**：每个步骤声明输入、输出、产物、进度检查、恢复策略。
- **State Machine 才是事实**：`DirectorRun + DirectorStepRun + DirectorArtifact + DirectorEvent` 是事实源。
- **Projection 只是显示**：任务中心、小说页、创作中枢只读 projection，不自己拼状态。

## 3. P0 改造清单

### P0-1 统一入口语义

目标：自动导演、继续、恢复、接管、重试、确认 gate 全部变成 command，不再各自拥有业务流程。

任务：

- [ ] 建立 `DirectorPipelineEngine.dispatch(command)` 作为唯一执行入口。
- [ ] 将 `continue / resume_from_checkpoint / retry / takeover / approve_gate` 收敛为同一套 command 解释语义。
- [ ] 禁止新入口直接调用旧 phase service、chapter pipeline、takeover runtime 或 `scheduleBackgroundRun`。
- [ ] 候选确认、标题修复等旧入口也要进入可序列化 command，避免留下同步准备和旧式后台调度。
- [ ] API route 只能写 command 或读 projection，不执行 LLM、章节生成、拆章、修复、接管分析。

完成标准：

- 所有重型导演动作都由 Worker lease 后执行。
- 重复点击继续或恢复只产生一个 active command。
- `continue` 不再根据旧任务状态空转成功。

### P0-2 做实 StepModule 契约

目标：步骤不只是 descriptor，而是拥有完整输入、检查、执行和恢复边界。

标准接口建议：

```ts
interface DirectorStepModule<Input, Output> {
  id: string;
  inspect(context): Promise<StepInspection>;
  buildInput(context): Promise<Input>;
  execute(input, runtime): Promise<Output>;
  validateOutput(output, context): Promise<StepValidation>;
  commit(output, context): Promise<StepCommitResult>;
  inspectProgress(context): Promise<StepProgress>;
  recover(context): Promise<StepRecoveryPlan>;
}
```

任务：

- [ ] 把当前 `WorkflowStepModule` 从“描述符”升级为“可执行模块契约”。
- [ ] 为每个步骤补齐 `buildInput`，禁止不同入口各自拼 prompt input。
- [ ] 为每个步骤补齐 `inspectProgress`，允许服务重启后从产物重算进度。
- [ ] 为每个步骤补齐 `completeCriteria`，不能只依赖 `recordStepCompleted`。
- [ ] 修复 `chapter_repair` 和 `quality_repair` 复用同一个 step id 导致无法独立表达的设计。
- [ ] 新增模块必须先注册 StepModule、PromptAsset、Artifact 类型和 Context Resolver，再接入 pipeline。

完成标准：

- `story.macro.plan`、`book.contract.create`、`chapter.task_sheet.plan`、`chapter.draft.write` 至少各有真实模块实现。
- Pipeline 只调用模块契约，不知道具体业务表和 prompt 细节。
- 任意步骤失败后，可以通过 `inspectProgress` 判断是未开始、部分完成、已完成、可恢复还是需要人工确认。

### P0-3 建立唯一状态事实源

目标：结束 `NovelWorkflowTask`、`DirectorRunCommand`、runtime instance、step run、chapter state 多源互相猜测的状态混乱。

任务：

- [ ] 明确 `DirectorRun` 为书级导演运行的唯一根状态。
- [ ] 明确 `DirectorStepRun` 为步骤执行记录，不承载书级完成语义。
- [ ] `DirectorRunCommand` 只表达控制面命令和 lease，不表达业务完成。
- [ ] `NovelWorkflowTask` 降级为兼容任务中心的外层 projection，不再承载真实业务状态。
- [ ] 章节状态只表达章节本身，不反向决定整个导演运行是否完成。
- [ ] 移除或收口 `runtimeStatusForTaskStatus` 这类把任务状态直接映射为 runtime 状态的逻辑。
- [ ] `ensureRuntimeInstance` 不得仅按 `novelId` 重绑不同任务的运行实例，必须有明确 run identity。

完成标准：

- 任何 UI 状态都能追溯到 `DirectorRun / StepRun / Event / Artifact`。
- 不再需要通过多个 projection 优先级猜“到底是在运行、等待审批、失败还是已完成”。
- 服务重启、Worker stale、任务中心重试之后不会出现假 running。

### P0-4 章节执行进度矩阵

目标：章节执行不再只是 `generating_chapters / reviewing / repairing` 粗阶段，而是可检查、可恢复、可解释的章节 x 子阶段矩阵。

建议矩阵：

```text
chapter.execution
  execution_contract_ready
  context_package_ready
  draft_started
  draft_saved
  audit_completed
  repair_completed_or_not_needed
  runtime_package_saved
  chapter_artifacts_synced
  chapter_state_committed
  reviewable_or_approved
```

任务：

- [ ] 为每章建立 `ChapterExecutionProgress` 投影，不直接信任单个 progress 字段。
- [ ] 从章节内容、generationState、chapterStatus、audit report、repair ticket、artifact sync、state commit 推导子阶段。
- [ ] 把 `needs_repair` 视为可解释的局部状态，不等同于全书失败。
- [ ] 章节批量执行总进度由章节矩阵加权推导，而不是固定百分比。
- [ ] UI 显示当前章节、当前子阶段、已完成章节数、待修复章节数、可继续范围。

完成标准：

- 第 5 章审稿失败时，系统显示第 5 章需要修复，不冻结整本书。
- 第 6 章继续执行时，不重复创建第 5 章 pipeline job。
- 服务重启后能从最后成功章节和子阶段恢复，不重复覆盖正文。

### P0-5 Artifact Ledger 真相层收口

目标：产物成为模块之间通信的事实，而不是 seed payload、checkpoint 和业务表散落拼接。

任务：

- [ ] 为书约、宏观规划、角色治理、分卷策略、章节任务单、章节正文、审稿报告、修复票据、状态提交建立统一 artifact 类型。
- [ ] 每个 artifact 记录 source step、content hash、version、dependsOn、protectedUserContent、stale 状态。
- [ ] StepModule 只通过 `ArtifactReader` 读取上游产物，通过 `ArtifactWriter` 写入新产物。
- [ ] 用户手动编辑正文或核心设定时，对应 artifact 标记为 protected 或 new user version。
- [ ] Workspace Analyzer 基于 ledger 判断 missing / stale / protected / recoverable。

完成标准：

- 手动改主角动机后，系统能指出角色治理、卷目标和后续章节任务单需要复核。
- 手动润色正文后，系统不重做宏观规划，只建议审稿或同步连续性。
- 删除关键伏笔后，系统能指出影响的 payoff 和章节任务。

### P0-6 Progress 从上报改为自检

目标：进度不是 runtime 心跳写出来的百分比，而是步骤模块基于证据自检的结果。

任务：

- [ ] 保留 heartbeat 作为 UI 等待提示，但不得作为事实进度。
- [ ] 每个 StepModule 提供 `inspectProgress(context): StepProgress`。
- [ ] `StepProgress` 返回 `status / current / total / ratio / label / evidence / nextAction`。
- [ ] `DIRECTOR_PROGRESS` 固定百分比只作为旧 UI 兼容，不再作为核心进度来源。
- [ ] Projection 优先消费 `inspectProgress` 结果。

完成标准：

- 长 prompt 执行中，UI 能显示等待说明；服务重启后，进度能由产物重算。
- `book_contract` 这类固定百分比倒退或不动的问题不再影响真实进度判断。

### P0-7 Worker 与持久化二次收口

目标：完成执行面隔离后半段，避免 Worker 写锁和全量 runtime 回写继续拖垮控制面。

任务：

- [ ] 确认 SQLite 默认启用 `WAL + synchronous=NORMAL + busy_timeout`。
- [ ] Runtime 持久化改为 delta 写入，不在每次 mutation 全量重建 steps/events/artifacts。
- [ ] 不再把完整 runtime snapshot 塞回 `NovelWorkflowTask.seedPayloadJson`。
- [ ] Projection 查询保持轻量，不读取大体积 workspace、章节正文、prompt context。
- [ ] 真实 Prisma 抽样覆盖旧项目接管、重启恢复、章节批量恢复、取消后重试。

完成标准：

- Worker 运行长任务时 `/api/tasks/overview` 和 runtime projection 仍能响应。
- 前端运行态不再高频刷新完整 volumes/workspace。
- Worker 崩溃后 API 仍可打开任务中心和恢复面板。

## 4. P1 改造清单

### P1-1 Workspace Analyzer AI-first 收口

- [ ] 确定性 inventory 只负责列事实，不做产品级下一步判断。
- [ ] 下一步推荐、手动编辑影响、接管策略、恢复策略必须来自 AI 结构化输出。
- [ ] 确定性代码只做安全过滤、范围约束和结构化结果后处理。
- [ ] 为 `manualEditImpact / affectedArtifacts / minimalRepairPath / safeToContinue / requiresApproval` 建立 schema。

### P1-2 PolicyEngine 硬 gate

- [ ] 高成本 LLM 批量调用、大范围章节执行、覆盖用户内容、下游重算都必须过 PolicyEngine。
- [ ] `resume` 只放行当前匹配 gate 一次，不持久切换整条运行策略。
- [ ] `waiting_approval` 不属于 running，UI 到达 gate 后停止运行态轮询。

### P1-3 质量闭环模块化

- [ ] Reader Promise、Chapter Retention、Rolling Window Review、Character Governance、World Rule 使用统一 artifact 和 step contract。
- [ ] 审稿失败输出 affected scope、repair ticket、建议动作，不直接冻结全书。
- [ ] 自动修复默认最多一次，失败后进入人工修复或带风险继续。

### P1-4 创作中枢只调 Runtime API

- [ ] 创作中枢工具只调用 `analyze_director_workspace / get_director_run_status / run_director_next_step / run_director_until_gate / evaluate_manual_edit_impact` 等公开 API。
- [ ] 禁止创作中枢直接调用旧 phase service。
- [ ] 高风险动作进入统一 approval gate。

### P1-5 拆大文件和职责瘦身

当前超阈值或接近阈值的重点文件包括：

- `server/src/services/novel/director/novelDirectorTakeover.ts`
- `server/src/services/novel/director/novelDirectorAutoExecutionRuntime.ts`
- `server/src/services/novel/director/runtime/DirectorWorkspaceAnalyzer.ts`
- `server/src/services/novel/director/DirectorRuntimeExecutionService.ts`
- `server/src/services/novel/director/NovelDirectorService.ts`
- `server/src/services/novel/director/runtime/DirectorRuntimeStore.ts`
- `server/src/services/novel/director/DirectorCommandService.ts`
- `server/src/services/novel/director/runtime/DirectorEventProjectionService.ts`

任务：

- [ ] `NovelDirectorService` 收缩为 API facade，不再承载执行细节。
- [ ] `DirectorRuntimeStore` 拆成 step store、event store、artifact store、run store。
- [ ] `DirectorWorkspaceAnalyzer` 拆成 inventory、AI interpretation、impact analysis、recommendation。
- [ ] `AutoExecutionRuntime` 拆成 range resolver、chapter matrix runner、quality/repair bridge、projection bridge。
- [ ] `Takeover` 拆成 workspace analysis、attach run、downstream reset、resume plan。

## 5. P2 改造清单

- [ ] LangGraph 只作为低风险编排壳试点，不承载业务真相。
- [ ] 模型路由从 `planner / writer / review / repair` 粗粒度升级为步骤级路由。
- [ ] 新手入口收敛为“推荐下一步 + 高级手动入口”，减少流程参数暴露。
- [ ] 卷级工作台消费 Reader Promise、Payoff Ledger、Rolling Review 和 Replan 结果。
- [ ] Prompt Workbench 继续保持只读 catalog / preview，正式 override 另立治理方案。

## 6. 推荐实施顺序

1. **先统一 command -> pipeline engine**：不再新增入口分支。
2. **再做实 3-4 个核心 StepModule**：书约、宏观规划、章节任务单、章节正文执行。
3. **同时建立章节进度矩阵**：这是最能改善用户感知和恢复语义的切口。
4. **收口状态事实源**：把 `NovelWorkflowTask` 降级为 projection。
5. **Artifact Ledger 真相层落地**：支撑手动编辑影响和恢复。
6. **拆大文件**：避免继续在旧 service 上堆功能。
7. **补真实 Prisma 回归**：用数据链路证明恢复、继续、接管、章节执行不会互相污染。

## 7. 验收场景

必须覆盖：

- [ ] 一句话灵感新建小说，停在候选确认。
- [ ] 确认候选后，进入同一个 `DirectorRun`，生成书约、宏观规划、角色、分卷、章节任务单。
- [ ] 已有小说接管后，先分析已有产物，再推荐最小下一步。
- [ ] 用户修改主角动机后，系统给出受影响产物和最小修复路径。
- [ ] 用户润色第 3 章正文后，系统不重做宏观规划，只建议审稿或同步连续性。
- [ ] 第 5 章审稿失败后生成 repair ticket，不冻结整本书。
- [ ] 自动修复失败一次后进入人工修复或带风险继续。
- [ ] 服务重启后先显示可恢复状态，用户确认后从最后稳定 artifact 继续。
- [ ] 继续第 6 章时不重复创建第 5 章 pipeline job。
- [ ] Worker 长任务运行时任务中心和小说页 projection 仍可响应。
- [ ] 创作中枢询问“现在该做什么”时，基于 runtime snapshot 和 workspace analysis 回答。

## 8. 非目标

- 不做数据库 reset、truncate、drop 或 destructive migration。
- 不用关键词、正则、硬编码分支替代 AI 结构化判断。
- 不把 LangGraph 当作一次性主链重写方案。
- 不让 UI 直接读取内部 runtime 大对象。
- 不为了赶进度让新功能继续接入旧 `scheduleBackgroundRun` 或旧 phase service。

## 9. 一句话收口标准

导演模式的下一轮改造完成时，系统应该变成：

```text
一台统一状态机，驱动一组可检查、可恢复、可扩展的 AI Step Modules。
```

而不再是：

```text
多条入口流程，各自写状态，再由 projection 事后猜当前进度。
```
