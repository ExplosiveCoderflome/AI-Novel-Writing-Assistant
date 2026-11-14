# 未探测的自定义端点不发送猜测的思考开关

## Background

结构化调用要求模型不思考（`requiresNonThinkingForStructured`），
工厂层会按档案里的 `thinkingToggle` 生成关闭思考的线上参数
（`thinking` / `enable_thinking` / `thinking_boolean` /
`reasoning_effort`）。档案分三档：内建默认值（按厂商/模型名识别）、
探测结论、用户手动覆盖。

## Current Rule

- 对从未探测过的自定义端点，内建档案的思考开关是 `control: "none"`、
  `supported: false`，工厂层不发送任何思考参数。这是 deliberate 的保守
  姿态：往未知端点猜发参数可能被严格 API 以 400 拒绝，而策略降级换的是
  结构化格式、不会去掉该参数，猜错会造成所有策略一起失败。
- 探测是唯一安全的发现手段：探测会逐个尝试各开关并验证思考输出是否
  真的消失。自动探测默认关闭（`autoProbeEnabled` 需用户按厂商打开），
  这条 opt-in 边界由回归测试钉住，改默认需产品决策，不得擅自翻转。
- 因此 `reasoningForcedOff` 标志只记录“已请求关闭”，不保证线上有参数；
  对无开关的端点，模型仍可能思考并烧光输出预算，失败分类为
  `reasoning_budget_exhausted`。
- 失败文案必须给得出路：`summarizeStructuredOutputFailure` 在
  `requiresNonThinkingForStructured` 为真且 `supportsReasoningToggle`
  为假时，提示用户先做一次兼容探测，而不是只说“关闭深度思考”。

## Related Modules

- `server/src/llm/compatibility/defaults.ts`（内建档案）
- `server/src/llm/compatibility/probe.ts`（探测与 opt-in）
- `server/src/llm/compatibility/adapter.ts`（`thinkingControlKwargs`）
- `server/src/llm/factory.ts`（`shouldForceDisableReasoning`）
- `server/src/llm/structuredInvoke.ts`（`summarizeStructuredOutputFailure`）
- 回归测试：`server/tests/structuredReasoningExhaustedProbeHint.test.js`
