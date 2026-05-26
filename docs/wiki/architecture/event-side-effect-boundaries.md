# 事件副作用边界

## Background

小说生产链会在章节定稿、卷规划更新、流水线完成等节点发出领域事件。这些事件用于通知其他模块有事实发生，但事件本身不是可靠任务系统。如果在事件 handler 中直接执行角色动力学重算、快照创建、RAG 重索引等耗时副作用，主流程会被隐藏阻塞，并且进程重启后无法恢复未完成工作。

## Decision

`novelEventBus` 只承担进程内轻量通知职责。任何可能耗时、需要重试、需要恢复或可能影响多个数据表的副作用，都必须写入持久队列，由后台 worker 执行。

当前队列分工：

- `RagIndexJob` 是 RAG 索引专用队列，只处理知识分块、向量写入、删除和重建。
- `NovelSideEffectJob` 是小说领域副作用队列，处理角色动力学同步、卷规划触发的角色动力学重建、流水线完成快照等非 RAG 任务。
- `EventBus` handler 只允许做快速事实判断、幂等键计算和入队，不允许直接调用重副作用服务。

## Current Rule

`NovelSideEffectJob` 使用收紧状态机：

- `pending -> running -> succeeded`
- `pending -> running -> failed`
- `failed -> running -> succeeded`
- `failed -> running -> failed`
- `running -> dead`

`failed` 表示可重试等待态，必须带 `runAfter`。`dead` 表示达到最大尝试次数或 payload 不兼容后的终态失败。状态更新必须带当前状态条件，worker 领取任务必须使用原子条件更新，避免并发 worker 同时执行同一任务。

重试策略必须使用指数退避、抖动和上限，避免同一故障恢复时形成雪崩重试。

## Idempotency Windows

幂等键必须表达“同一个语义任务”，不能为了绕过去重随意拼接当前时间。

- 章节草稿角色同步：同一 `chapterId`、章节 `updatedAt` 与正文 hash 相同，视为同一同步任务；正文或章节更新时间变化，必须生成新任务。
- 卷规划角色重建：幂等键来自影响角色卷职责和章节规划语义的字段指纹，包括卷顺序、卷摘要、主承诺、关键章节规划和角色卷分配。无关更新时间不应单独生成新任务。
- 流水线完成快照：同一 pipeline `jobId` 只能创建一次自动里程碑快照。

## Failure Modes

- 事件 handler 入队失败：由 `EventBus` 记录错误；主流程不能在 handler 内补跑重副作用。
- Worker 执行失败：任务进入 `failed`，按退避时间重试；达到 `maxAttempts` 后进入 `dead`。
- 服务重启：启动时将过期 `running` 任务恢复为可重试 `failed`，由 worker 继续处理。
- Payload 版本不兼容：任务进入 `dead`，需要开发者按 payloadVersion 编写迁移或补偿逻辑。

## Related Modules

- `server/src/events/EventBus.ts`
- `server/src/events/handlers/registerNovelEventHandlers.ts`
- `server/src/events/sideEffects/`
- `server/src/services/rag/RagIndexService.ts`
- `server/src/services/rag/RagWorker.ts`

