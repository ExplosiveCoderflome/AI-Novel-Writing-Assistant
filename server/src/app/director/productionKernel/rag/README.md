# 原生检索的持久执行边界

本目录属于 app 装配层。它将既有 HybridRetrievalService 的检索、embedding 和可选重排接入准备检查点及单章预算，不拥有检索排序或上下文组装规则。

`sources` 只读取有效配置、准确 provider/model 窗口及知识分块版本。端点以摘要参与身份，不保存凭据。原生准备先检查集合维度与 payload 索引；不可用时返回知识库来源页，不创建或修补索引。

`runtime` 捕获配置副本。检索序号、查询、选项和来源摘要组成检查点输入；配置或来源变化时拒绝复用旧结果。每次实际 HTTP 重试及拆分保存独立输入、领取和结果，完整批次输入使用 UTF-8 字节保守预约。窗口按每条 embedding 文本或 query/document 对检查，未知窗口拒发。

已保存的物理结果允许重建外层上下文；未知远端结果保留领取及额度，恢复读取不能重新发送。明确未发送的额度拒绝可在显式追加后继续。已经发生的用量即使失权也记账，随后围栏阻止上下文发布。原生兼容捕获不能吞掉范围内的保护失败。

`services/rag/execution` 提供并发隔离的执行端口；普通旧调用保留原实现。这里不修改冻结的 GenerationContextAssembler，也不使用全局 monkey patch。

验证位置：`tests/production/productionKernelRagSqlite.test.js`、`tests/production/productionKernelCompositionSqlite.test.js`、`tests/ragExecutionScope.test.js`。临时库和传输替身证明持久合同，不代替真实页面生成验收。
