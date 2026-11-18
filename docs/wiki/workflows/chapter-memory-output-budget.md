# 章节与记忆调用输出额度

## Background

章节合同需要一次返回执行目标、任务单和场景卡等多个结构化字段。调用端若再固定一个低于模型路由的 `maxTokens`，会把用户配置的路由额度静默压低，导致 JSON 在合同完成前被截断。

## Current Rule

- 章节执行合同生成不在调用点设置固定 `maxTokens`，由 LLM factory 按 `planner` 路由、自动默认额度及端点输出上限解析有效请求额度。
- 调用者显式传入的请求预算仍表示调用者意图；已知端点能力作为硬上限。不要用一个隐含的常量覆盖用户配置。
- 自动导演生产内核的已冻结任务预算仍由 `TaskOutputBudget` AsyncLocalStorage scope 控制；移除普通入口的固定预算不改变已冻结任务的恢复语义。
- 章节记忆和原生结构纠错共用 fact_extraction 路由解析后的模型输出额度与兼容安全上限。调用端不另行固定更小的额度，以免完整抽取及纠错被截断。较小的用户配置仍需生效；无法通过完整校验的输出不能成为已保存记忆。

## Failure Modes

- 在章节合同服务中添加固定 `maxTokens` 会覆盖 planner 路由，即使路由配置更高也无效。
- 直接移除 frozen task budget scope 或修改其 key/快照会改变生产内核的恢复约束；预算变更必须保留原快照契约。

## Related Modules

- `server/src/services/novel/volume/chapterDetail/chapterExecutionContractGeneration.ts`
- `server/src/llm/factory.ts`
- `server/src/platform/llm/execution/TaskOutputBudget.ts`
- 回归测试：`server/tests/production/planning/contractModelPorts.test.js`
