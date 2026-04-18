import { prisma } from "../../db/prisma";
import { ragConfig, asEmbeddingProvider, type EmbeddingProvider } from "../../config/rag";
import {
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
} from "../../llm/providers";
import { getRagRuntimeSettings } from "./RagRuntimeSettingsService";
import { getRagEmbeddingSettings } from "./RagSettingsService";
import {
  hasExplicitLegacyQdrantCollectionEnv,
  isMissingTableError,
  normalizeOptionalText,
  shouldPreserveLegacyQdrantCollection,
} from "./ragLegacyCompatibility";
import {
  ALL_RAG_SETTING_KEYS,
  QDRANT_API_KEY_KEY,
  QDRANT_URL_KEY,
  RAG_EMBEDDING_BATCH_SIZE_KEY,
  RAG_EMBEDDING_COLLECTION_MODE_KEY,
  RAG_EMBEDDING_COLLECTION_NAME_KEY,
  RAG_EMBEDDING_MAX_RETRIES_KEY,
  RAG_EMBEDDING_MODEL_KEY,
  RAG_EMBEDDING_PROVIDER_KEY,
  RAG_EMBEDDING_RETRY_BASE_MS_KEY,
  RAG_EMBEDDING_TIMEOUT_MS_KEY,
  RAG_ENABLED_KEY,
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
} from "./ragSettingKeys";

interface RagCompatibilityBootstrapReport {
  importedSettingKeys: string[];
  importedProviderRecords: string[];
}

interface RagSettingImportCandidate {
  key: string;
  value: string | undefined;
}

function getLegacyEmbeddingProviderFromEnv(): EmbeddingProvider {
  if (normalizeOptionalText(process.env.EMBEDDING_PROVIDER)) {
    return asEmbeddingProvider(process.env.EMBEDDING_PROVIDER);
  }
  if (normalizeOptionalText(process.env.SILICONFLOW_EMBEDDING_MODEL)) {
    return "siliconflow";
  }
  return "openai";
}

function getLegacyEmbeddingModelFromEnv(): string | undefined {
  const explicitEmbeddingModel = normalizeOptionalText(process.env.EMBEDDING_MODEL);
  if (explicitEmbeddingModel) {
    return explicitEmbeddingModel;
  }
  const provider = getLegacyEmbeddingProviderFromEnv();
  if (provider === "siliconflow") {
    return normalizeOptionalText(process.env.SILICONFLOW_EMBEDDING_MODEL);
  }
  return normalizeOptionalText(process.env.OPENAI_EMBEDDING_MODEL);
}

function buildRagSettingImportCandidates(): RagSettingImportCandidate[] {
  return [
    {
      key: RAG_EMBEDDING_PROVIDER_KEY,
      value: process.env.EMBEDDING_PROVIDER !== undefined || getLegacyEmbeddingModelFromEnv()
        ? getLegacyEmbeddingProviderFromEnv()
        : undefined,
    },
    {
      key: RAG_EMBEDDING_MODEL_KEY,
      value: getLegacyEmbeddingModelFromEnv(),
    },
    {
      key: RAG_EMBEDDING_BATCH_SIZE_KEY,
      value: process.env.EMBEDDING_BATCH_SIZE,
    },
    {
      key: RAG_EMBEDDING_TIMEOUT_MS_KEY,
      value: process.env.RAG_EMBEDDING_TIMEOUT_MS,
    },
    {
      key: RAG_EMBEDDING_MAX_RETRIES_KEY,
      value: process.env.RAG_EMBEDDING_MAX_RETRIES,
    },
    {
      key: RAG_EMBEDDING_RETRY_BASE_MS_KEY,
      value: process.env.RAG_EMBEDDING_RETRY_BASE_MS,
    },
    {
      key: RAG_ENABLED_KEY,
      value: process.env.RAG_ENABLED,
    },
    {
      key: QDRANT_URL_KEY,
      value: process.env.QDRANT_URL,
    },
    {
      key: QDRANT_API_KEY_KEY,
      value: normalizeOptionalText(process.env.QDRANT_API_KEY),
    },
    {
      key: QDRANT_TIMEOUT_MS_KEY,
      value: process.env.QDRANT_TIMEOUT_MS,
    },
    {
      key: QDRANT_UPSERT_MAX_BYTES_KEY,
      value: process.env.QDRANT_UPSERT_MAX_BYTES,
    },
    {
      key: CHUNK_SIZE_KEY,
      value: process.env.RAG_CHUNK_SIZE,
    },
    {
      key: CHUNK_OVERLAP_KEY,
      value: process.env.RAG_CHUNK_OVERLAP,
    },
    {
      key: VECTOR_CANDIDATES_KEY,
      value: process.env.RAG_VECTOR_CANDIDATES,
    },
    {
      key: KEYWORD_CANDIDATES_KEY,
      value: process.env.RAG_KEYWORD_CANDIDATES,
    },
    {
      key: FINAL_TOP_K_KEY,
      value: process.env.RAG_FINAL_TOP_K,
    },
    {
      key: WORKER_POLL_MS_KEY,
      value: process.env.RAG_WORKER_POLL_MS,
    },
    {
      key: WORKER_MAX_ATTEMPTS_KEY,
      value: process.env.RAG_WORKER_MAX_ATTEMPTS,
    },
    {
      key: WORKER_RETRY_BASE_MS_KEY,
      value: process.env.RAG_WORKER_RETRY_BASE_MS,
    },
    {
      key: HTTP_TIMEOUT_MS_KEY,
      value: process.env.RAG_HTTP_TIMEOUT_MS,
    },
  ];
}

async function importMissingRagSettingsFromEnv(): Promise<string[]> {
  try {
    const existingSettings = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [...ALL_RAG_SETTING_KEYS],
        },
      },
      select: {
        key: true,
      },
    });

    const existingKeys = new Set(existingSettings.map((item) => item.key));
    const createData = buildRagSettingImportCandidates()
      .filter((item) => !existingKeys.has(item.key))
      .map((item) => ({
        key: item.key,
        value: normalizeOptionalText(item.value) ?? (item.value?.trim() || undefined),
      }))
      .filter((item): item is { key: string; value: string } => typeof item.value === "string" && item.value.length > 0);

    const shouldPreserveLegacyCollection = await shouldPreserveLegacyQdrantCollection();
    if (
      shouldPreserveLegacyCollection
      && !existingKeys.has(RAG_EMBEDDING_COLLECTION_MODE_KEY)
      && !existingKeys.has(RAG_EMBEDDING_COLLECTION_NAME_KEY)
    ) {
      createData.push(
        { key: RAG_EMBEDDING_COLLECTION_MODE_KEY, value: "manual" },
        { key: RAG_EMBEDDING_COLLECTION_NAME_KEY, value: ragConfig.qdrantCollection },
      );
    } else if (
      hasExplicitLegacyQdrantCollectionEnv()
      && !existingKeys.has(RAG_EMBEDDING_COLLECTION_NAME_KEY)
    ) {
      createData.push({ key: RAG_EMBEDDING_COLLECTION_NAME_KEY, value: ragConfig.qdrantCollection });
    }

    if (createData.length === 0) {
      return [];
    }

    await prisma.$transaction(
      createData.map((item) =>
        prisma.appSetting.create({
          data: item,
        })),
    );

    return createData.map((item) => item.key);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

async function importMissingEmbeddingProviderRecords(): Promise<string[]> {
  const providers: EmbeddingProvider[] = ["openai", "siliconflow"];
  try {
    const existingRecords = await prisma.aPIKey.findMany({
      where: {
        provider: {
          in: providers,
        },
      },
      select: {
        provider: true,
      },
    });

    const existingProviders = new Set(existingRecords.map((item) => item.provider));
    const createData = providers
      .filter((provider) => !existingProviders.has(provider))
      .map((provider) => {
        const apiKey = normalizeOptionalText(getProviderEnvApiKey(provider));
        const baseURL = normalizeOptionalText(getProviderEnvBaseUrl(provider));
        const model = normalizeOptionalText(getProviderEnvModel(provider));
        if (!apiKey && !baseURL && !model) {
          return null;
        }
        return {
          provider,
          key: apiKey ?? null,
          baseURL: baseURL ?? null,
          model: model ?? null,
          isActive: Boolean(apiKey),
          reasoningEnabled: true,
        };
      })
      .filter((item): item is {
        provider: EmbeddingProvider;
        key: string | null;
        baseURL: string | null;
        model: string | null;
        isActive: boolean;
        reasoningEnabled: boolean;
      } => item !== null);

    if (createData.length === 0) {
      return [];
    }

    await prisma.$transaction(
      createData.map((item) =>
        prisma.aPIKey.create({
          data: item,
        })),
    );

    return createData.map((item) => item.provider);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function initializeRagSettingsCompatibility(): Promise<RagCompatibilityBootstrapReport> {
  const [importedSettingKeys, importedProviderRecords] = await Promise.all([
    importMissingRagSettingsFromEnv(),
    importMissingEmbeddingProviderRecords(),
  ]);

  await getRagEmbeddingSettings();
  await getRagRuntimeSettings();

  return {
    importedSettingKeys,
    importedProviderRecords,
  };
}
