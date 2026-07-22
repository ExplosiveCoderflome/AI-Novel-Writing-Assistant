# RAG 检索深度增强设计方案 (V1)

## 1. 背景与目标
在长篇小说的自动创作中，由于上下文长、情节连续性强、背景知识繁多，标准的向量检索（Dense Retrieval）往往无法精准捕捉细微的上下文线索（如特定角色关系、时间线先后、特定设定条件）。为此，系统对 RAG 引擎进行了深度增强，实现了**上下文化切片**、**双路召回融合与 Reranker 重排**，以及在向量服务（Qdrant）或 Embedding API 不可用时的 **SQLite 物理降级直写与本地关键词检索兜底机制**。

## 2. 核心架构设计

系统数据流与容灾架构如下图所示：

```mermaid
flowchart TD
    subgraph 索引创建阶段 (Indexing)
        Doc[文档数据] --> Split[切分候选分块 Chunk]
        Split --> Context[上下文化前缀补全 contextPrefix]
        Context --> Embed[调用 Embedding 服务]
        
        Embed -- 成功 --> Qdrant[写入 Qdrant 向量库]
        Embed -- 失败 (API 异常) --> SQLiteOnly[继续进行 SQLite 单轨索引]
        Qdrant -- 写入失败 --> SQLiteOnly
        SQLiteOnly --> LocalDB[(本地 SQLite 数据库)]
        Qdrant -- 写入成功 --> SyncDB[同时写入本地 SQLite 元数据]
        SyncDB --> LocalDB
    end

    subgraph 检索服务阶段 (Retrieval)
        Query[检索 Query] --> VSearch[向量检索 vectorSearch]
        Query --> KSearch[关键词检索 keywordSearch]
        
        VSearch -- 访问 Qdrant --> VResult[向量召回结果]
        VSearch -- Qdrant 故障/超时 (Fail-Open) --> EmptyV[返回空列表]
        KSearch -- 查询 SQLite --> KResult[本地关键词召回结果]
        
        VResult --> RRF[RRF 倒数排名融合]
        EmptyV --> RRF
        KResult --> RRF
        
        RRF --> Rerank[Reranker 交叉编码器重排]
        Rerank -- 超时/异常 (Fail-Open) --> Decay[叙事距离衰减评分]
        Decay --> Final[返回最终 TopK 结果]
    end
```

## 3. 关键增强机制

### 3.1 上下文化检索 (Contextual Retrieval)
- **原理**：标准的文本切片（Chunk）往往由于切分失去段落前后的主题信息。系统通过在索引阶段为每个 Chunk 运行结构化 Prompt，生成简短的上下文摘要（`contextPrefix`），补充小说标题、世界规则类型、所属章节或角色背景等元信息。
- **检索适配**：在 Embedding 时，使用 `searchText = contextPrefix + chunkText` 计算向量，提高语义相似度；在返回给 LLM 时，依然保留原始 `chunkText` 作为事实依据，避免掺杂多余噪音。

### 3.2 双路召回融合与 Reranker 重排
- **混合检索**：系统同时启动向量检索和基于本地数据库（Prisma/SQLite）的关键词检索（Keyword Search）。
- **RRF 融合**：使用 RRF（Reciprocal Rank Fusion，倒数排名融合）公式将两路召回结果混合排序，确保词面精确匹配（如特定道具名称、缩写）与语义相似度均能得到保障。
- **Reranker 重排**：使用 Cross-Encoder 对融合后的 Top 候选集进行重分，重排输入为 `contextPrefix + chunkText`，最大化上下文与 Query 的相关度。
- **叙事距离衰减 (Narrative Decay)**：针对小说创作特有的时序性，距离当前写作章节越远的 Chunk 会受到指数级衰减，保证更倾向于召回邻近章节的情节。

### 3.3 双轨容灾机制 (Fail-Soft SQLite Fallback)
- **写入容灾**：当 Embedding 服务限流、断网，或者 Qdrant 向量库出现故障时，`RagIndexService` 捕获异常，打印警告，并**跳过向量写入**，继续将 Chunk 的文本、Hash、以及用于关键词匹配的元数据写入 SQLite 的 `KnowledgeChunk` 表。
- **查询容灾**：在 `HybridRetrievalService` 执行检索时：
  - 如果向量服务因各种原因抛出异常，`vectorSearch` 会执行 **Fail-Open（故障开放）** 策略，安全返回空数组 `[]`；
  - 检索流程不中断，依赖 SQLite 本地数据库进行关键词检索；
  - RRF 将空向量结果与关键词召回结果融合，系统无缝退化为纯本地数据库检索，保障核心小说生产不因外部服务停摆而中断。

## 4. 相关模块
- **索引服务**：[server/src/services/rag/RagIndexService.ts](file:///server/src/services/rag/RagIndexService.ts) — 负责切片、上下文化、向量计算与 SQLite/Qdrant 写入。
- **混合检索**：[server/src/services/rag/HybridRetrievalService.ts](file:///server/src/services/rag/HybridRetrievalService.ts) — RRF 融合与 Fail-Open 双轨容灾检索实现。
- **重排服务**：[server/src/services/rag/RagRerankerService.ts](file:///server/src/services/rag/RagRerankerService.ts) — 对接重排器接口。
- **上下文化**：[server/src/services/rag/RagContextualChunkService.ts](file:///server/src/services/rag/RagContextualChunkService.ts) — 提取上下文前缀。
- **向量库客户端**：[server/src/services/rag/VectorStoreService.ts](file:///server/src/services/rag/VectorStoreService.ts) — Qdrant 客户端封装。
