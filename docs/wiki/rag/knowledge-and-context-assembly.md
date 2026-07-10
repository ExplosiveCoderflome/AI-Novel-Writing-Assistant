# 知识库与上下文组装

## 背景

长篇小说生产需要长期记忆：世界观、角色、拆书结果、知识库文档、写法资产、章节历史和连续性状态都可能影响后续规划与正文。早期如果每个模块各自上传、索引、检索或拼接上下文，会造成重复向量化、检索范围不一致和 prompt 输入不可审计。

知识库和 Context Broker 的目标是让资料成为可复用资产，并让每次 AI 调用明确知道自己使用了哪些上下文、丢弃了哪些上下文、为什么丢弃。

## 决策

知识库文档是长期资料资产，不是一次性上传输入。RAG 检索、绑定资料和上下文组装应通过统一服务和 Context Resolver 处理，Prompt 模板不直接查数据库。

默认检索规则遵循“显式选择优先、绑定资料次之、全局启用文档兜底”，同时保留业务实体自身的内部上下文。若业务调用显式限定 `ownerTypes`，检索服务必须尊重该范围；未包含 `knowledge_document` 时，不得自动混入知识库文档。

## 当前规则

- `知识库` 是向量化资料的独立管理入口，负责文档、版本、索引任务、健康状态和 Embedding/RAG 配置。
- 上传资料应形成 `KnowledgeDocument` 和版本概念；在线检索只针对当前激活版本。
- 归档知识文档是可恢复状态，不删除 `KnowledgeDocumentVersion` 原文；归档会移出默认检索、资料选择和拆书入口，并排队清理已有分块。
- 归档文档恢复启用时必须排队重建索引。只有恢复后的重建任务成功，召回测试和 RAG 检索才应重新使用该文档。
- 小说或世界观存在绑定知识文档时，相关生成链路优先使用绑定文档。
- 用户显式传入 `knowledgeDocumentIds` 时，只检索这些文档。
- 没有显式选择且没有绑定时，可搜索所有启用知识库文档。
- 业务调用显式传入 `ownerTypes` 时，`ownerTypes` 是硬范围。只有未传 `ownerTypes`、显式包含 `knowledge_document`，或显式传入 `knowledgeDocumentIds` 时，知识库文档才参与检索。
- 小说/世界观自身的 RAG 内容仍保留，并与知识库检索结果融合排序。
- 拆书发布文档可以携带结构化预分块 `preChunks`。这些分块必须把 `structuredData` 里的题材、卖点、目标读者、优势、短板、人物功能和章节锚点转成统一 facet，字段名只能使用 `genreTags / sellingPointTags / targetReaders / strengths / weaknesses / characterRole / chapterAnchor`。
- `KnowledgeChunk.metadataJson` 记录 facet 和 anchor 原始结构；`KnowledgeChunk.facetKeys` 记录可过滤的 `|key=value|` 文本；`KnowledgeChunk.chapterAnchor` 记录章节序号字符串。Qdrant payload 与本地 chunk 元数据必须使用同一组 facet 字段名，避免向量过滤和关键词过滤分叉。
- 下游需要按拆书维度精确召回时，应优先调用 `HybridRetrievalService.retrieveByFacet({ query, facets, ...scope })`，而不是在各业务服务里手写 `facetKeys` 过滤条件。facet 命中为空时，检索服务保留无 facet 回退，避免历史 chunk 因缺少 facet 而完全不可召回。
- `HybridRetrievalService.retrieve({ facets })` 应同时把 facet 过滤传给向量检索和关键词检索。老 chunk 没有 facet 时，带 facet 的检索可能为空；此时必须回退到无 facet 过滤的召回，保证旧资料不会被完全屏蔽。
- RAG 召回应按采样率写入 `RagRetrievalTrace`，用于后续诊断召回质量。trace 只保存 query digest、按配置截断的 query preview、检索范围、候选数量、最终 hits 摘要、各阶段耗时和 fallback / reranker 标记；hits 只能保存 chunkId、rank、score、owner，不保存 chunk 正文。
- 召回 trace 的 query 持久化由 `RAG_RETRIEVAL_TRACE_QUERY_PERSIST_MODE` 控制，生产环境可切到 `digest_only` 降低原文泄露风险。采样率由 `RAG_RETRIEVAL_TRACE_SAMPLE_RATE` 控制，保留周期由 `RAG_RETRIEVAL_TRACE_RETENTION_DAYS` 控制，过期数据由 `RagRetrievalTraceRetention` 清理。
- RAG 检索顺序是：向量召回与关键词召回并行、RRF 融合、可选 reranker 重排、可选叙事距离衰减、截取 finalTopK。reranker 只能是增强阶段，不能成为基础召回的硬依赖；外部 endpoint 超时或失败时必须 fail-open，继续使用融合结果。
- reranker 默认关闭，启用条件由 `RAG_RERANKER_ENABLED`、`RAG_RERANKER_ENDPOINT`、`RAG_RERANKER_MODEL`、`RAG_RERANKER_TIMEOUT_MS` 和候选数量配置控制。默认候选数量按 `min(max(finalTopK * 5, 30), 80)` 计算，避免把所有候选都送入交叉编码器。
- reranker trace 必须记录 `rerankerUsed`、`rerankerMs`、输入候选数、输出候选数和失败摘要。`rerankerUsed=false` 只能说明本次未使用或 fail-open，不能直接解释为基础检索失败。
- 上下文化检索默认关闭。开启后，索引阶段为每个 chunk 生成 `contextPrefix`，并构造 `searchText = contextPrefix + chunkText` 用于 embedding；原始 `chunkText` 仍作为返回正文和用户可读证据。
- `contextPrefix` 必须通过 Prompt Registry 中的结构化 prompt 生成，RAG service 不得内联业务 prompt。前缀只补足小说、世界、章节、角色、知识文档标题、事实类型等检索定位信息，不得添加输入资料中不存在的新剧情事实。
- 第一版上下文化信息不改数据库表结构：`contextPrefix / contextVersion / contextSourceHash / searchText` 写入 Qdrant payload，并同步放入 `KnowledgeChunk.metadataJson`。关键词检索可在 `chunkText` 与 `metadataJson` 中查找查询词；启用上下文化后需要重建索引才会生效。
- RAG 质量改动必须有固定评测集做前后对比。评测至少覆盖角色事实、世界规则、章节连续性、风格设定和知识文档五类查询，输出 Hit@K、MRR、Context Precision、Context Recall 和 reranker 平均耗时。
- Prompt 模板只声明需要哪些上下文；Context Broker / Resolver 负责读取、预算、过滤、摘要和组装。
- RAG 与上下文组装的失败要在 preview 或 trace 中可解释，不能静默丢 required context。

## 示例

推荐做法：

- 世界观向导允许直传 txt，也允许选择已有知识库文档；创建后把选择写入世界绑定。
- 小说生成时读取小说绑定知识文档、内部世界观和章节历史，再按预算组装上下文块。
- Prompt Preview 展示选中块、丢弃块、缺失 required group 和 resolver error。

禁止做法：

- 每个生成服务单独拼“如果有文档就搜文档，否则搜全局”的规则。
- PromptAsset 的 `render()` 内直接查数据库。
- 上传同一资料后让多个模块各自保存一份不可追踪文本。

## 失败模式

- 检索结果不符合当前小说：检查是否有显式文档筛选或小说/世界绑定覆盖了全局默认。
- 世界观分层生成混入无关小说文档：检查调用方是否只需要 `world` / `world_library_item`，以及 RAG 服务是否错误忽略了显式 `ownerTypes` 范围。
- Prompt 输入过大：检查 Context Broker 的预算、摘要和 dropped block 记录。
- 知识库健康正常但生成没引用资料：检查 resolver 是否接入当前 workflow、prompt 是否声明 context requirement。
- 旧版本内容仍被检索：检查激活版本和 chunk rebuild 是否对齐。
- 归档文档恢复后无法召回：检查恢复动作是否把索引状态置为 `queued`，以及对应重建任务是否成功完成。
- facet 检索完全无结果：先检查发布时的 `preChunks` 是否进入 RAG job payload，再检查 `KnowledgeChunk.facetKeys` 和 Qdrant payload 是否都写入同一 facet 字段；如果是历史 chunk 没有 facet，应确认检索服务触发无 facet 回退。
- 拆书发布后结构化结论召回不准：检查 `bookAnalysis.publish.facets` 的字段映射是否把结构化字段映射到正确 facet，不要在消费方临时发明新的 facet 名。
- 召回质量难以复盘：检查 `RAG_RETRIEVAL_TRACE_SAMPLE_RATE` 是否为 0、`RagRetrievalTrace` 是否有近期记录、`timingsJson` 是否包含 vector / keyword / fusion / reranker / decay / total 六项，以及 facet 命中为空时 `fallbackTriggered` 是否写为 true。
- trace 中 `rerankerMs` 恒为 0、`rerankerUsed` 恒为 false：检查 reranker 是否启用、endpoint 是否为空、候选是否为空；如果 `scopeJson.rerankerError` 有值，说明本次已按 fail-open 使用融合结果。
- 开启上下文化后召回没有变化：检查索引是否已重建、Qdrant payload 是否含 `contextPrefix/searchText`、`KnowledgeChunk.metadataJson` 是否含相同字段，以及 `contextVersion` 是否与当前配置一致。
- 上下文前缀引入错误事实：检查 `rag.contextual_chunk.prefix@v1` 的 prompt 输出和输入 metadata，前缀只能归纳定位，不能新增设定；必要时提高评测集中对应查询的覆盖。
- reranker 提升不稳定：先用固定评测集比较启用前后的 Hit@K / MRR，再检查候选数量是否过小、候选中是否已经缺少正确 chunk；不要用 reranker 掩盖基础召回范围错误。
- 历史 trace 数据无限增长：检查服务启动时是否调用了 `ragRetrievalTraceRetention.start()`，以及 `RAG_RETRIEVAL_TRACE_RETENTION_DAYS` 是否设置合理。

## 相关模块

- `server/src/services/rag/`
- `server/src/services/knowledge/`
- `server/src/services/bookAnalysis/bookAnalysis.publish.facets.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/prompting/`
- `client/src/pages/knowledge/`
- `client/src/pages/worlds/`
- `client/src/pages/novels/`

## 来源文档

- [知识库与向量化管理模块改造历史方案](../../archive/outdated/knowledge-module-plan-implemented-reference.md)
- [提示词工作台、上下文装配与统一步骤运行时方案](../../plans/prompt-workbench-context-and-step-runtime-plan.md)
- [README 当前能力说明](../../../README.md)
