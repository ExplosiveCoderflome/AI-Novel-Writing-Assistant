import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  getProviderEnvApiKey,
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
  resolveProviderBaseUrl,
} from "../../llm/providers";
import { normalizeRagText } from "./utils";
import { getRagEmbeddingSettings } from "../settings/RagSettingsService";
import { EmbeddingCheckpointStore, isEmbeddingVector } from "./indexing";
import { readSanitizedResponseError } from "./transport";

interface EmbeddingResult {
  vectors: number[][];
  model: string;
  provider: LLMProvider;
}

interface EmbeddingRuntimeTarget {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl: string;
}

interface EmbeddingOptions {
  checkpointScope?: string;
  assertActive?: () => Promise<void>;
}

type SaveEmbeddingBatch = (texts: string[], vectors: number[][]) => Promise<void>;

class EmbeddingRequestError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly shouldSplitBatch: boolean,
  ) {
    super(message);
    this.name = "EmbeddingRequestError";
  }
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
}

export class EmbeddingService {
  private readonly checkpointStores = new Map<string, EmbeddingCheckpointStore>();

  private async fetchWithTimeout<T>(url: string, init: RequestInit, consume: (response: Response) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = ragConfig.embeddingTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
      // Fetch resolves at headers; the deadline must include JSON/error-body reads.
      return await consume(response);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new EmbeddingRequestError(`Embedding request timed out (>${timeoutMs}ms).`, true, true);
      }
      if (error instanceof EmbeddingRequestError) throw error;
      if (error instanceof SyntaxError) throw new EmbeddingRequestError("Embedding response is not valid JSON.", false, false);
      throw new EmbeddingRequestError(`Embedding network request failed: ${toErrorMessage(error)}.`, true, true);
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitBeforeRetry(attempt: number): Promise<void> {
    const backoff = ragConfig.embeddingRetryBaseMs * (2 ** Math.max(attempt, 0));
    const jitter = Math.floor(Math.random() * Math.max(100, Math.floor(ragConfig.embeddingRetryBaseMs * 0.3)));
    await sleep(Math.min(backoff + jitter, 30_000));
  }

  private normalizeRequestError(error: unknown): EmbeddingRequestError {
    if (error instanceof EmbeddingRequestError) {
      return error;
    }
    if (error instanceof Error) {
      const message = error.message;
      const isNetworkLike = /timeout|timed out|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i
        .test(message);
      return new EmbeddingRequestError(
        isNetworkLike ? `Embedding network request failed: ${message}.` : message,
        isNetworkLike,
        isNetworkLike,
      );
    }
    return new EmbeddingRequestError("Embedding request failed.", false, false);
  }

  private async resolveRuntimeSettings(): Promise<{ provider: LLMProvider; model: string }> {
    const settings = await getRagEmbeddingSettings();
    return {
      provider: settings.embeddingProvider,
      model: settings.embeddingModel,
    };
  }

  private async resolveApiKey(provider: LLMProvider): Promise<string | undefined> {
    try {
      const dbSecret = await prisma.aPIKey.findUnique({ where: { provider } });
      if (dbSecret?.isActive && dbSecret.key?.trim()) {
        return dbSecret.key.trim();
      }
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    const envApiKey = getProviderEnvApiKey(provider);
    if (envApiKey) {
      return envApiKey;
    }

    if (!providerRequiresApiKey(provider)) {
      return undefined;
    }

    throw new Error(`Embedding API key is not configured for provider=${provider}.`);
  }

  private async resolveBaseUrl(provider: LLMProvider): Promise<string> {
    let dbBaseURL: string | undefined;
    try {
      const record = await prisma.aPIKey.findUnique({ where: { provider } });
      if (record?.isActive && record.baseURL?.trim()) {
        dbBaseURL = record.baseURL.trim();
      }
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    const resolved = resolveProviderBaseUrl(provider, dbBaseURL, dbBaseURL);
    if (resolved) {
      return resolved.replace(/\/+$/, "");
    }

    throw new Error(`Embedding API URL is not configured for provider=${provider}.`);
  }

  private resolveModel(provider: LLMProvider, model?: string): string {
    const resolved = model?.trim()
      || ragConfig.embeddingModel
      || (isBuiltInProvider(provider) ? PROVIDERS[provider].defaultModel : "");
    if (!resolved) {
      throw new Error(`Embedding model is not configured for provider=${provider}.`);
    }
    return resolved;
  }

  private async requestEmbeddingBatch(texts: string[], target: EmbeddingRuntimeTarget, options?: EmbeddingOptions): Promise<number[][]> {
    for (let attempt = 0; attempt <= ragConfig.embeddingMaxRetries; attempt += 1) {
      await options?.assertActive?.();
      try {
        return await this.fetchWithTimeout(`${target.baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: target.model,
            input: texts,
          }),
        }, async (response) => {
          if (!response.ok) {
            const errorText = await readSanitizedResponseError(response, target.apiKey);
            const status = response.status;
            const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
            const shouldSplitBatch = status === 413 || status === 414 || status === 429 || status >= 500;
            throw new EmbeddingRequestError(
              `Embedding request failed (${status}): ${errorText || "unknown error"}.`,
              retryable,
              shouldSplitBatch,
            );
          }

          const payload = await response.json() as {
            data?: Array<{ embedding?: unknown; index?: number }>;
          };
          if (!Array.isArray(payload?.data) || payload.data.length !== texts.length) {
            throw new EmbeddingRequestError("Embedding response vector count did not match the input count.", false, false);
          }
          const rows = payload.data;
          const hasIndexes = rows.some((row) => row?.index !== undefined);
          if (hasIndexes && (rows.some((row) => !Number.isInteger(row?.index) || row.index! < 0 || row.index! >= texts.length)
            || new Set(rows.map((row) => row.index)).size !== texts.length)) {
            throw new EmbeddingRequestError("Embedding response indexes must cover each input exactly once.", false, false);
          }
          const ordered = hasIndexes ? [...rows].sort((a, b) => a.index! - b.index!) : rows;
          const vectors = ordered.map((row) => row?.embedding);
          if (!vectors.every(isEmbeddingVector)
            || vectors.some((vector) => vector.length !== vectors[0].length)) {
            throw new EmbeddingRequestError("Embedding response contains invalid or inconsistent vector dimensions.", false, false);
          }
          return vectors;
        });
      } catch (error) {
        const normalized = this.normalizeRequestError(error);
        if (normalized.retryable && attempt < ragConfig.embeddingMaxRetries) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        throw normalized;
      }
    }

    throw new EmbeddingRequestError("Embedding request failed after exhausting retries.", true, true);
  }

  private async embedWithAdaptiveSplit(
    texts: string[], target: EmbeddingRuntimeTarget, options?: EmbeddingOptions, saveBatch?: SaveEmbeddingBatch,
  ): Promise<number[][]> {
    try {
      const vectors = await this.requestEmbeddingBatch(texts, target, options);
      // Persist each successful adaptive sub-batch, even if a later sub-batch fails.
      await saveBatch?.(texts, vectors);
      return vectors;
    } catch (error) {
      if (!(error instanceof EmbeddingRequestError)) throw error;
      const normalized = this.normalizeRequestError(error);
      if (texts.length <= 1 || !normalized.shouldSplitBatch) {
        throw normalized;
      }

      const splitAt = Math.ceil(texts.length / 2);
      const leftVectors = await this.embedWithAdaptiveSplit(texts.slice(0, splitAt), target, options, saveBatch);
      const rightVectors = await this.embedWithAdaptiveSplit(texts.slice(splitAt), target, options, saveBatch);
      return [...leftVectors, ...rightVectors];
    }
  }

  async embedTexts(inputTexts: string[], options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const texts = inputTexts
      .map((item) => normalizeRagText(item))
      .filter(Boolean);
    if (texts.length === 0) {
      const settings = await this.resolveRuntimeSettings();
      return {
        vectors: [],
        model: settings.model,
        provider: settings.provider,
      };
    }

    const settings = await this.resolveRuntimeSettings();
    const provider = settings.provider;
    const apiKey = await this.resolveApiKey(provider);
    const target: EmbeddingRuntimeTarget = {
      provider,
      apiKey,
      baseUrl: await this.resolveBaseUrl(provider),
      model: this.resolveModel(provider, settings.model),
    };

    let vectors: number[][];
    if (options?.checkpointScope) {
      const checkpointTarget = {
        provider: target.provider, model: target.model, baseUrl: target.baseUrl, version: ragConfig.embeddingVersion,
      };
      const storeKey = JSON.stringify([options.checkpointScope, checkpointTarget]);
      let store = this.checkpointStores.get(storeKey);
      if (!store) {
        store = new EmbeddingCheckpointStore(options.checkpointScope, checkpointTarget);
        this.checkpointStores.set(storeKey, store);
      }
      await store.prepare();
      const cached = await Promise.all(texts.map((text) => store.read(text)));
      const missing = [...new Set(texts.filter((_, index) => !cached[index]))];
      const saved = new Map<string, number[]>();
      if (missing.length > 0) {
        const fresh = await this.embedWithAdaptiveSplit(missing, target, options, async (batch, batchVectors) => {
          await Promise.all(batch.map((text, index) => store!.write(text, batchVectors[index])));
        });
        missing.forEach((text, index) => saved.set(text, fresh[index]));
      }
      vectors = texts.map((text, index) => cached[index] ?? saved.get(text)!);
      if (!vectors.every(isEmbeddingVector) || vectors.some((vector) => vector.length !== vectors[0].length)) {
        throw new EmbeddingRequestError("Embedding checkpoint dimensions do not match the current model response.", false, false);
      }
    } else {
      vectors = await this.embedWithAdaptiveSplit(texts, target, options);
    }
    return {
      vectors,
      model: target.model,
      provider: target.provider,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; provider: string; model: string; detail?: string }> {
    try {
      const settings = await this.resolveRuntimeSettings();
      await this.embedTexts(["health check"]);
      return { ok: true, provider: settings.provider, model: settings.model };
    } catch (error) {
      const settings = await this.resolveRuntimeSettings();
      return {
        ok: false,
        provider: settings.provider,
        model: settings.model,
        detail: error instanceof Error ? error.message : "embedding health check failed",
      };
    }
  }
}
