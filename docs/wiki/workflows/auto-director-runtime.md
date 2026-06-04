# 自动导演 Runtime 与恢复边界

## 背景

自动导演承担从灵感、开书、规划、角色准备、卷章规划到章节执行的主链路。历史问题集中在三个方向：Web API 被长任务拖死、继续/恢复/接管入口语义不统一、任务状态和运行时状态多源推断。

这些问题不能靠减少前端轮询、延迟 toast 或禁用按钮解决。根因是自动导演执行面和 Web API 控制面必须隔离，运行状态必须能从事实源投影出来。

## 决策

自动导演采用控制面和执行面分离：

```text
用户动作
  -> Web API command route
  -> DirectorRunCommand / WorkflowTask queued
  -> Director Worker lease
  -> DirectorPipelineEngine / Step Module
  -> PolicyEngine
  -> Artifact Ledger / DirectorEvent
  -> Runtime Projection
  -> 前端轻量查询
```

Web API 只接收命令和返回轻量投影；Worker 负责执行重型生产链路；运行状态从 `DirectorRun / DirectorStepRun / DirectorArtifact / DirectorEvent` 等事实源生成。

## 当前规则

- API route 不直接 `await` 自动导演长任务、章节生成、卷拆章、质量修复或 LLM 生产链路。
- 高优先级硬约束：自动导演不是第二套章节生成系统。控制面可以有导演专属 command、projection 和审批策略，但正文生成与正文修复的业务执行链必须与手动单章和批量执行共用同一套 runtime。
- 继续、恢复、重试、接管、审批、取消等用户动作先转为 command，不各自维护独立业务流程。
- `DirectorRunCommand` 表达控制面命令、租约和幂等，不表达业务完成事实。
- `DirectorRun` 是书级导演运行的根状态，`DirectorStepRun` 是步骤执行记录，`DirectorEvent` 和 `DirectorArtifact` 用于投影和恢复。
- StepModule 应声明输入、输出、产物、进度检查和恢复策略；Pipeline 只编排，不直接知道具体业务表和 Prompt 细节。
- StepModule 的只读事实检查必须能用 `novelId` 独立运行。`taskId`、run、command、artifacts 和 projection hints 属于自动导演扩展上下文，不能成为 `inspectReadiness`、`inspectCompletion`、`inspectProgress` 的必需条件；没有导演任务时应返回基于小说事实的最小状态。
- 手动章节生成和手动章节修复也应先进入 StepModule，再由步骤内部委托统一章节 runtime。路由可以保留 SSE 协议和用户入口差异，但不能再直接绕过 `chapter.draft.write` 或 `chapter.draft.repair` 形成第二套执行路径。
- StepModule 核心运行时的依赖必须通过显式依赖包或默认装配函数进入，不允许在构造函数中用动态 `require()` 临时拉取服务。默认装配可以继续使用现有服务实例，但依赖关系必须在模块边界可读、可替换、可测试。
- 自动导演顺序调度应发生在编排器 / StepModule 层；章节批量执行器 `NovelDirectorAutoExecutionRuntime.runFromReady()` 当前仍是 `chapter.draft.write` 的执行实现之一，不能直接反调同一个步骤，否则会形成递归执行。后续若要把章节批量执行也拆成纯步骤调度，必须先把“启动/恢复 pipeline job”抽成低层端口，再让调度器只遍历步骤计划。
- Projection 面向 UI，只返回阶段、阻塞原因、下一步、可恢复范围等轻量状态，不返回完整大对象。
- 前端必须区分完整驾驶舱快照和轻量运行投影。完整快照包含 `displayState.steps`、近期事件、事实体检和里程碑，适合进度弹窗；轻量投影只表达当前运行摘要，适合导航栏和任务中心高频轮询。两者不能共用 React Query key，否则轮询会用轻量响应覆盖完整快照，导致弹窗步骤视图退化。
- 自动导演 UI 主状态必须由 `DirectorDashboardView` 统一裁决。`DirectorRuntimeProjection`、事实体检、章节进度和工作区摘要都是材料层；它们可以提供诊断、风险和最近事件，但不能在前端各自决定主 badge、主进度、主按钮或是否等待确认。
- `DirectorDashboardView` 必须携带 `sourceTrace` 和 `progressSource`，让调试者能看到主状态和主进度来自 task、worker、checkpoint、chapter facts 还是 runtime projection。当前端需要显示驾驶舱、进度弹窗、任务中心、任务抽屉或小说页接管提示时，应优先读取这个最终展示模型。书级自动化投影可以继续暴露旧字段做兼容，但这些字段应由 `DirectorDashboardView` 派生，而不是重新裁决主状态。
- 工作流提醒、章节标题提醒、缺资源风险和 stale artifact 只能作为诊断或辅助操作展示；当 `DirectorDashboardView.mode` 是 `running` 或 `queued` 时，这些提醒不得把主容器、主 badge 或主按钮改成等待确认。
- 服务重启后不静默续跑长任务，应从真实产物断点判断可恢复范围，再由用户或策略确认继续。
- 自动导演驱动章节生产时，只能通过 `novelService.startPipelineJob(...)` 或 `resumePipelineJob(...)` 进入统一章节执行主链；导演侧不得直接调用 writer、patch repair、heavy repair 或旧手动修文 service。
- 自动导演遇到章节质量失败时，只能复用统一质量修复规则：patch first，失败后最多一次 `heavy_repair`，再失败则登记质量债务或 recoverable failure 并继续后续章节。导演 runtime 不得再发明独立的“导演专用修文分支”。
- 自动导演进入下一章前必须服从章节生产链的 `final_content -> timeline_finalization -> next_chapter` 规则。导演可以决定继续、跳过或重规划，但不能绕过 `ChapterTimelineFinalizationService`。
- 自动导演的“跳过质量修复并继续”不是绕过时间线。达到修复预算上限或用户选择 `skip_quality_repair` 时，执行面必须先基于当前最佳正文提交 degraded timeline checkpoint，再登记质量债务并推进剩余章节。
- 自动导演不得在 director 内部补写时间线提交逻辑。stable/degraded timeline、`ChapterTimeAnchor`、hook 承接、checkpoint metadata 都属于统一章节 runtime，不属于导演专属恢复逻辑。
- 自动导演驱动章节生产时，章节 pipeline 的 LLM 用量必须写入导演用量遥测，并带上 `chapterId`。每章累计 token 超过硬预算时，运行时应打开 `usage_anomaly` 熔断并暂停后续自动执行，防止任务重启、质量循环或上下文膨胀继续放大消耗。
- 自动导演投影必须把 `terminalAction=defer_and_continue` 且非重规划的质量结果视为“已记录质量债务”，不能升级成 `action_required`、`error` 或“出错需处理”。这类质量债务只影响后续优化提示，不阻塞继续执行。
- 自动导演执行面只能把明确的 `stop_for_replan` / `replan_required` 接入重规划检查点。章节审核返回 `local_patch_plan`、`continue_with_warning`、`patchable_obligation_gap` 或修复后仍有可记录义务缺口时，应登记为质量债务或局部修复建议并继续剩余章节，不能因为 `recommended=true` 就写入 `replanAlertDetails`。
- `replan_required` 即使出现在全书自动成书或 AI 主驾自动执行中，也仍是阻塞检查点。运行时应停止在实际触发章节，并把摘要写成“已执行至第 N 章，后续需重规划”，不能把目标范围直接显示为已完成。
- `auto_execute_range` 是用户对当前章节执行范围的显式继续授权。恢复链路即使先回到结构化大纲或执行合同同步，也必须把该授权传入后续 Pipeline 的 `approveAutoExecutionScope`，并在结构化同步后主动进入章节执行节点；不能只依赖自动审批偏好，否则命令会成功结束但章节执行节点仍停在审批门。
- 现有项目接管没有显式 `autoExecutionPlan` 时，默认范围是“全书前置规划接管”，不是章节范围。`auto_to_ready` 从故事宏观规划或项目设定开始时应先补齐 Story Macro / Book Contract / 角色 / 卷战略 / 拆章，直到 `chapter_batch_ready` 再交接；只有用户显式选择章节范围或卷范围时，才应用章节范围 / 卷范围的入口限制。
- 现有项目接管的用户入口应优先呈现“系统推荐接续位置 + 资产保护说明 + 一键继续”。阶段选择、重跑当前步、范围执行、自动审批等属于高级控制，默认折叠。只有会覆盖或重建已有资产的动作才需要显式确认；普通 `continue_existing` 不应让用户先理解内部阶段卡片才能启动。
- 接管入口的进度体检应把“系统看到的资产”直接展示给用户，至少包含卷规划、拆章同步、章节细化、正文书写和质量进度。若 URL 或上下文携带 `workspaceTaskId` / `directorTaskId`，前端应并行读取该任务快照，并优先用任务真实阶段、当前章节和任务状态解释主按钮；任务快照读取失败时再退回小说资产体检，不能让慢体检阻塞弹窗打开。
- 接管入口只能把 `directorTaskId`、当前 active auto-director task 或 live auto-director projection 作为“当前导演任务”上下文。`workspaceTaskId` 属于普通编辑工作流 lane，不能传入接管弹窗参与“进入当前任务”判断；否则被本地收起但仍处于 `waiting_approval` 的手动流程会误导接管入口，以为存在可继续的自动导演任务。
- 书级自动化投影如果返回 `failed`、`blocked` 或 `waiting_recovery` 且包含 `latestTask.id`，前端必须把它视为当前需要处理的导演状态。即使 URL 没有 `directorTaskId`、active auto-director task 查询返回空，AI 驾驶舱、任务抽屉入口和恢复入口也要显示该投影，并在用户打开详情时把 `latestTask.id` 写入 `directorTaskId`。`completed` / `cancelled` 终态可以继续只在 URL 钉住时展示，避免旧任务反复打扰。
- 当接管入口能从任务快照或小说资产推断出下一章和章节总数时，默认入口可以提供“推进至第 N 章”的轻量选择。该选择必须生成显式 `chapter_range` 的 `autoExecutionPlan`，范围从当前待执行章开始，到用户选择的目标章结束；高级设置打开时仍以高级范围配置为准。
- 接管任务的 `downstreamReset` 元数据只表达“从接管点开始，后续旧资产需要重新校验”，不能覆盖任务已经推进到更后阶段的事实进度。UI 合成步骤状态时，应以当前运行阶段为边界，只把当前阶段及其后的 reset steps 显示为待推进；早于当前阶段的步骤应按任务进度或真实资产显示已完成。
- `chapter_batch_ready` 的质量提醒属于当前批次的继续门。用户点击“继续自动执行章节”后，`approveAutoExecutionScope` 应允许 AI 主驾跳过当前质量提醒并启动剩余章节。
- 章节范围自动执行的 StepModule 事实门控必须按本次授权范围裁剪章节进度。`chapter.draft.write`、`chapter.state.commit` 等范围内步骤只能校验当前 `autoExecution` / `autoExecutionPlan` 的章节区间，不能让范围外已有正文但缺状态提交的旧章节阻塞当前批次完成。
- `replan_required` 不是普通审核门。前端展示模式必须优先相信任务 checkpoint，而不能被 projection 的 `waiting_approval` 覆盖成普通“继续自动导演”；否则会发出 `resume` 命令，后端重读同一个重规划结果后原样写回，表现为命令成功但没有新的章节执行。
- `skip_quality_repair` 是用户显式选择“先跳过本次质量 / 重规划建议并继续”的控制命令。执行面必须把实际触发质量问题且已经生成正文的章节登记到 `qualityDebtSummaries`，再继续剩余章节范围；不能把风险当成已修复，也不能丢弃后续质量回收所需的章节、原因和时间信息。
- 质量债来源必须来自明确的 pipeline job 章节范围或已持久化章节事实，不能从 `nextChapterId` / `nextChapterOrder` 推断。`nextChapter*` 只表示下一章待执行游标，不表示当前质量问题来源；空正文、仅有执行合同或仅有任务单的章节不得进入 `skippedChapterIds`、`skippedChapterOrders`、`qualityDebtChapterIds` 或 `qualityDebtChapterOrders`。
- 自动导演 projection 必须优先相信任务 checkpoint。任务已经处于 `waiting_approval` 且存在 checkpoint 时，应屏蔽陈旧的 `DirectorStepRun.running`，否则 UI 会把等待处理的质量门显示成仍在执行。
- 自动导演展示态也必须反向保护真实运行态。任务已经处于 `running` 且存在当前推进标签、当前 item 或实时进度时，应屏蔽陈旧的 `waiting_approval` / `requiresUserAction` 投影；否则驾驶舱会把正在细化、写作或审校的任务误显示成“等待确认”，并露出无效确认按钮。
- 自动导演执行详情、AI 驾驶舱和进度弹窗必须共享同一条细粒度运行标签优先级：章节 pipeline 的 `currentItemLabel` / runtime projection `currentLabel` 高于 StepModule 的节点级 `DirectorStepRun.label`。`DirectorStepRun.label` 只能作为缺少任务标签时的兜底，不能把“正在自动审校第 N 章”覆盖成“执行章节生成批次”。
- 自动导演投影应携带章节质量根因：`rootCauseCode`、`blockingObligations`、`qualityDebtSummary` 和 `qualityBudgetSummary`。执行详情优先用这些字段解释“缺了什么、系统已处理到哪一步、下一步会怎么继续”，而不是把所有章节执行问题显示成通用失败。
- 角色准备阶段的 `character_setup_required` 是可恢复检查点，不是失败。若角色阵容候选已经生成但质量闸要求用户确认，StepModule 应把它识别为 acceptable pause：任务状态停在 `waiting_approval`，候选保留给用户审核或应用，不能再用“正式角色数为 0”把 `character.cast.prepare` 升级成失败。只有在没有正式角色、没有可用候选、也没有可恢复检查点时，才应视为角色准备失败。
- 角色阵容“应用”分为核心落库和增强补齐两层。核心落库必须同步完成角色、关系和阵容状态，保证用户立即能继续角色资产工作；外显资料补齐和角色动态投影属于增强补齐。自动导演内部链路默认等待增强补齐，以免后续卷策略或结构化大纲读取到不完整动态；用户在角色准备页手动应用阵容时可以先返回核心落库结果，再用轻量提示告知增强补齐会在后台继续。
- 角色阵容质量闸不得用正则、关键词表、固定文本片段或字符比例判断身份承接、隐藏真相、题材理解、语言质量或角色职责。这些创作语义必须交给 AI-first 结构化理解、PromptAsset、semantic retry 或 AI 评估链路。确定性闸门只能检查结构契约，例如是否存在 protagonist、gender、必填字段和可恢复检查点。

## 示例

推荐做法：

- `continue` 请求只创建或复用 active command，立即返回 command id、task id 和轻量状态。
- Worker lease 后调用统一 Pipeline，由 StepModule 组装输入、执行、验证输出并提交产物。
- 前端任务中心读取 runtime projection，而不是高频拉取完整 volumes、seed payload 或候选批次。

禁止做法：

- 在 route 里直接调用 `runDirectorPipeline`、`generateVolumes`、`chapterExecution` 或质量修复。
- 用 `setImmediate`、`void Promise` 或 fire-and-forget 在 Web API 进程中伪装后台任务。
- 让旧 task status 直接决定 runtime completion。
- 在 `director/` 内部新增直接写正文、直接 patch repair 或直接 full rewrite 的实现，把自动导演演变成旁路写作系统。
- 在核心运行时构造函数中继续堆叠动态 `require()`，导致依赖边界只能靠运行时碰撞发现。

## 失败模式

- 点击继续后普通查询接口一起挂起：优先检查是否有重型执行仍在 API 进程内运行。
- 点击“继续自动执行章节”后 toast 成功但没有新的 LLM 请求：优先检查 command 是否已成功执行但 `chapter_execution_node` 仍是 `waiting_approval`，以及 `auto_execute_range` 是否在恢复分支或质量提醒分支丢失了 `approveAutoExecutionScope`。
- 点击 `replan_required` 状态的“继续自动导演”后没有新 LLM 请求：检查 UI 是否把重规划检查点误判成普通 waiting；正确入口应是质量修复 / 重规划处理，或显式 `skip_quality_repair` 后登记质量待回收并继续剩余章节。
- 点击 `skip_quality_repair` 后直接越过空章节：检查质量债是否错误绑定到 `nextChapterOrder`。正确状态应把质量债绑定到刚完成并触发质量提醒的章节，状态重算后最早空正文章节仍应留在 `remainingChapterOrders` 首位。
- 跳过质量修复后下一章脱节：检查跳过前是否写入 `timeline_finalization/degraded` checkpoint，以及当前章节是否已有 `ChapterTimeAnchor`。如果没有，说明执行面把跳过误当成直接进入下一章。
- 单章 token 异常飙升：检查 `DirectorLlmUsageRecord.metadataJson.chapterId` 是否完整、`usage_anomaly` 熔断是否记录了触发章节，以及是否存在重复门禁、重复章节合同或 timeline 上下文膨胀。
- 章节范围任务停在 `chapter.state.commit facts are not complete yet`：先比较任务范围内和整本书的 `draftedChapterCount / committedChapterCount`。如果范围内已齐但整本书仍有旧章节缺 `StoryStateSnapshot` 或 `CanonicalStateVersion`，说明事实门控没有按 `autoExecution` / `autoExecutionPlan` 裁剪章节进度，应修 StepModule 的 scoped progress，而不是补写无关章节来绕过。
- 执行详情仍只显示 `chapter.draft.write 未满足其完成标准`：检查章节 runtime package 是否已经写入 `failureClassification`，以及 `quality_loop_assessed` 事件是否把 `rootCauseCode` 和 `blockingObligations` 投影到前端。
- 执行详情显示 `character.cast.prepare 未满足其完成标准`：先检查任务是否已有 `character_setup_required` 检查点和 `CharacterCastOption` 候选。如果候选存在，应修复 acceptable pause 或任务投影，而不是要求重新生成整条主链；如果候选不存在，再检查角色生成 Prompt、结构化输出和持久化路径。
- UI 显示失败但任务已重新排队：检查 projection 是否仍把旧 task status 当事实源。
- 小说实际存在失败导演任务但 AI 驾驶舱显示空闲：先检查当前 URL 是否只有 `workspaceTaskId` 而没有 `directorTaskId`，再查 `book-automation` 投影是否已经返回 `projection.status=failed` 和 `latestTask.id`。如果投影有失败任务但侧栏仍隐藏，说明前端把未钉住的失败投影当成历史终态过滤了；正确行为是显示失败投影，并让“查看失败原因”跳转到带 `directorTaskId` 的任务详情。
- 服务重启后假 running：检查租约过期、active step、command 状态和产物断点是否统一投影。
- 重复点击继续产生多条执行链：检查 command 幂等键和 active command 复用。

不能用前端禁用按钮或降低轮询频率掩盖执行面阻塞。

## 相关模块

- `server/src/services/novel/director/DirectorCommandService.ts`
- `server/src/services/novel/director/DirectorCommandExecutor.ts`
- `server/src/services/novel/director/DirectorCommandInterpreter.ts`
- `server/src/services/novel/director/directorSubsystem.ts`
- `server/src/services/novel/director/runtime/`
- `server/src/services/novel/director/workflowStepRuntime/`
- `server/src/workers/`
- `client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx`
- `client/src/pages/tasks/TaskCenterPage.tsx`

## 来源文档

- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [Novel Director 子系统](../../../server/src/services/novel/director/README.md)
- [README 当前能力说明](../../../README.md)
