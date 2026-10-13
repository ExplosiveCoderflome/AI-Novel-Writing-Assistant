import { ragConfig } from "../../config/rag";
import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import { LocalVectorStoreService } from "./LocalVectorStoreService";
import { HybridRetrievalService } from "./HybridRetrievalService";
import { RagIndexService } from "./RagIndexService";
import { RagContextualChunkService } from "./RagContextualChunkService";
import { RagRerankerService } from "./RagRerankerService";
import { RagJobCleanupService } from "./RagJobCleanupService";
import { RagRetrievalTraceRetention } from "./RagRetrievalTraceRetention";
import { RagWorker } from "./RagWorker";

const embeddingService = new EmbeddingService();
// 向量库驱动：默认 Qdrant（与上游一致）；RAG_VECTOR_STORE=local 时使用
// SQLite 本地向量库（无需 Qdrant 服务，安卓端走此路径）
const vectorStoreService =
  ragConfig.vectorStoreDriver === "local" ? new LocalVectorStoreService() : new VectorStoreService();
const ragContextualChunkService = new RagContextualChunkService();
const ragRerankerService = new RagRerankerService();
const ragIndexService = new RagIndexService(embeddingService, vectorStoreService, ragContextualChunkService);
const ragJobCleanupService = new RagJobCleanupService();
const ragRetrievalTraceRetention = new RagRetrievalTraceRetention();
const hybridRetrievalService = new HybridRetrievalService(embeddingService, vectorStoreService, ragRerankerService);
const ragWorker = new RagWorker(ragIndexService);

export const ragServices = {
  embeddingService,
  vectorStoreService,
  ragContextualChunkService,
  ragRerankerService,
  ragIndexService,
  ragJobCleanupService,
  ragRetrievalTraceRetention,
  hybridRetrievalService,
  ragWorker,
};
