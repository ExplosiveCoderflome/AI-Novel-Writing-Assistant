# Payoff Ledger 来源与同步合同

## Background

Payoff Ledger 负责跨章承诺、伏笔、推进窗口和兑现状态。它不是新的故事规划器，也不负责记录已经发生的所有事实；它将 Book Contract、Story Macro、卷开放回报、章节回报引用和正文观测等既有来源收敛成唯一账本。

如果书级承诺只进入章节写作上下文而没有进入 Payoff Ledger，系统会出现两套事实：writer 知道第 3/10/30 章要交付什么，但后续规划、审校和连续性读取无法稳定追踪这些承诺。

## Decision

Book Contract 的 `chapter3Payoff / chapter10Payoff / chapter30Payoff` 是 Payoff Ledger 的稳定书级来源。它们通过固定 `refId` 和目标窗口进入现有 AI 同步 Prompt：

| refId | 目标窗口 |
| --- | --- |
| `book_contract.chapter3Payoff` | 1–3 章 |
| `book_contract.chapter10Payoff` | 4–10 章 |
| `book_contract.chapter30Payoff` | 11–30 章 |

固定窗口是对 Book Contract 结构化字段的确定性投影。语义去重、账项合并、当前状态和兑现证据判断仍由注册 Prompt 的结构化 AI 输出负责。

## Current Rule

- 每个非空 Book Contract 阶段回报都必须在 AI 输出的某个账项中保留固定来源引用。
- Book Contract 来源使用现有 `major_payoff` 类型，`refId` 用于区分来源，不增加数据库枚举或迁移。
- 合并后的账项必须保持 `book` scope，且截止章不得晚于 Book Contract 的承诺章。
- AI 输出遗漏固定来源或放宽截止窗口时，`postValidate` 必须失败并进入 semantic retry；不得由代码静默伪造账项。
- Book Contract 保存时只比较三个阶段回报。格式化空白变化不触发同步，语义文本变化通过持久副作用队列触发同步。
- 同步任务使用现有 `NovelSideEffectJob` 的幂等、租约、重试和 dead 状态，不在保存请求中等待 LLM。
- 同步失败时保留上次成功账本和 stale 风险信号，不删除已有内容。

## Ownership Boundaries

- Book Contract：定义整本书在关键早期节点向读者交付什么。
- Payoff Ledger：追踪这些承诺及其他伏笔的来源、窗口、推进和兑现状态。
- Reader Experience Contract：把当前章应承担的回报转换为正文可见的欲望、阻力、转折、净变化和钩子责任。
- Novel Fact Ledger：只记录正文验收或观测确认后已经发生的不可逆事实。
- Replan：只有结构化 AI/runtime 决策明确要求重排邻近章节时才进入；普通待兑现或局部逾期先作为章节义务或质量债处理。

## Compatibility

本规则不增加数据库列。旧账本没有 Book Contract 来源引用时仍可读取，并会在下一次相关同步中由 AI 重新归并。旧 Prompt 调用缺少 `bookContractPayoffs` 输入时按空来源处理，避免历史预览或恢复路径崩溃。

## Failure Modes

- **Book Contract 已修改但账本不变**：检查 `book-contract:updated` 是否带有 `payoffChanged=true`，以及 `payoff.bookContractSync` 副作用任务状态。
- **同一承诺出现多个账项**：检查固定 `refId` 是否原样保留，以及账本身份归并是否复用未完成的同名项。
- **AI 漏掉阶段承诺**：检查 Prompt 版本、Registry 版本和 `postValidate` 的固定来源覆盖校验。
- **保存 Book Contract 很慢**：同步不应在保存请求中直接调用 LLM；检查是否绕过持久副作用队列。
- **普通逾期阻断整本写作**：检查是否错误把局部 payoff 风险直接升级成全局 replan。

## Related Modules

- `server/src/services/payoff/sources/bookContractPayoffSources.ts`
- `server/src/services/payoff/PayoffLedgerSyncService.ts`
- `server/src/prompting/prompts/payoff/payoffLedgerSync.prompts.ts`
- `server/src/events/handlers/registerNovelEventHandlers.ts`
- `server/src/events/sideEffects/NovelSideEffectJobHandlers.ts`
- `server/src/services/novel/BookContractService.ts`

## Source Documents

- `docs/plans/payoff-ledger-foundation-phase-two.md`
- `docs/wiki/workflows/reader-experience-contract.md`
- `docs/wiki/workflows/novel-fact-ledger.md`
