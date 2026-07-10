# 角色资源账本工作流

## Background

角色资源账本服务于章节生产链路，记录会影响后续行动边界、伏笔兑现、资源归属和信息可见性的关键资源。它不是普通道具清单，也不是待办列表；只有跨章复用、影响冲突、绑定伏笔或改变角色可行动性的资源变化才应进入账本。

## Current Rule

- 写作上下文必须区分两类信息：`highRiskCommittedItems` 表示已经入账但带有高风险信号的资源；`pendingProposalItems` 表示尚未确认的 `StateChangeProposal`。
- 已入账高风险资源可以被写作模型引用，但只能作为谨慎使用的事实约束；模型不得基于它新增不可逆的持有、可见性或消耗变化。
- 待确认 proposal 不能当作已经发生的事实注入正文。用户或自动导演确认后，必须通过统一 proposal commit 链路进入账本、版本快照和事件历史。
- 章节写作前的资源上下文应按本章参与角色裁剪；只有参与角色持有/拥有的资源，或已经进入当前章节使用窗口的非参与角色资源，才应进入 prompt。
- 长期未触碰或超过预计使用窗口的可用、隐藏、借用资源应被标记为 `stale`，同时写入 `stale_marked` 事件和 `resource_stale` 风险信号。该状态是章节级质量债，不自动阻断全书自动导演。

## Failure Modes

- 不要把已入账高风险资源命名为“待确认”；否则前端可确认 proposal 与写作 prompt 中的“待确认资源”会变成两个不同集合。
- 不要在手动确认路由中直接调用账本 upsert；这会绕过 canonical snapshot、`committedVersionId` 和依赖状态提交历史的投影。
- 不要只依赖模型自报 riskLevel 判断资源冲突。提交前必须比对同一 `resourceKey` 的现有 holder、owner、不可逆状态和可见性，冲突时升级为人工确认。
- 不要把 stale 检测做成一次性 prompt 文案；stale 是账本状态和事件历史的一部分，后续章节、前端和恢复链路都需要看到同一事实。

## Related Modules

- `CharacterResourceLedgerService`：账本读取、写作上下文构造和提交后的 ledger/event 写入。
- `StateCommitService`：proposal 校验、冲突 cross-check、统一提交、版本快照。
- `GenerationContextAssembler`：根据章节计划参与角色裁剪资源上下文。
- `ChapterArtifactDeltaService`：章节稳定后的资产回灌和 stale 扫描触发点。
