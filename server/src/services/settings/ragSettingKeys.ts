export const RAG_EMBEDDING_PROVIDER_KEY = "rag.embeddingProvider";
export const RAG_EMBEDDING_MODEL_KEY = "rag.embeddingModel";
export const RAG_EMBEDDING_COLLECTION_MODE_KEY = "rag.embeddingCollectionMode";
export const RAG_EMBEDDING_COLLECTION_NAME_KEY = "rag.embeddingCollectionName";
export const RAG_EMBEDDING_COLLECTION_TAG_KEY = "rag.embeddingCollectionTag";
export const RAG_EMBEDDING_AUTO_REINDEX_KEY = "rag.embeddingAutoReindexOnChange";
export const RAG_EMBEDDING_BATCH_SIZE_KEY = "rag.embeddingBatchSize";
export const RAG_EMBEDDING_TIMEOUT_MS_KEY = "rag.embeddingTimeoutMs";
export const RAG_EMBEDDING_MAX_RETRIES_KEY = "rag.embeddingMaxRetries";
export const RAG_EMBEDDING_RETRY_BASE_MS_KEY = "rag.embeddingRetryBaseMs";

export const RAG_ENABLED_KEY = "rag.enabled";
export const QDRANT_URL_KEY = "rag.qdrantUrl";
export const QDRANT_API_KEY_KEY = "rag.qdrantApiKey";
export const QDRANT_TIMEOUT_MS_KEY = "rag.qdrantTimeoutMs";
export const QDRANT_UPSERT_MAX_BYTES_KEY = "rag.qdrantUpsertMaxBytes";
export const CHUNK_SIZE_KEY = "rag.chunkSize";
export const CHUNK_OVERLAP_KEY = "rag.chunkOverlap";
export const VECTOR_CANDIDATES_KEY = "rag.vectorCandidates";
export const KEYWORD_CANDIDATES_KEY = "rag.keywordCandidates";
export const FINAL_TOP_K_KEY = "rag.finalTopK";
export const WORKER_POLL_MS_KEY = "rag.workerPollMs";
export const WORKER_MAX_ATTEMPTS_KEY = "rag.workerMaxAttempts";
export const WORKER_RETRY_BASE_MS_KEY = "rag.workerRetryBaseMs";
export const HTTP_TIMEOUT_MS_KEY = "rag.httpTimeoutMs";

export const DEFAULT_RAG_COLLECTION_NAME = "ai_novel_chunks_v1";

export const RAG_EMBEDDING_SETTING_KEYS = [
  RAG_EMBEDDING_PROVIDER_KEY,
  RAG_EMBEDDING_MODEL_KEY,
  RAG_EMBEDDING_COLLECTION_MODE_KEY,
  RAG_EMBEDDING_COLLECTION_NAME_KEY,
  RAG_EMBEDDING_COLLECTION_TAG_KEY,
  RAG_EMBEDDING_AUTO_REINDEX_KEY,
  RAG_EMBEDDING_BATCH_SIZE_KEY,
  RAG_EMBEDDING_TIMEOUT_MS_KEY,
  RAG_EMBEDDING_MAX_RETRIES_KEY,
  RAG_EMBEDDING_RETRY_BASE_MS_KEY,
] as const;

export const RAG_RUNTIME_SETTING_KEYS = [
  RAG_ENABLED_KEY,
  QDRANT_URL_KEY,
  QDRANT_API_KEY_KEY,
  QDRANT_TIMEOUT_MS_KEY,
  QDRANT_UPSERT_MAX_BYTES_KEY,
  CHUNK_SIZE_KEY,
  CHUNK_OVERLAP_KEY,
  VECTOR_CANDIDATES_KEY,
  KEYWORD_CANDIDATES_KEY,
  FINAL_TOP_K_KEY,
  WORKER_POLL_MS_KEY,
  WORKER_MAX_ATTEMPTS_KEY,
  WORKER_RETRY_BASE_MS_KEY,
  HTTP_TIMEOUT_MS_KEY,
] as const;

export const ALL_RAG_SETTING_KEYS = [
  ...RAG_EMBEDDING_SETTING_KEYS,
  ...RAG_RUNTIME_SETTING_KEYS,
] as const;
