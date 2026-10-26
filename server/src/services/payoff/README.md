# 伏笔账本读取与同步

getPayoffLedger 的普通调用保留原有 syncIfMissing 行为。正式正文准备属于读取范围：`withPayoffLedgerReadScope` 在当前异步调用链内禁止空账本触发 syncLedger，等价于已有 syncIfMissing:false 参数。

这个范围不把空账本伪造为已同步，不修改冻结的上下文组装器，也不影响并发旧调用。实际抽取和账本提交由 production 的 reconcile 检查点与事务消费者负责。读取失败继续传播，不能把失败当作空账本成功。

验证见 `tests/payoffLedgerReadScope.test.js` 和开启 RAG、空账本的原生入口临时库联测。
