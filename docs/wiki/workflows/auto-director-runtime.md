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
- 继续、恢复、重试、接管、审批、取消等用户动作先转为 command，不各自维护独立业务流程。
- `DirectorRunCommand` 表达控制面命令、租约和幂等，不表达业务完成事实。
- `DirectorRun` 是书级导演运行的根状态，`DirectorStepRun` 是步骤执行记录，`DirectorEvent` 和 `DirectorArtifact` 用于投影和恢复。
- StepModule 应声明输入、输出、产物、进度检查和恢复策略；Pipeline 只编排，不直接知道具体业务表和 Prompt 细节。
- Projection 面向 UI，只返回阶段、阻塞原因、下一步、可恢复范围等轻量状态，不返回完整大对象。
- 服务重启后不静默续跑长任务，应从真实产物断点判断可恢复范围，再由用户或策略确认继续。
- `auto_execute_range` 是用户对当前章节执行范围的显式继续授权。恢复链路即使先回到结构化大纲或执行合同同步，也必须把该授权传入后续 Pipeline 的 `approveAutoExecutionScope`，并在结构化同步后主动进入章节执行节点；不能只依赖自动审批偏好，否则命令会成功结束但章节执行节点仍停在审批门。

## 示例

推荐做法：

- `continue` 请求只创建或复用 active command，立即返回 command id、task id 和轻量状态。
- Worker lease 后调用统一 Pipeline，由 StepModule 组装输入、执行、验证输出并提交产物。
- 前端任务中心读取 runtime projection，而不是高频拉取完整 volumes、seed payload 或候选批次。

禁止做法：

- 在 route 里直接调用 `runDirectorPipeline`、`generateVolumes`、`chapterExecution` 或质量修复。
- 用 `setImmediate`、`void Promise` 或 fire-and-forget 在 Web API 进程中伪装后台任务。
- 让旧 task status 直接决定 runtime completion。

## 失败模式

- 点击继续后普通查询接口一起挂起：优先检查是否有重型执行仍在 API 进程内运行。
- 点击“继续自动执行章节”后 toast 成功但没有新的 LLM 请求：优先检查 command 是否已成功执行但 `chapter_execution_node` 仍是 `waiting_approval`，以及 `auto_execute_range` 是否在恢复分支丢失了 `approveAutoExecutionScope`。
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
