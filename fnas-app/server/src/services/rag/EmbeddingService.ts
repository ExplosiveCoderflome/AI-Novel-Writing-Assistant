import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import { PROVIDERS } from "../../llm/providers";
import { normalizeRagText } from "./utils";
import { getRagEmbeddingSettings } from "../settings/RagSettingsService";

interface EmbeddingResult {
  vectors: number[][];
  model: string;
  provider: "openai" | "siliconflow";
}

interface EmbeddingRuntimeTarget {
  provider: "openai" | "siliconflow";
  model: string;
  apiKey: string;
  baseUrl: string;
}

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

function getProviderEnvBaseUrl(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_BASE_URL;
    case "siliconflow":
      return process.env.SILICONFLOW_BASE_URL;
    default:
      return undefined;
  }
}

function getProviderEnvModel(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.EMBEDDING_MODEL ?? process.env.OPENAI_EMBEDDING_MODEL ?? process.env.OPENAI_MODEL;
    case "siliconflow":
      return process.env.EMBEDDING_MODEL ?? process.env.SILICONFLOW_EMBEDDING_MODEL ?? process.env.SILICONFLOW_MODEL;
    default:
      return undefined;
  }
}

function getProviderEnvApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "siliconflow":
      return process.env.SILICONFLOW_API_KEY;
    default:
      return undefined;
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

function truncateErrorText(rawText: string, maxLength = 240): string {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

export class EmbeddingService {
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ragConfig.embeddingTimeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new EmbeddingRequestError(`Embedding 请求超时（>${ragConfig.embeddingTimeoutMs}ms）。`, true, true);
      }
      throw new EmbeddingRequestError(`Embedding 网络请求失败：${toErrorMessage(error)}。`, true, true);
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
        isNetworkLike ? `Embedding 网络请求失败：${message}。` : message,
        isNetworkLike,
        isNetworkLike,
      );
    }
    return new EmbeddingRequestError("Embedding 请求失败。", false, false);
  }

  private async resolveRuntimeSettings(): Promise<{ provider: "openai" | "siliconflow"; model: string }> {
    const settings = await getRagEmbeddingSettings();
    return {
      provider: settings.embeddingProvider,
      model: settings.embeddingModel,
    };
  }

  private async resolveApiKey(provider: "openai" | "siliconflow"): Promise<string> {
    const envApiKey = getProviderEnvApiKey(provider);
    if (envApiKey) {
      return envApiKey;
    }
    try {
      const dbSecret = await prisma.aPIKey.findUnique({ where: { provider } });
      if (dbSecret?.isActive && dbSecret.key) {
        return dbSecret.key;
      }
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
    throw new Error(`未配置 ${provider} 的 Embedding API Key。`);
  }

  private resolveBaseUrl(provider: "openai" | "siliconflow"): string {
    return (
      getProviderEnvBaseUrl(provider)
      ?? PROVIDERS[provider].baseURL
    ).replace(/\/+$/, "");
  }

  private resolveModel(provider: "openai" | "siliconflow"): string {
    return getProviderEnvModel(provider) ?? ragConfig.embeddingModel;
  }

  private async requestEmbeddingBatch(texts: string[], target: EmbeddingRuntimeTarget): Promise<number[][]> {
    for (let attempt = 0; attempt <= ragConfig.embeddingMaxRetries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(`${target.baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${target.apiKey}`,
          },
          body: JSON.stringify({
            model: target.model,
            input: texts,
          }),
        });

        if (!response.ok) {
          const errorText = truncateErrorText(await response.text());
          const status = response.status;
          const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
          const shouldSplitBatch = status === 413 || status === 414 || status === 429 || status >= 500;
          throw new EmbeddingRequestError(
            `Embedding 请求失败(${status})：${errorText || "无详细错误"}。`,
            retryable,
            shouldSplitBatch,
          );
        }

        const payload = await response.json() as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };

        const vectors = (payload.data ?? [])
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((item) => item.embedding ?? [])
          .filter((item): item is number[] => Array.isArray(item) && item.length > 0);

        if (vectors.length !== texts.length) {
          throw new EmbeddingRequestError("Embedding 返回向量数量与输入不一致。", false, false);
        }

        return vectors;
      } catch (error) {
        const normalized = this.normalizeRequestError(error);
        if (normalized.retryable && attempt < ragConfig.embeddingMaxRetries) {
          await this.waitBeforeRetry(attempt);
          continue;
        }
        throw normalized;
      }
    }

    throw new EmbeddingRequestError("Embedding 请求失败：达到最大重试次数。", true, true);
  }

  private async embedWithAdaptiveSplit(texts: string[], target: EmbeddingRuntimeTarget): Promise<number[][]> {
    try {
      return await this.requestEmbeddingBatch(texts, target);
    } catch (error) {
      const normalized = this.normalizeRequestError(error);
      if (texts.length <= 1 || !normalized.shouldSplitBatch) {
        throw normalized;
      }

      const splitAt = Math.ceil(texts.length / 2);
      const leftVectors = await this.embedWithAdaptiveSplit(texts.slice(0, splitAt), target);
      const rightVectors = await this.embedWithAdaptiveSplit(texts.slice(splitAt), target);
      return [...leftVectors, ...rightVectors];
    }
  }

  async embedTexts(inputTexts: string[]): Promise<EmbeddingResult> {
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
      baseUrl: this.resolveBaseUrl(provider),
      model: settings.model || this.resolveModel(provider),
    };

    const vectors = await this.embedWithAdaptiveSplit(texts, target);
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
