# 模型路由的“结构化格式”对显式指定模型的调用同样生效

## Background

模型路由（/settings/model-routes）允许按创作任务指定模型与“结构化格式”
（auto / json_schema / json_object / tool_calling / prompt_json）。
`resolveAttemptTarget` 在结构化调用前解析路由偏好，再由策略链把偏好
排在首位。

## Failure Mode

路由偏好曾经只在调用方没有指定 provider 和 model 时才解析。
导演每次调用都带 launchInput 里显式的 provider/model，于是路由偏好
恒被跳过：设置页上把 planner 路由改成 prompt_json 后，导演运行
日志里仍然是 json_schema。用户在设置页看到的开关与主流程的实际行为
不一致，且没有任何提示。

## Current Rule

`resolveAttemptTarget` 只要调用方没有显式指定结构化策略，就解析
路由偏好；路由的身份（provider/model）与解析后的调用身份一致时，
路由格式成为首选策略；身份不一致时路由不生效；调用方显式指定的
策略永远优先于路由。

注意工厂层（`resolveLLMClientOptions`）也会把路由格式并入 options，
但那只影响返回的选项元数据，不决定策略链的实际策略：真正决定
首选策略的是这里的 `preferredStrategy`。

## Related Modules

- `server/src/llm/structuredInvoke.ts`（`resolveAttemptTarget`）
- `server/src/llm/modelRouter.ts`（`resolveModel`、`toStructuredOutputStrategy`）
- 回归测试：`server/tests/structuredRouteFormatExplicitModel.test.js`
