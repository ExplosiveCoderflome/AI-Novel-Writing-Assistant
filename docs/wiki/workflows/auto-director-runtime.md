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
- 服务重启后不静默续跑长任务，应从真实产物断点判断可恢复范围，再由用户或策略确认继续。
- 自动导演驱动章节生产时，只能通过 `novelService.startPipelineJob(...)` 或 `resumePipelineJob(...)` 进入统一章节执行主链；导演侧不得直接调用 writer、patch repair、heavy repair 或旧手动修文 service。
- 自动导演遇到章节质量失败时，只能复用统一质量修复规则：patch first，失败后最多一次 `heavy_repair`，再失败则登记质量债务或 recoverable failure 并继续后续章节。导演 runtime 不得再发明独立的“导演专用修文分支”。
- 自动导演进入下一章前必须服从章节生产链的 `final_content -> timeline_finalization -> next_chapter` 规则。导演可以决定继续、跳过或重规划，但不能绕过 `ChapterTimelineFinalizationService`。
- 自动导演的“跳过质量修复并继续”不是绕过时间线。达到修复预算上限或用户选择 `skip_quality_repair` 时，执行面必须先基于当前最佳正文提交 degraded timeline checkpoint，再登记质量债务并推进剩余章节。
- 自动导演不得在 director 内部补写时间线提交逻辑。stable/degraded timeline、`ChapterTimeAnchor`、hook 承接、checkpoint metadata 都属于统一章节 runtime，不属于导演专属恢复逻辑。
- 自动导演投影必须把 `terminalAction=defer_and_continue` 且非重规划的质量结果视为“已记录质量债务”，不能升级成 `action_required`、`error` 或“出错需处理”。这类质量债务只影响后续优化提示，不阻塞继续执行。
- `replan_required` 即使出现在全书自动成书或 AI 主驾自动执行中，也仍是阻塞检查点。运行时应停止在实际触发章节，并把摘要写成“已执行至第 N 章，后续需重规划”，不能把目标范围直接显示为已完成。
- `auto_execute_range` 是用户对当前章节执行范围的显式继续授权。恢复链路即使先回到结构化大纲或执行合同同步，也必须把该授权传入后续 Pipeline 的 `approveAutoExecutionScope`，并在结构化同步后主动进入章节执行节点；不能只依赖自动审批偏好，否则命令会成功结束但章节执行节点仍停在审批门。
- `chapter_batch_ready` 的质量提醒属于当前批次的继续门。用户点击“继续自动执行章节”后，`approveAutoExecutionScope` 应允许 AI 主驾跳过当前质量提醒并启动剩余章节。
- `replan_required` 不是普通审核门。前端展示模式必须优先相信任务 checkpoint，而不能被 projection 的 `waiting_approval` 覆盖成普通“继续自动导演”；否则会发出 `resume` 命令，后端重读同一个重规划结果后原样写回，表现为命令成功但没有新的章节执行。
- `skip_quality_repair` 是用户显式选择“先跳过本次质量 / 重规划建议并继续”的控制命令。执行面必须把实际触发质量问题且已经生成正文的章节登记到 `qualityDebtSummaries`，再继续剩余章节范围；不能把风险当成已修复，也不能丢弃后续质量回收所需的章节、原因和时间信息。
- 质量债来源必须来自明确的 pipeline job 章节范围或已持久化章节事实，不能从 `nextChapterId` / `nextChapterOrder` 推断。`nextChapter*` 只表示下一章待执行游标，不表示当前质量问题来源；空正文、仅有执行合同或仅有任务单的章节不得进入 `skippedChapterIds`、`skippedChapterOrders`、`qualityDebtChapterIds` 或 `qualityDebtChapterOrders`。
- 自动导演 projection 必须优先相信任务 checkpoint。任务已经处于 `waiting_approval` 且存在 checkpoint 时，应屏蔽陈旧的 `DirectorStepRun.running`，否则 UI 会把等待处理的质量门显示成仍在执行。
- 自动导演投影应携带章节质量根因：`rootCauseCode`、`blockingObligations`、`qualityDebtSummary` 和 `qualityBudgetSummary`。执行详情优先用这些字段解释“缺了什么、系统已处理到哪一步、下一步会怎么继续”，而不是把所有章节执行问题显示成通用失败。
- 角色准备阶段的 `character_setup_required` 是可恢复检查点，不是失败。若角色阵容候选已经生成但质量闸要求用户确认，StepModule 应把它识别为 acceptable pause：任务状态停在 `waiting_approval`，候选保留给用户审核或应用，不能再用“正式角色数为 0”把 `character.cast.prepare` 升级成失败。只有在没有正式角色、没有可用候选、也没有可恢复检查点时，才应视为角色准备失败。
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
- 执行详情仍只显示 `chapter.draft.write 未满足其完成标准`：检查章节 runtime package 是否已经写入 `failureClassification`，以及 `quality_loop_assessed` 事件是否把 `rootCauseCode` 和 `blockingObligations` 投影到前端。
- 执行详情显示 `character.cast.prepare 未满足其完成标准`：先检查任务是否已有 `character_setup_required` 检查点和 `CharacterCastOption` 候选。如果候选存在，应修复 acceptable pause 或任务投影，而不是要求重新生成整条主链；如果候选不存在，再检查角色生成 Prompt、结构化输出和持久化路径。
- UI 显示失败但任务已重新排队：检查 projection 是否仍把旧 task status 当事实源。
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
