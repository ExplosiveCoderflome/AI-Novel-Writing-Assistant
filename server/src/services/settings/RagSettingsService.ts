import { prisma } from "../../db/prisma";
import { ragConfig, asEmbeddingProvider, type EmbeddingProvider } from "../../config/rag";
import { PROVIDERS } from "../../llm/providers";

const EMBEDDING_PROVIDER_KEY = "rag.embeddingProvider";
const EMBEDDING_MODEL_KEY = "rag.embeddingModel";

export interface RagEmbeddingSettings {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
}

export interface RagEmbeddingProviderStatus {
  provider: EmbeddingProvider;
  name: string;
  isConfigured: boolean;
  isActive: boolean;
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeEmbeddingModel(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : ragConfig.embeddingModel;
}

function getDefaultSettings(): RagEmbeddingSettings {
  return {
    embeddingProvider: ragConfig.embeddingProvider,
    embeddingModel: normalizeEmbeddingModel(ragConfig.embeddingModel),
  };
}

export async function getRagEmbeddingSettings(): Promise<RagEmbeddingSettings> {
  try {
    const records = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [EMBEDDING_PROVIDER_KEY, EMBEDDING_MODEL_KEY],
        },
      },
    });
    const valueMap = new Map(records.map((item) => [item.key, item.value]));
    const defaults = getDefaultSettings();
    return {
      embeddingProvider: asEmbeddingProvider(valueMap.get(EMBEDDING_PROVIDER_KEY) ?? defaults.embeddingProvider),
      embeddingModel: normalizeEmbeddingModel(valueMap.get(EMBEDDING_MODEL_KEY) ?? defaults.embeddingModel),
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return getDefaultSettings();
    }
    throw error;
  }
}

export async function saveRagEmbeddingSettings(input: RagEmbeddingSettings): Promise<RagEmbeddingSettings> {
  const data = {
    embeddingProvider: asEmbeddingProvider(input.embeddingProvider),
    embeddingModel: normalizeEmbeddingModel(input.embeddingModel),
  };
  try {
    await prisma.$transaction([
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_PROVIDER_KEY },
        update: { value: data.embeddingProvider },
        create: { key: EMBEDDING_PROVIDER_KEY, value: data.embeddingProvider },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_MODEL_KEY },
        update: { value: data.embeddingModel },
        create: { key: EMBEDDING_MODEL_KEY, value: data.embeddingModel },
      }),
    ]);
    return data;
  } catch (error) {
    if (isMissingTableError(error)) {
      return data;
    }
    throw error;
  }
}

export async function getRagEmbeddingProviders(): Promise<RagEmbeddingProviderStatus[]> {
  const providers: EmbeddingProvider[] = ["openai", "siliconflow"];
  const items = await prisma.aPIKey.findMany({
    where: {
      provider: {
        in: providers,
      },
    },
  });
  const itemMap = new Map(items.map((item) => [item.provider, item]));
  return providers.map((provider) => {
    const item = itemMap.get(provider);
    return {
      provider,
      name: PROVIDERS[provider].name,
      isConfigured: Boolean(item?.key),
      isActive: item?.isActive ?? false,
    };
  });
}
