# LLM 实况执行与任务可见性

## Background

小说规划、章节生成和修复常在模型完整返回后才出现页面变化。长输出期间，用户无法区分任务仍在生成、正在校验，还是已经失去响应。

## Decision

LLM 调用采用“服务端消费流 + 全局创作实况订阅”的双轨方式：服务端持续读取模型流并累积完整结果；前端从所有页面都可打开的顶部“AI 实况”订阅临时事件。流结束后，调用方继续执行既有的结构化解析、语义校验、修复、业务应用和持久化流程。

## Current Rule

1. 已注册 Prompt 的文本和结构化调用必须优先使用模型 `stream`，不得因为页面未订阅而退回一次性 `invoke`。
2. 服务端是流的唯一消费者。浏览器仅订阅事件；页面关闭、切换任务或 SSE 断开不能中断后台任务。
3. 实况事件只表达过程：`requesting`、`streaming`、`validating`、`repairing`、`completed`、`failed` 等。它们不替代统一任务状态。
4. `output_delta` 是未校验预览。只有原有校验、修复和保存链路完成后的结果才可进入小说资产、章节正文或任务成功状态。
5. 结构化输出进入 JSON 修复时，沿用同一会话并显示 `repairing`；不能在修复阶段重新创建无关联的前端流。
6. 顶部“AI 实况”默认订阅当前服务中的生成会话，也可按 `taskId`、交互 ID 过滤；完成后短期保留，以支持面板重连后的快照恢复；不作为长期日志或内容存储。
7. 任务中心是运行记录与恢复查询入口，不是正常创作时的实时进度入口。不要要求用户为了确认 AI 是否仍在生成而离开当前页面。

## Failure Modes

- SSE 断开：只影响可视化订阅，服务端继续消费模型流和执行后续逻辑。
- 模型流失败：会话发出失败事件，原调用仍按既有错误处理和任务恢复规则处理。
- 结构化预览看似完整但校验失败：界面必须显示“正在检查/正在修复”，不得把预览误标为已保存正文。
- 无任务上下文的内部调用：仍可使用流式执行；全局实况面板可以显示该会话，但不应把它伪装成可恢复的业务任务。

## Related Modules

- `server/src/platform/llm/live/`：会话代理、事件契约和 SSE。
- `server/src/llm/structuredInvoke.ts`：结构化流、校验与修复衔接。
- `server/src/prompting/core/promptRunner.ts`：注册 Prompt 的文本/结构化执行入口。
- `client/src/hooks/useLlmLiveFeed.ts`：SSE 消费与批量状态更新。
- `client/src/components/liveExecution/LiveExecutionDialog.tsx`：所有页面均可打开的用户可见实况入口。
