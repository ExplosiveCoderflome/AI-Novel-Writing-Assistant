export interface EmbeddingConnectionTestInput {
  embeddingProvider: string;
  embeddingModel: string;
  embeddingApiKey?: string;
  embeddingBaseURL?: string;
  embeddingTimeoutMs: number;
}

export interface QdrantConnectionTestInput {
  qdrantUrl: string;
  qdrantApiKey?: string;
  clearQdrantApiKey?: boolean;
  qdrantTimeoutMs: number;
}

export interface RagConnectionTestResult {
  ok: boolean;
  durationMs: number;
  message: string;
  dimensions?: number;
  httpStatus?: number;
}
