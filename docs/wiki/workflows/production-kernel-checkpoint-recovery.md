# 生产内核检查点恢复：已知失败与未知结果

## 背景

生产内核（长篇正文生产）用检查点（`ChapterArtifactSyncCheckpoint`）为每一步模型调用和业务写入做认领：调用前认领、成功后写回成功、失败时按性质处理。恢复时只读已成功的检查点，绝不重复派发未知结果的模型请求——因为不知道第一次调用到底执行了没有。

## 决策

区分“已知失败”和“未知结果”：

- 已知失败：模型已经返回，但输出无法使用。包括结构化输出分类 `malformed_json` / `schema_mismatch` / `incomplete_json` / `thinking_pollution` / `unsupported_native_json`，以及语义校验拒绝 `post_validate_failed`（输出已完整收到，业务校验拒绝，例如资源变化缺少证据）。模型侧端口在这类调用里没有任何持久写入，重试是安全的。
- 未知结果：传输失败（`transport_error`）、`llm_error`、进程崩溃、租约失效等，无法确认模型是否执行、是否写入。必须保持认领状态，绝不重试。

## 当前规则

- 抽取（reconcile 的 `modelStep`）与准备（preparation 的 `steps.model`）遇到已知失败时：释放认领（状态回到 `ready`），由上层按 `pending` 处理，显式执行时重新认领并再次调用。
- 遇到未知结果时：认领保持 `running`，恢复返回 `unknown`，等待人工处理；同一 key 的后续恢复绝不重新派发。
- 预算拒绝（未派发）同样释放认领，行为不变。
- 准备阶段的模型请求 key 包含轮次反馈摘要（asset + ordinal + feedback 摘要）：同一 ordinal 在恢复时带上不同 guidance 时走新 key，不会与已保存的旧请求快照冲突，也不会误读旧的缓存结果；相同请求仍命中同一 key，缓存复用不变。
- 准备阶段的请求快照比对保持严格：除反馈外的任何差异（资产版本、服务商/模型、基础提示词）仍抛 `ProductionSnapshotConflictError`。

## 失败模式

- 抽取一次返回不可解析内容后章节永久卡死（旧行为）：`malformed_json` 被当成未知结果，认领永久停在 `running`，恢复恒为 `unknown`。
- 抽取的语义校验拒绝同样卡死（旧行为）：`post_validate_failed` 只在准备阶段释放认领，抽取阶段仍返回 `unknown`。
- 准备阶段恢复时请求身份冲突（旧行为）：恢复后 ordinal 从 0 重启，带新反馈的重建请求与缓存的 ordinal-0 请求逐字节比对不一致，冲突永真。
- 把 `transport_error` 当成已知失败重试：可能重复执行一次已经执行过的模型调用，消耗额度且结果不一致。
- 把已知失败的认领标记为 `failed` 而不是释放：`failed` 行在 `recoverOnly` 下仍返回 `unknown`，恢复依旧走不通；必须回到 `ready` 才能被显式执行重新认领。

## 相关模块

- `server/src/modules/production/common/structuredErrors.ts`（`isRetryableModelOutputError`）
- `server/src/modules/production/infrastructure/storyState/reconciliation.ts`（`modelStep`）
- `server/src/modules/production/infrastructure/preparation/steps.ts`（`steps.model`）
- `server/src/app/director/productionKernel/preparation/modelRequests.ts`（key 与反馈摘要）
- `server/src/modules/production/infrastructure/checkpoints/store.ts`（`claim`/`fail`/`release`）
