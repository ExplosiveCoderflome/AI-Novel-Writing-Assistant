# 结构化调用诊断

`structuredEvidence.ts` 从响应块和 SDK 异常链提取可观察证据，不读取错误文案猜测根因。错误链只保留受限 name/code/status，缺失结束原因和 token 用量保持 null。

`StructuredDiagnosticStore.ts` 持久化有 taskId 的创作意图、短篇参考抽取和 `novel.short_story.*` 调用。一次 invoke 的生成、格式修复、策略降级及备用模型共享 invocationId，各请求有独立 attempt 和用量；修复用量不伪装成原请求用量。PromptRunner 将后续业务校验失败标记到原尝试。

默认诊断不保存提示词、正文、思考文本、密钥、端点或原始异常消息。相同范围的专用 repair debug log 同样删去内容和堆栈；此规则不声称替换其他模块的历史日志或用户主动打开的 AI 实况。

写入失败不应中断生成；成功结果不返回历史失败摘要。异常退出未完成的行只能在任务已失败时作为未完成证据展示，不能据此宣布模型超时。平台提供限流等待信息，业务模块仍决定用户可执行的恢复动作。

诊断不调整模型推理参数、预算上限或供应商能力声明。参见 [诊断流程](../../../../../docs/wiki/debugging/short-story-structured-failures.md)。
