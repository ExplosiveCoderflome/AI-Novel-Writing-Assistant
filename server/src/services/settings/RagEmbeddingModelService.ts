import { prisma } from "../../db/prisma";
import { type EmbeddingProvider } from "../../config/rag";
import { getProviderModels } from "../../llm/modelCatalog";
import {
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
} from "../../llm/providers";

interface ProviderSecret {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  displayName?: string | null;
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

const EMBEDDING_MODEL_FALLBACKS: Partial<Record<string, string[]>> = {
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
  qwen: ["text-embedding-v4", "text-embedding-v3", "text-embedding-v2"],
  gemini: ["gemini-embedding-001", "text-embedding-004"],
  glm: ["embedding-3"],
  ollama: ["nomic-embed-text", "mxbai-embed-large", "bge-m3", "all-minilm"],
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

function getFallbackModels(provider: EmbeddingProvider, configuredModel?: string): string[] {
  const knownModels = EMBEDDING_MODEL_FALLBACKS[provider] ?? [];
  return uniqueModels([
    ...knownModels,
    configuredModel ?? "",
  ]).filter((model) => isLikelyEmbeddingModel(model));
}

function isLikelyEmbeddingModel(model: string): boolean {
  return /embedding|embed/i.test(model)
    || /\bbge\b/i.test(model)
    || /\be5\b/i.test(model)
    || /\bgte\b/i.test(model)
    || /\bbce\b/i.test(model)
    || /jina/i.test(model)
    || /nomic/i.test(model)
    || /mxbai/i.test(model)
    || /snowflake/i.test(model)
    || /arctic/i.test(model)
    || /\bm3e\b/i.test(model)
    || /minilm/i.test(model);
}

function filterEmbeddingModels(models: string[]): string[] {
  const normalized = uniqueModels(models);
  return normalized.filter((model) => isLikelyEmbeddingModel(model));
}

function getProviderDisplayName(provider: EmbeddingProvider, displayName?: string | null): string {
  if (isBuiltInProvider(provider)) {
    return PROVIDERS[provider].name;
  }
  return displayName?.trim() || provider;
}

async function resolveProviderSecret(provider: EmbeddingProvider): Promise<ProviderSecret> {
  try {
    const record = await prisma.aPIKey.findUnique({
      where: { provider },
    });
    const dbApiKey = record?.isActive ? record.key?.trim() : undefined;
    const dbBaseURL = record?.isActive ? record.baseURL?.trim() : undefined;
    const dbModel = record?.isActive ? record.model?.trim() : undefined;
    const envApiKey = getProviderEnvApiKey(provider)?.trim();
    const envBaseURL = getProviderEnvBaseUrl(provider)?.trim();
    const envModel = getProviderEnvModel(provider)?.trim();
    const canRunWithoutApiKey = !isBuiltInProvider(provider) || !providerRequiresApiKey(provider);
    return {
      apiKey: dbApiKey || envApiKey,
      baseURL: dbBaseURL || envBaseURL,
      model: dbModel || envModel,
      displayName: record?.displayName ?? null,
      isConfigured: Boolean(dbApiKey || envApiKey) || (canRunWithoutApiKey && Boolean(dbBaseURL || envBaseURL || isBuiltInProvider(provider))),
      isActive: record?.isActive ?? (Boolean(envApiKey) || canRunWithoutApiKey),
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      const envApiKey = getProviderEnvApiKey(provider)?.trim();
      const envBaseURL = getProviderEnvBaseUrl(provider)?.trim();
      const envModel = getProviderEnvModel(provider)?.trim();
      const canRunWithoutApiKey = !isBuiltInProvider(provider) || !providerRequiresApiKey(provider);
      return {
        apiKey: envApiKey,
        baseURL: envBaseURL,
        model: envModel,
        displayName: null,
        isConfigured: Boolean(envApiKey) || (canRunWithoutApiKey && Boolean(envBaseURL || isBuiltInProvider(provider))),
        isActive: Boolean(envApiKey) || canRunWithoutApiKey,
      };
    }
    throw error;
  }
}

export async function getRagEmbeddingModelOptions(
  provider: EmbeddingProvider,
): Promise<RagEmbeddingModelOptions> {
  const secret = await resolveProviderSecret(provider);
  const fallbackModels = getFallbackModels(provider, secret.model);

  let remoteModels: string[] = [];
  if (secret.apiKey || (secret.isActive && !providerRequiresApiKey(provider))) {
    const fetchedModels = await getProviderModels(provider, {
      apiKey: secret.apiKey,
      baseURL: secret.baseURL,
      allowAnonymous: !providerRequiresApiKey(provider),
      fallbackModel: secret.model,
      fallbackModels,
    });
    remoteModels = filterEmbeddingModels(fetchedModels);
  }

  const models = uniqueModels([
    ...(remoteModels.length > 0 ? remoteModels : []),
    ...fallbackModels,
  ]);

  return {
    provider,
    name: getProviderDisplayName(provider, secret.displayName),
    models,
    defaultModel: fallbackModels[0] ?? models[0] ?? "",
    isConfigured: secret.isConfigured,
    isActive: secret.isActive,
    source: remoteModels.length > 0 ? "remote" : "fallback",
  };
}
