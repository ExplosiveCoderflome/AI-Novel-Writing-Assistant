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
- 反馈摘要必须覆盖请求的完整有效输入，包括内嵌在输入里的上游候选（例如审校步内嵌的合同候选）和全部上下文块（前章结果块等）：上游结果合法重生成时，下游请求的 key 必须随之变化，否则新候选会被别名到旧请求快照、严格比对必然冲突。计算摘要前的规范化必须与提示渲染口径一致：上下文字段中的 `undefined` 按渲染时丢弃处理、循环引用打标，不得用会因 `undefined` 抛错的严格规范化。
- 章节预算预留的身份是请求本身（run + requestKey），token 数只是估算、不是身份：同一逻辑请求的阶段层预留与每次物理尝试（含结构修复轮）可以给出不同估算，预留额收敛为已见的最大值，差额部分仍须通过章节剩余额度检查；不得因估算漂移抛预留身份冲突。观测到真实用量后仍按实际用量结算（见 `chapterBudget.ts` 的 `observe`）。
- RAG 配置的冻结快照比对只在检索启用时执行：禁用时检索根本不运行，冻结配置中由环境派生的调优参数与当前环境不一致不构成冲突；启用时配置漂移仍必须拒绝（租约 fence 始终保留）。
- 发布与质量债务投影对已选验收评估做二次校验时，口径必须与流水线内部一致：复核块的绑定哈希为空表示「未绑定」，按未知处理并剔除，不得用更严的口径把整章判死。
- 未知结果的人工解除只有一条路径：普通恢复（resume）永不解除认领；只有当恢复命令携带按章的显式确认（`resolveUnknownClaims`，表示用户已在章节页面核对正文），且该章当前正文与已提交内容哈希一致时，才在命令事务内释放该章停在 `running` 的模型步认领（reconcile 的抽取/时间线/全量同步与 prepare 的模型请求），并清掉该单元的中断阶段标记，事件 `unknown_claims_resolved` 留痕。正文被改过、或该章没有待确认认领时拒绝执行。
- 写作/审校阶段（draft/accept/repair/verify）没有 `recover` 端口，也不写模型检查点：中断后唯一留下的证据是该单元的 `activeStage`/`activeRequestKey`。因此暂停读模型在这四个阶段有 activeStage 时同样产出 `unknownClaims`；prepare 只有在整章没有任何 prepare/reconcile 检查点（没有可复用的已存步骤）时才算同类孤儿；已有可恢复检查点时仍走普通恢复，不弹确认。显式确认在「没有匹配 checkpoint、但该章仍有上述 activeStage」时清空 activeStage/activeRequestKey。确认只清认领，不重新派发模型：确认后的下一次运行按正常决策重新 describe/execute。
- 普通 resume 仍不解除任何 activeStage，也不会自动重新派发 draft/accept/repair/verify；没有显式确认时读模型会持续把该章标为待确认，避免「静静砖死但界面无入口」。

## 失败模式

- 抽取一次返回不可解析内容后章节永久卡死（旧行为）：`malformed_json` 被当成未知结果，认领永久停在 `running`，恢复恒为 `unknown`。
- 抽取的语义校验拒绝同样卡死（旧行为）：`post_validate_failed` 只在准备阶段释放认领，抽取阶段仍返回 `unknown`。
- 准备阶段恢复时请求身份冲突（旧行为）：恢复后 ordinal 从 0 重启，带新反馈的重建请求与缓存的 ordinal-0 请求逐字节比对不一致，冲突永真。
- 把 `transport_error` 当成已知失败重试：可能重复执行一次已经执行过的模型调用，消耗额度且结果不一致。
- 把已知失败的认领标记为 `failed` 而不是释放：`failed` 行在 `recoverOnly` 下仍返回 `unknown`，恢复依旧走不通；必须回到 `ready` 才能被显式执行重新认领。
- 反馈摘要覆盖不全导致合法重生成被别名（2026-10-31 实测）：合同步因前章块漂移合法重生成新合同时，审校步摘要没算内嵌的合同候选，新候选被别名到旧合同的请求快照上，恢复时严格比对必抛冲突；触发条件是审校判合同修订又恰逢外部失败暂停（如余额不足），平时不出现。
- 预算估算漂移砖死重执行（2026-10-31 实测）：同一抽取步的输出估算两次执行相差 2 个 token（4563 → 4565），预留层按金额全等比对抛 `Kernel reservation identity changed`，且异常发生在调用内部、认领被按未知结果留下，形成二次砖死。
- 进程在模型步执行中退出：认领成为孤儿，暂停文案提示「返回章节页面检查后继续」，但普通继续不解除任何认领——解除只能走显式确认路径（见当前规则）；没有这条路径时该章永久卡死。
- 写作/审校阶段未知结果砖死（2026-11 修复前实测）：draft/accept/repair/verify 在 `execute` 抛传输错误或进程退出时，`unitExecutor` 保留 `activeStage` 并返回 `unknown`，映射为 `manual_recovery` 暂停。修前读模型只认 prepare/reconcile 的 checkpoint、显式确认又要求至少释放一条 checkpoint，于是暂停界面没有待确认入口、普通 resume 永久 `unknown`，该章永久卡死。修后上述阶段也进入 `unknownClaims`，显式确认可清空该单元的 activeStage/activeRequestKey，下一次运行重新决策。

## 相关模块

- `server/src/modules/production/common/structuredErrors.ts`（`isRetryableModelOutputError`）
- `server/src/modules/production/infrastructure/storyState/reconciliation.ts`（`modelStep`）
- `server/src/modules/production/infrastructure/preparation/steps.ts`（`steps.model`）
- `server/src/app/director/productionKernel/preparation/modelRequests.ts`（key 与反馈摘要）
- `server/src/modules/production/infrastructure/checkpoints/store.ts`（`claim`/`fail`/`release`）
- `server/src/app/director/productionKernel/execution/chapterBudget.ts`（预留身份与估算收敛）
- `server/src/app/director/productionKernel/recovery/commands.ts`（显式恢复事务、未决认领确认）
- `server/src/app/director/productionKernel/rag/runtime.ts`（冻结配置比对）
- `server/src/modules/production/infrastructure/lifecycle/selectedAssessment.ts`（已选评估的统一解析口径）
