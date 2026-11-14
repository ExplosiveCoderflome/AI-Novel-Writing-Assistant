# 400/422 拒绝要降级结构化模式，而不是原样重试

## Background

结构化调用链按档案里的 `structuredModes` 依次尝试
json_schema、json_object、tool_calling、prompt_json。某次尝试失败后，
`implicatesStructuredMode` 决定这次失败是否说明“该模式本身不被接受”：
是则把该模式记入 `failedModes` 并换下一种策略，否则按传输错误重试。

## Failure Mode

部分模型服务对严格 schema 返回光秃秃的
`400 inference request is invalid`：消息里没有 response_format 字样，
错误对象上也没有 status 字段。旧逻辑只认消息里的 response_format /
json_schema 等措辞，于是这次 400 被当成普通传输错误：策略链原地中断，
transport 重试层又因为拿不到 httpStatus 而对同一个被拒的 schema 再试一次，
两次都撞墙后运行暂停。resume 后还是同一条路，死循环。

一次真实复现：商汤 sensenova-6.8-flash-lite 接受小 schema 的 json_schema，
但拒绝 12 字段的章节执行合同 schema（嵌套对象字段一多就拒，与思考开关、
流式、strict、default、enum 均无关）。探测用的小 schema 测不出这一点，
档案记成“支持 json_schema”，导演运行在合同步骤上被 400 卡住。

## Current Rule

- `implicatesStructuredMode`：httpStatus 为 400/422，或消息以 400/422 开头、
  或消息含 `status code 400/422` 时，视为模式失败（与探测侧把 400/422 记为
  模式失败的口径一致）。401/403/429 与网络、超时、预算类失败原因仍优先排除。
- `classifyResponseEvidence`：错误对象上没有 status 字段时，从消息开头或
  `status code NNN` 中回收 httpStatus，让重试层不再对 4xx 盲目重试。

## Related Modules

- `server/src/llm/compatibility/adapter.ts`（`implicatesStructuredMode`）
- `server/src/platform/llm/diagnostics/structuredEvidence.ts`（`classifyResponseEvidence`）
- `server/src/llm/structuredInvoke.ts`（策略链与 transport 重试）
- `server/src/llm/compatibility/probe.ts`（探测侧的 400/422 口径）
- 回归测试：`server/tests/structured400ModeFallback.test.js`
