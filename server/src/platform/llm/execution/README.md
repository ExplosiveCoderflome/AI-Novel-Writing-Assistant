# 模型执行范围

ExecutionSignal 传播当前执行的取消；LLMExecutionScope 绑定结构化备用配置、实际模型身份和完整物理请求围栏。保护失败锁存，底层兼容捕获不能将其清除后返回成功。

TaskOutputBudget 提供调用方拥有的 provider/model/taskType 输出额度范围。没有安装范围的调用保持原请求参数；安装范围后，原生服务内的历史默认 maxTokens 由已捕获的任务额度替换，仍经过提供方协议约束与上下文预检。范围并发隔离，未知模型/任务拒绝发送，调用方修改原数组不能扩大许可。

配置捕获通过 withoutLlmTaskOutputBudgets 读取真实设置，避免把某个执行阶段的额度误当作全局配置漂移。它只用于配置读取，不授权模型发送；实际调用仍受 LLMExecutionScope 的身份与输入检查。新内核在 describe/execute/recover 的整个异步调用链安装同一范围，不能只改预检描述而让实际 SDK 使用旧值。
