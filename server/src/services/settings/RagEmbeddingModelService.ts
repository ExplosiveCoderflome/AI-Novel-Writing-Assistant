import { prisma } from "../../db/prisma";
import { type EmbeddingProvider } from "../../config/rag";
import { getProviderModels } from "../../llm/modelCatalog";
import { PROVIDERS } from "../../llm/providers";

interface ProviderSecret {
  apiKey?: string;
  isConfigured: boolean;
  isActive: boolean;
}

export interface RagEmbeddingModelOptions {
  provider: EmbeddingProvider;
  name: string;
  models: string[];
  defaultModel: string;
  isConfigured: boolean;
  isActive: boolean;
  source: "remote" | "fallback";
}

const EMBEDDING_MODEL_FALLBACKS: Record<EmbeddingProvider, string[]> = {
  openai: ["text-embedding-3-small", "text-embedding-3-large"],
  siliconflow: [
    "BAAI/bge-m3",
    "BAAI/bge-large-zh-v1.5",
    "BAAI/bge-large-en-v1.5",
    "netease-youdao/bce-embedding-base_v1",
    "Qwen/Qwen3-Embedding-0.6B",
    "Qwen/Qwen3-Embedding-4B",
    "Qwen/Qwen3-Embedding-8B",
  ],
};

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

function getFallbackModels(provider: EmbeddingProvider): string[] {
  return uniqueModels(EMBEDDING_MODEL_FALLBACKS[provider]);
}

function getProviderEnvApiKey(provider: EmbeddingProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "siliconflow":
      return process.env.SILICONFLOW_API_KEY;
    default:
      return undefined;
  }
}

function filterEmbeddingModels(provider: EmbeddingProvider, models: string[]): string[] {
  const normalized = uniqueModels(models);
  if (provider === "openai") {
    return normalized.filter((model) => /^text-embedding-/i.test(model) || /embedding/i.test(model));
  }
  return normalized.filter((model) => /embedding/i.test(model)
    || /\bbge\b/i.test(model)
    || /\be5\b/i.test(model)
    || /\bgte\b/i.test(model)
    || /\bbce\b/i.test(model)
    || /jina/i.test(model));
}

async function resolveProviderSecret(provider: EmbeddingProvider): Promise<ProviderSecret> {
  const envApiKey = getProviderEnvApiKey(provider)?.trim();
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      isConfigured: true,
      isActive: true,
    };
  }

  try {
    const record = await prisma.aPIKey.findUnique({
      where: { provider },
    });
    const dbApiKey = record?.key?.trim();
    return {
      apiKey: record?.isActive ? dbApiKey : undefined,
      isConfigured: Boolean(dbApiKey),
      isActive: record?.isActive ?? false,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        isConfigured: false,
        isActive: false,
      };
    }
    throw error;
  }
}

export async function getRagEmbeddingModelOptions(
  provider: EmbeddingProvider,
): Promise<RagEmbeddingModelOptions> {
  const secret = await resolveProviderSecret(provider);
  const fallbackModels = getFallbackModels(provider);

  let remoteModels: string[] = [];
  if (secret.apiKey) {
    const fetchedModels = await getProviderModels(provider, {
      apiKey: secret.apiKey,
    });
    remoteModels = filterEmbeddingModels(provider, fetchedModels);
  }

  const models = uniqueModels([
    ...(remoteModels.length > 0 ? remoteModels : []),
    ...fallbackModels,
  ]);

  return {
    provider,
    name: PROVIDERS[provider].name,
    models,
    defaultModel: fallbackModels[0] ?? models[0] ?? "",
    isConfigured: secret.isConfigured,
    isActive: secret.isActive,
    source: remoteModels.length > 0 ? "remote" : "fallback",
  };
}
