import { prisma } from "../../db/prisma";
import { ragConfig, asEmbeddingProvider, type EmbeddingProvider } from "../../config/rag";
import { PROVIDERS } from "../../llm/providers";

const EMBEDDING_PROVIDER_KEY = "rag.embeddingProvider";
const EMBEDDING_MODEL_KEY = "rag.embeddingModel";
const EMBEDDING_COLLECTION_MODE_KEY = "rag.embeddingCollectionMode";
const EMBEDDING_COLLECTION_NAME_KEY = "rag.embeddingCollectionName";
const EMBEDDING_COLLECTION_TAG_KEY = "rag.embeddingCollectionTag";
const EMBEDDING_AUTO_REINDEX_KEY = "rag.embeddingAutoReindexOnChange";
const EMBEDDING_BATCH_SIZE_KEY = "rag.embeddingBatchSize";
const EMBEDDING_TIMEOUT_MS_KEY = "rag.embeddingTimeoutMs";
const EMBEDDING_MAX_RETRIES_KEY = "rag.embeddingMaxRetries";
const EMBEDDING_RETRY_BASE_MS_KEY = "rag.embeddingRetryBaseMs";

const DEFAULT_COLLECTION_NAME = "ai_novel_chunks_v1";

export type RagEmbeddingCollectionMode = "auto" | "manual";

export interface RagEmbeddingSettings {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionVersion: number;
  collectionMode: RagEmbeddingCollectionMode;
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
  suggestedCollectionName: string;
}

export interface RagEmbeddingSettingsInput {
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  collectionMode: RagEmbeddingCollectionMode;
  collectionName: string;
  collectionTag: string;
  autoReindexOnChange: boolean;
  embeddingBatchSize: number;
  embeddingTimeoutMs: number;
  embeddingMaxRetries: number;
  embeddingRetryBaseMs: number;
}

export interface RagEmbeddingProviderStatus {
  provider: EmbeddingProvider;
  name: string;
  isConfigured: boolean;
  isActive: boolean;
}

export interface SaveRagEmbeddingSettingsResult {
  settings: RagEmbeddingSettings;
  collectionChanged: boolean;
  modelChanged: boolean;
  providerChanged: boolean;
  shouldReindex: boolean;
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

function normalizeCollectionMode(value: string | undefined, fallback: RagEmbeddingCollectionMode): RagEmbeddingCollectionMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "manual") {
    return "manual";
  }
  if (normalized === "auto") {
    return "auto";
  }
  return fallback;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function slugifySegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function normalizeCollectionTag(value: string | undefined): string {
  return slugifySegment(value ?? "kb", "kb").slice(0, 32);
}

function normalizeCollectionName(value: string | undefined, fallback: string): string {
  return slugifySegment(value ?? fallback, slugifySegment(fallback, DEFAULT_COLLECTION_NAME)).slice(0, 120);
}

function buildAutoCollectionName(
  provider: EmbeddingProvider,
  model: string,
  tag: string,
): string {
  const name = [
    "ai",
    "novel",
    "rag",
    provider,
    slugifySegment(model, "embedding"),
    tag,
    `v${ragConfig.embeddingVersion}`,
  ].join("_");
  return normalizeCollectionName(name, DEFAULT_COLLECTION_NAME);
}

function getDefaultCollectionMode(): RagEmbeddingCollectionMode {
  return ragConfig.qdrantCollection === DEFAULT_COLLECTION_NAME ? "auto" : "manual";
}

function applyRagRuntimeSettings(settings: RagEmbeddingSettings): RagEmbeddingSettings {
  ragConfig.embeddingProvider = settings.embeddingProvider;
  ragConfig.embeddingModel = settings.embeddingModel;
  ragConfig.embeddingBatchSize = settings.embeddingBatchSize;
  ragConfig.embeddingTimeoutMs = settings.embeddingTimeoutMs;
  ragConfig.embeddingMaxRetries = settings.embeddingMaxRetries;
  ragConfig.embeddingRetryBaseMs = settings.embeddingRetryBaseMs;
  ragConfig.qdrantCollection = settings.collectionName;
  return settings;
}

function getDefaultSettings(): RagEmbeddingSettings {
  const collectionTag = normalizeCollectionTag("kb");
  const suggestedCollectionName = buildAutoCollectionName(
    ragConfig.embeddingProvider,
    normalizeEmbeddingModel(ragConfig.embeddingModel),
    collectionTag,
  );
  return {
    embeddingProvider: ragConfig.embeddingProvider,
    embeddingModel: normalizeEmbeddingModel(ragConfig.embeddingModel),
    collectionVersion: ragConfig.embeddingVersion,
    collectionMode: getDefaultCollectionMode(),
    collectionName: normalizeCollectionName(ragConfig.qdrantCollection, DEFAULT_COLLECTION_NAME),
    collectionTag,
    autoReindexOnChange: true,
    embeddingBatchSize: clampInt(ragConfig.embeddingBatchSize, 64, 1, 256),
    embeddingTimeoutMs: clampInt(ragConfig.embeddingTimeoutMs, 30000, 5000, 300000),
    embeddingMaxRetries: clampInt(ragConfig.embeddingMaxRetries, 2, 0, 8),
    embeddingRetryBaseMs: clampInt(ragConfig.embeddingRetryBaseMs, 500, 100, 10000),
    suggestedCollectionName,
  };
}

export async function getRagEmbeddingSettings(): Promise<RagEmbeddingSettings> {
  try {
    const records = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            EMBEDDING_PROVIDER_KEY,
            EMBEDDING_MODEL_KEY,
            EMBEDDING_COLLECTION_MODE_KEY,
            EMBEDDING_COLLECTION_NAME_KEY,
            EMBEDDING_COLLECTION_TAG_KEY,
            EMBEDDING_AUTO_REINDEX_KEY,
            EMBEDDING_BATCH_SIZE_KEY,
            EMBEDDING_TIMEOUT_MS_KEY,
            EMBEDDING_MAX_RETRIES_KEY,
            EMBEDDING_RETRY_BASE_MS_KEY,
          ],
        },
      },
    });
    const valueMap = new Map(records.map((item) => [item.key, item.value]));
    const defaults = getDefaultSettings();
    const embeddingProvider = asEmbeddingProvider(valueMap.get(EMBEDDING_PROVIDER_KEY) ?? defaults.embeddingProvider);
    const embeddingModel = normalizeEmbeddingModel(valueMap.get(EMBEDDING_MODEL_KEY) ?? defaults.embeddingModel);
    const collectionMode = normalizeCollectionMode(
      valueMap.get(EMBEDDING_COLLECTION_MODE_KEY),
      defaults.collectionMode,
    );
    const collectionTag = normalizeCollectionTag(valueMap.get(EMBEDDING_COLLECTION_TAG_KEY) ?? defaults.collectionTag);
    const suggestedCollectionName = buildAutoCollectionName(embeddingProvider, embeddingModel, collectionTag);
    const collectionName = normalizeCollectionName(
      valueMap.get(EMBEDDING_COLLECTION_NAME_KEY)
        ?? (collectionMode === "auto" ? suggestedCollectionName : defaults.collectionName),
      defaults.collectionName,
    );
    return applyRagRuntimeSettings({
      embeddingProvider,
      embeddingModel,
      collectionVersion: ragConfig.embeddingVersion,
      collectionMode,
      collectionName,
      collectionTag,
      autoReindexOnChange: toBoolean(valueMap.get(EMBEDDING_AUTO_REINDEX_KEY), defaults.autoReindexOnChange),
      embeddingBatchSize: clampInt(
        Number(valueMap.get(EMBEDDING_BATCH_SIZE_KEY)),
        defaults.embeddingBatchSize,
        1,
        256,
      ),
      embeddingTimeoutMs: clampInt(
        Number(valueMap.get(EMBEDDING_TIMEOUT_MS_KEY)),
        defaults.embeddingTimeoutMs,
        5000,
        300000,
      ),
      embeddingMaxRetries: clampInt(
        Number(valueMap.get(EMBEDDING_MAX_RETRIES_KEY)),
        defaults.embeddingMaxRetries,
        0,
        8,
      ),
      embeddingRetryBaseMs: clampInt(
        Number(valueMap.get(EMBEDDING_RETRY_BASE_MS_KEY)),
        defaults.embeddingRetryBaseMs,
        100,
        10000,
      ),
      suggestedCollectionName,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return applyRagRuntimeSettings(getDefaultSettings());
    }
    throw error;
  }
}

export async function saveRagEmbeddingSettings(input: RagEmbeddingSettingsInput): Promise<SaveRagEmbeddingSettingsResult> {
  const previous = await getRagEmbeddingSettings();
  const embeddingProvider = asEmbeddingProvider(input.embeddingProvider);
  const embeddingModel = normalizeEmbeddingModel(input.embeddingModel);
  const collectionMode = normalizeCollectionMode(input.collectionMode, previous.collectionMode);
  const collectionTag = normalizeCollectionTag(input.collectionTag || previous.collectionTag);
  const suggestedCollectionName = buildAutoCollectionName(embeddingProvider, embeddingModel, collectionTag);
  const collectionName = collectionMode === "auto"
    ? suggestedCollectionName
    : normalizeCollectionName(input.collectionName, previous.collectionName);
  const settings = applyRagRuntimeSettings({
    embeddingProvider,
    embeddingModel,
    collectionVersion: ragConfig.embeddingVersion,
    collectionMode,
    collectionName,
    collectionTag,
    autoReindexOnChange: Boolean(input.autoReindexOnChange),
    embeddingBatchSize: clampInt(input.embeddingBatchSize, previous.embeddingBatchSize, 1, 256),
    embeddingTimeoutMs: clampInt(input.embeddingTimeoutMs, previous.embeddingTimeoutMs, 5000, 300000),
    embeddingMaxRetries: clampInt(input.embeddingMaxRetries, previous.embeddingMaxRetries, 0, 8),
    embeddingRetryBaseMs: clampInt(input.embeddingRetryBaseMs, previous.embeddingRetryBaseMs, 100, 10000),
    suggestedCollectionName,
  });

  const providerChanged = previous.embeddingProvider !== settings.embeddingProvider;
  const modelChanged = previous.embeddingModel !== settings.embeddingModel;
  const collectionChanged = previous.collectionName !== settings.collectionName;

  const data = {
    embeddingProvider: settings.embeddingProvider,
    embeddingModel: settings.embeddingModel,
    collectionVersion: settings.collectionVersion,
    collectionMode: settings.collectionMode,
    collectionName: settings.collectionName,
    collectionTag: settings.collectionTag,
    autoReindexOnChange: settings.autoReindexOnChange,
    embeddingBatchSize: settings.embeddingBatchSize,
    embeddingTimeoutMs: settings.embeddingTimeoutMs,
    embeddingMaxRetries: settings.embeddingMaxRetries,
    embeddingRetryBaseMs: settings.embeddingRetryBaseMs,
    suggestedCollectionName: settings.suggestedCollectionName,
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
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_COLLECTION_MODE_KEY },
        update: { value: data.collectionMode },
        create: { key: EMBEDDING_COLLECTION_MODE_KEY, value: data.collectionMode },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_COLLECTION_NAME_KEY },
        update: { value: data.collectionName },
        create: { key: EMBEDDING_COLLECTION_NAME_KEY, value: data.collectionName },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_COLLECTION_TAG_KEY },
        update: { value: data.collectionTag },
        create: { key: EMBEDDING_COLLECTION_TAG_KEY, value: data.collectionTag },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_AUTO_REINDEX_KEY },
        update: { value: String(data.autoReindexOnChange) },
        create: { key: EMBEDDING_AUTO_REINDEX_KEY, value: String(data.autoReindexOnChange) },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_BATCH_SIZE_KEY },
        update: { value: String(data.embeddingBatchSize) },
        create: { key: EMBEDDING_BATCH_SIZE_KEY, value: String(data.embeddingBatchSize) },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_TIMEOUT_MS_KEY },
        update: { value: String(data.embeddingTimeoutMs) },
        create: { key: EMBEDDING_TIMEOUT_MS_KEY, value: String(data.embeddingTimeoutMs) },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_MAX_RETRIES_KEY },
        update: { value: String(data.embeddingMaxRetries) },
        create: { key: EMBEDDING_MAX_RETRIES_KEY, value: String(data.embeddingMaxRetries) },
      }),
      prisma.appSetting.upsert({
        where: { key: EMBEDDING_RETRY_BASE_MS_KEY },
        update: { value: String(data.embeddingRetryBaseMs) },
        create: { key: EMBEDDING_RETRY_BASE_MS_KEY, value: String(data.embeddingRetryBaseMs) },
      }),
    ]);
    return {
      settings,
      collectionChanged,
      modelChanged,
      providerChanged,
      shouldReindex: providerChanged || modelChanged || collectionChanged,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        settings,
        collectionChanged,
        modelChanged,
        providerChanged,
        shouldReindex: providerChanged || modelChanged || collectionChanged,
      };
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
