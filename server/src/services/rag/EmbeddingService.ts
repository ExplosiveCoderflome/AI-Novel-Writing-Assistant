import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import { PROVIDERS } from "../../llm/providers";
import { normalizeRagText } from "./utils";

interface EmbeddingResult {
  vectors: number[][];
  model: string;
  provider: "openai" | "siliconflow";
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

export class EmbeddingService {
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

  async embedTexts(inputTexts: string[]): Promise<EmbeddingResult> {
    const texts = inputTexts
      .map((item) => normalizeRagText(item))
      .filter(Boolean);
    if (texts.length === 0) {
      return {
        vectors: [],
        model: this.resolveModel(ragConfig.embeddingProvider),
        provider: ragConfig.embeddingProvider,
      };
    }

    const provider = ragConfig.embeddingProvider;
    const apiKey = await this.resolveApiKey(provider);
    const baseUrl = this.resolveBaseUrl(provider);
    const model = this.resolveModel(provider);

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding 请求失败(${response.status})：${errorText}`);
    }
    const payload = await response.json() as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const vectors = (payload.data ?? [])
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding ?? [])
      .filter((item): item is number[] => Array.isArray(item) && item.length > 0);
    if (vectors.length !== texts.length) {
      throw new Error("Embedding 返回向量数量与输入不一致。");
    }
    return { vectors, model, provider };
  }

  async healthCheck(): Promise<{ ok: boolean; provider: string; model: string; detail?: string }> {
    try {
      const model = this.resolveModel(ragConfig.embeddingProvider);
      await this.embedTexts(["health check"]);
      return { ok: true, provider: ragConfig.embeddingProvider, model };
    } catch (error) {
      return {
        ok: false,
        provider: ragConfig.embeddingProvider,
        model: this.resolveModel(ragConfig.embeddingProvider),
        detail: error instanceof Error ? error.message : "embedding health check failed",
      };
    }
  }
}
