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
- `HybridRetrievalService.retrieve({ facets })` 应同时把 facet 过滤传给向量检索和关键词检索。老 chunk 没有 facet 时，带 facet 的检索可能为空；此时必须回退到无 facet 过滤的召回，保证旧资料不会被完全屏蔽。
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
