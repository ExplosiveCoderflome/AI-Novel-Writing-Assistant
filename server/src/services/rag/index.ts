import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import { HybridRetrievalService } from "./HybridRetrievalService";
import { RagIndexService } from "./RagIndexService";
import { RagContextualChunkService } from "./RagContextualChunkService";
import { RagRerankerService } from "./RagRerankerService";
import { RagJobCleanupService } from "./RagJobCleanupService";
import { RagRetrievalTraceRetention } from "./RagRetrievalTraceRetention";
import { RagWorker } from "./RagWorker";

const embeddingService = new EmbeddingService();
const vectorStoreService = new VectorStoreService();
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
