import type { LLMProvider } from "@ai-novel/shared/types/llm";

export type EmbeddingProvider = "openai" | "siliconflow";

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isEnabled(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (!rawValue) {
    return defaultValue;
  }
  const normalized = rawValue.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function asInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  return Math.max(min, Math.min(max, value));
}

export function asEmbeddingProvider(rawValue: string | undefined): EmbeddingProvider {
  const normalized = (rawValue ?? "").trim().toLowerCase();
  if (normalized === "siliconflow") {
    return "siliconflow";
  }
  return "openai";
}

function resolveEmbeddingProviderFromEnv(): EmbeddingProvider {
  if (normalizeOptionalText(process.env.EMBEDDING_PROVIDER)) {
    return asEmbeddingProvider(process.env.EMBEDDING_PROVIDER);
  }
  if (normalizeOptionalText(process.env.SILICONFLOW_EMBEDDING_MODEL)) {
    return "siliconflow";
  }
  return "openai";
}

function resolveEmbeddingModelFromEnv(provider: EmbeddingProvider): string {
  return normalizeOptionalText(process.env.EMBEDDING_MODEL)
    ?? (provider === "siliconflow"
      ? normalizeOptionalText(process.env.SILICONFLOW_EMBEDDING_MODEL)
      : normalizeOptionalText(process.env.OPENAI_EMBEDDING_MODEL))
    ?? "text-embedding-3-small";
}

export interface RagContextScope {
  tenantId?: string;
  novelId?: string;
  worldId?: string;
  ownerTypes?: string[];
}

const embeddingProvider = resolveEmbeddingProviderFromEnv();

export const ragConfig = {
  enabled: isEnabled(process.env.RAG_ENABLED, true),
  verboseLog: isEnabled(process.env.RAG_VERBOSE_LOG, false),
  defaultTenantId: process.env.RAG_DEFAULT_TENANT ?? "default",
  embeddingProvider,
  embeddingModel: resolveEmbeddingModelFromEnv(embeddingProvider),
  embeddingVersion: asInt(process.env.EMBEDDING_VERSION, 1, 1, 100),
  embeddingBatchSize: asInt(process.env.EMBEDDING_BATCH_SIZE, 64, 1, 256),
  embeddingTimeoutMs: asInt(process.env.RAG_EMBEDDING_TIMEOUT_MS ?? process.env.RAG_HTTP_TIMEOUT_MS, 30000, 5000, 300000),
  embeddingMaxRetries: asInt(process.env.RAG_EMBEDDING_MAX_RETRIES, 2, 0, 8),
  embeddingRetryBaseMs: asInt(process.env.RAG_EMBEDDING_RETRY_BASE_MS, 500, 100, 10000),
  qdrantUrl: (process.env.QDRANT_URL ?? "http://127.0.0.1:6333").replace(/\/+$/, ""),
  qdrantApiKey: process.env.QDRANT_API_KEY ?? "",
  qdrantCollection: process.env.QDRANT_COLLECTION ?? "ai_novel_chunks_v1",
  qdrantTimeoutMs: asInt(process.env.QDRANT_TIMEOUT_MS ?? process.env.RAG_HTTP_TIMEOUT_MS, 30000, 1000, 300000),
  qdrantUpsertMaxBytes: asInt(process.env.QDRANT_UPSERT_MAX_BYTES, 24 * 1024 * 1024, 1024 * 1024, 64 * 1024 * 1024),
  chunkSize: asInt(process.env.RAG_CHUNK_SIZE, 800, 200, 4000),
  chunkOverlap: asInt(process.env.RAG_CHUNK_OVERLAP, 120, 0, 1000),
  vectorCandidates: asInt(process.env.RAG_VECTOR_CANDIDATES, 40, 1, 200),
  keywordCandidates: asInt(process.env.RAG_KEYWORD_CANDIDATES, 40, 1, 200),
  finalTopK: asInt(process.env.RAG_FINAL_TOP_K, 8, 1, 50),
  workerPollMs: asInt(process.env.RAG_WORKER_POLL_MS, 2500, 200, 60000),
  workerMaxAttempts: asInt(process.env.RAG_WORKER_MAX_ATTEMPTS, 5, 1, 20),
  workerRetryBaseMs: asInt(process.env.RAG_WORKER_RETRY_BASE_MS, 5000, 1000, 300000),
  httpTimeoutMs: asInt(process.env.RAG_HTTP_TIMEOUT_MS, 30000, 1000, 300000),
  providerPriority: ["openai", "siliconflow"] as Array<Extract<LLMProvider, "openai" | "siliconflow">>,
};
