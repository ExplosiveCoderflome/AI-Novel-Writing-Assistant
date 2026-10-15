# 小说事件装配边界

业务发布事件使用 `events/publisher`，它只暴露事件总线和类型；业务入队使用 `events/sideEffects/queue`，它只暴露持久作业服务和契约。轻入口不能导入业务 handlers 或 worker。

`app.ts` 显式引入事件注册器和副作用 worker，负责启动装配。旧 `events/index.ts` 与 `sideEffects/index.ts` 保留兼容导出，新增发布方和入队方不能使用这些包含执行装配的宽入口。这样正文保存、账本写入等发布方不会因导入总线而反向加载整条生产链。

正文版本 hash、版本错误、连续性边界判断由 `runtime/artifactSync/contracts` 提供。读取这些确定性契约不应导入资产恢复和抽取编排。
