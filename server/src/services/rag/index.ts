import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import { HybridRetrievalService } from "./HybridRetrievalService";
import { RagIndexService } from "./RagIndexService";
import { RagJobCleanupService } from "./RagJobCleanupService";
import { RagRetrievalTraceRetention } from "./RagRetrievalTraceRetention";
import { RagWorker } from "./RagWorker";

const embeddingService = new EmbeddingService();
const vectorStoreService = new VectorStoreService();
const ragIndexService = new RagIndexService(embeddingService, vectorStoreService);
const ragJobCleanupService = new RagJobCleanupService();
const ragRetrievalTraceRetention = new RagRetrievalTraceRetention();
const hybridRetrievalService = new HybridRetrievalService(embeddingService, vectorStoreService);
const ragWorker = new RagWorker(ragIndexService);

export const ragServices = {
  embeddingService,
  vectorStoreService,
  ragIndexService,
  ragJobCleanupService,
  ragRetrievalTraceRetention,
  hybridRetrievalService,
  ragWorker,
};
