# LLM 流的并发配额与超时边界

## 背景

LLM 的 `stream()` 返回流句柄，只表示响应可以开始读取，不表示模型请求结束。并发配额或超时若只覆盖创建句柄的 Promise，会让仍在生成的请求脱离并发控制，也会让响应头后的正文停顿无限等待。该边界影响所有经 LLM factory 创建的模型客户端，包括章节生成和自动导演中的模型调用。

## 当前规则

- `requestLimiter.ts` 在调用底层 `stream()` 前取得配额，直到读取完成、读取异常、迭代提前退出、显式取消或调用方 abort 才释放。配额释放必须幂等。
- 流包装保留 `IterableReadableStream` 能力，支持异步迭代与 reader/cancel；不预读取正文，避免消费端停顿时在后台继续推动生成器。
- 提前退出或取消要同时取消底层请求并调用迭代器 `return()`。调用方 abort 在等待配额时应直接移除排队请求，在流已创建时应终止读取并清除监听。
- `batch()` 是多次 `this.invoke()` 的调度入口。只在各次 invoke 取得配额，不能在 batch 外再持有同一配额，否则并发为 1 时，batch 和内部 invoke 会互相等待。
- Anthropic `timeoutMs` 是从发起 HTTP 请求到完整消费响应体的总时限，不是响应头时限，也不是每个 token 的空闲时限。成功 JSON、错误响应文本和 SSE 正文都受同一时限约束。
- Anthropic 收到 `message_stop` 即完成协议读取并关闭 reader，无需继续等待连接 EOF；没有终止事件的截断响应仍报告异常。
- timer、调用方 abort listener 和 reader 由生命周期结束路径统一清理。已 abort 的 signal 不得发起 fetch；返回后尚未开始消费的流也必须能取消。

## 使用方责任与失败模式

拿到流的调用方必须消费它，或在不再需要时执行取消/return/abort。无超时、无 abort 且被直接遗弃的流无法由限速器推断为完成；配额会继续占用。不要以提前释放配额掩盖调用方未关闭流的问题。

如果自定义模型适配器在取消后既不响应 signal，也不结束正在等待的迭代器，清理可能继续等待。适配器必须把取消传播给网络读取；限速器不应自行假定物理请求已经结束。

定位“并发设为 1 仍有两条正文同时生成”时，先检查配额是否覆盖正文迭代；定位“HTTP 有响应但永远不结束”时，检查 timeout 是否被收到 headers 的 finally 提前清除。不要通过增加业务层超时或在章节调用点重复加锁修补共享适配器的生命周期错误。

## 关联模块与验证

- `server/src/llm/requestLimiter.ts`：共享并发配额、排队、流包装。
- `server/src/llm/anthropicClient.ts`：HTTP deadline、SSE、reader 和 signal 清理。
- `server/src/llm/factory.ts`：缓存、校验、用量、日志装饰后统一附加限速器。
- `server/tests/llmStreamLifecycle.test.js`：源码隔离的 fake stream/mock fetch 回归；不访问数据库或真实模型网络。
- [限速器实例淘汰](./llm-request-limiter-memory-leak.md)：配置变更与在途请求的区别。
