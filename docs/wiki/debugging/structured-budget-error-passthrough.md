# 结构化调用里的预算错误必须保持类型

## Background

章节生产内核在每次真实模型请求前通过 `claimModelRequest` / `beforeRequest`
向章节预算预留额度。预留被拒时，`reserve` 返回 false，请求适配层抛出
`ProductionBudgetExceededError`（消息为“本次调用预算不足，需从作品页确认后继续。”），
且该错误证明了请求没有发给模型。`runKernelRequestScope` 会把它转为
`ProductionBudgetNotDispatchedError`，`unitExecutor` 再据此产出
`budget_exhausted` 结果，界面于是显示“本章可用额度不足，请从创作页面调整额度后继续”，
并提供追加额度后继续的恢复路径。

## Failure Mode

`ProductionBudgetExceededError` 的消息里写的是“预算不足”，而
`classifyStructuredOutputFailure` 的模型不可用模式只认“额度不足”等措辞，
因此预算错误会落入默认的 `transport_error` 桶。结构化调用层曾经把所有错误
（包括预算错误）包成 `StructuredOutputError`，导致：

- 预算错误在到达 `runKernelRequestScope` 之前就丢失了类型，无法转为
  `ProductionBudgetNotDispatchedError`；
- 单元执行器只能产出 `unknown` 结果，运行以“本章写作结果尚未确认”的
  unknown-claims 暂停收尾，而不是预算暂停，用户看不到追加额度的入口；
- transport 重试层还会对这次“transport_error”再试一次，而预算作用域里
  的 `unsafe` 状态已被锁死，重试在 1 毫秒内以同样的错误失败，白白消耗一次
  恢复预算。

一次真实复现：验收评估的语义重试在预算预留处被拒，两次调用分别在 29 毫秒
和 1 毫秒内失败，均未留下用量记录（请求从未发出），运行停在 accept 阶段。

## Current Rule

`server/src/llm/structuredInvoke.ts` 的两个 catch 位点（单次尝试与策略链）
必须原样重抛 `ProductionBudgetExceededError` 及其子类，不得分类、不得包成
`StructuredOutputError`。预算错误不是结构化输出失败，不参与策略降级，
也不参与 transport 重试。

新增的调用层 wrapper 必须遵守同一条规则：任何在 `claimModelRequest`
之前或之中抛出的类型化预算错误，都要原样上浮到生产内核。

## Related Modules

- `server/src/llm/structuredInvoke.ts`（两个 catch 位点的重抛）
- `server/src/llm/structuredOutput.ts`（`classifyStructuredOutputFailure` 的默认桶）
- `server/src/app/director/productionKernel/execution/requestScope.ts`（转为 NotDispatched）
- `server/src/modules/production/application/unitExecutor.ts`（`budget_exhausted` 结果）
- `server/src/platform/llm/retries/RequestBudget.ts`（`claimModelRequest`）
- 回归测试：`server/tests/structuredBudgetErrorPassthrough.test.js`
