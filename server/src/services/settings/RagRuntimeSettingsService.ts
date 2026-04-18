import { ragConfig } from "../../config/rag";
import { prisma } from "../../db/prisma";
import { isMissingTableError, normalizeOptionalText } from "./ragLegacyCompatibility";
import {
  CHUNK_OVERLAP_KEY,
  CHUNK_SIZE_KEY,
  FINAL_TOP_K_KEY,
  HTTP_TIMEOUT_MS_KEY,
  KEYWORD_CANDIDATES_KEY,
  QDRANT_API_KEY_KEY,
  QDRANT_TIMEOUT_MS_KEY,
  QDRANT_UPSERT_MAX_BYTES_KEY,
  QDRANT_URL_KEY,
  RAG_ENABLED_KEY,
  RAG_RUNTIME_SETTING_KEYS,
  VECTOR_CANDIDATES_KEY,
  WORKER_MAX_ATTEMPTS_KEY,
  WORKER_POLL_MS_KEY,
  WORKER_RETRY_BASE_MS_KEY,
} from "./ragSettingKeys";

const INITIAL_RAG_RUNTIME_DEFAULTS = {
  enabled: ragConfig.enabled,
  qdrantUrl: ragConfig.qdrantUrl,
  qdrantApiKey: ragConfig.qdrantApiKey,
  qdrantTimeoutMs: ragConfig.qdrantTimeoutMs,
  qdrantUpsertMaxBytes: ragConfig.qdrantUpsertMaxBytes,
  chunkSize: ragConfig.chunkSize,
  chunkOverlap: ragConfig.chunkOverlap,
  vectorCandidates: ragConfig.vectorCandidates,
  keywordCandidates: ragConfig.keywordCandidates,
  finalTopK: ragConfig.finalTopK,
  workerPollMs: ragConfig.workerPollMs,
  workerMaxAttempts: ragConfig.workerMaxAttempts,
  workerRetryBaseMs: ragConfig.workerRetryBaseMs,
  httpTimeoutMs: ragConfig.httpTimeoutMs,
} as const;

export interface RagRuntimeSettings {
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKeyConfigured: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
}

export interface RagRuntimeSettingsInput {
  enabled: boolean;
  qdrantUrl: string;
  qdrantApiKey?: string;
  clearQdrantApiKey?: boolean;
  qdrantTimeoutMs: number;
  qdrantUpsertMaxBytes: number;
  chunkSize: number;
  chunkOverlap: number;
  vectorCandidates: number;
  keywordCandidates: number;
  finalTopK: number;
  workerPollMs: number;
  workerMaxAttempts: number;
  workerRetryBaseMs: number;
  httpTimeoutMs: number;
}

export interface SaveRagRuntimeSettingsResult {
  settings: RagRuntimeSettings;
  connectionChanged: boolean;
  chunkingChanged: boolean;
  shouldReindex: boolean;
}

function normalizeUrl(value: string | undefined, fallback: string): string {
  const normalized = normalizeOptionalText(value) ?? normalizeOptionalText(fallback) ?? INITIAL_RAG_RUNTIME_DEFAULTS.qdrantUrl;
  return normalized.replace(/\/+$/, "");
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

function applyRagRuntimeSettings(
  settings: Omit<RagRuntimeSettings, "qdrantApiKeyConfigured">,
  qdrantApiKey: string,
): RagRuntimeSettings {
  ragConfig.enabled = settings.enabled;
  ragConfig.qdrantUrl = settings.qdrantUrl;
  ragConfig.qdrantApiKey = qdrantApiKey;
  ragConfig.qdrantTimeoutMs = settings.qdrantTimeoutMs;
  ragConfig.qdrantUpsertMaxBytes = settings.qdrantUpsertMaxBytes;
  ragConfig.chunkSize = settings.chunkSize;
  ragConfig.chunkOverlap = settings.chunkOverlap;
  ragConfig.vectorCandidates = settings.vectorCandidates;
  ragConfig.keywordCandidates = settings.keywordCandidates;
  ragConfig.finalTopK = settings.finalTopK;
  ragConfig.workerPollMs = settings.workerPollMs;
  ragConfig.workerMaxAttempts = settings.workerMaxAttempts;
  ragConfig.workerRetryBaseMs = settings.workerRetryBaseMs;
  ragConfig.httpTimeoutMs = settings.httpTimeoutMs;

  return {
    ...settings,
    qdrantApiKeyConfigured: Boolean(qdrantApiKey),
  };
}

function getDefaultSettings(): RagRuntimeSettings {
  return {
    enabled: INITIAL_RAG_RUNTIME_DEFAULTS.enabled,
    qdrantUrl: normalizeUrl(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantUrl, INITIAL_RAG_RUNTIME_DEFAULTS.qdrantUrl),
    qdrantApiKeyConfigured: Boolean(normalizeOptionalText(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantApiKey)),
    qdrantTimeoutMs: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantTimeoutMs, 30000, 1000, 300000),
    qdrantUpsertMaxBytes: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantUpsertMaxBytes, 24 * 1024 * 1024, 1024 * 1024, 64 * 1024 * 1024),
    chunkSize: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.chunkSize, 800, 200, 4000),
    chunkOverlap: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.chunkOverlap, 120, 0, 1000),
    vectorCandidates: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.vectorCandidates, 40, 1, 200),
    keywordCandidates: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.keywordCandidates, 40, 1, 200),
    finalTopK: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.finalTopK, 8, 1, 50),
    workerPollMs: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.workerPollMs, 2500, 200, 60000),
    workerMaxAttempts: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.workerMaxAttempts, 5, 1, 20),
    workerRetryBaseMs: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.workerRetryBaseMs, 5000, 1000, 300000),
    httpTimeoutMs: clampInt(INITIAL_RAG_RUNTIME_DEFAULTS.httpTimeoutMs, 30000, 1000, 300000),
  };
}

async function getValueMap(): Promise<Map<string, string>> {
  const records = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [...RAG_RUNTIME_SETTING_KEYS],
      },
    },
  });
  return new Map(records.map((item) => [item.key, item.value]));
}

export async function getRagRuntimeSettings(): Promise<RagRuntimeSettings> {
  const defaults = getDefaultSettings();
  try {
    const valueMap = await getValueMap();
    const qdrantApiKey = normalizeOptionalText(valueMap.get(QDRANT_API_KEY_KEY))
      ?? normalizeOptionalText(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantApiKey)
      ?? "";

    return applyRagRuntimeSettings({
      enabled: toBoolean(valueMap.get(RAG_ENABLED_KEY), defaults.enabled),
      qdrantUrl: normalizeUrl(valueMap.get(QDRANT_URL_KEY), defaults.qdrantUrl),
      qdrantTimeoutMs: clampInt(
        Number(valueMap.get(QDRANT_TIMEOUT_MS_KEY)),
        defaults.qdrantTimeoutMs,
        1000,
        300000,
      ),
      qdrantUpsertMaxBytes: clampInt(
        Number(valueMap.get(QDRANT_UPSERT_MAX_BYTES_KEY)),
        defaults.qdrantUpsertMaxBytes,
        1024 * 1024,
        64 * 1024 * 1024,
      ),
      chunkSize: clampInt(Number(valueMap.get(CHUNK_SIZE_KEY)), defaults.chunkSize, 200, 4000),
      chunkOverlap: clampInt(Number(valueMap.get(CHUNK_OVERLAP_KEY)), defaults.chunkOverlap, 0, 1000),
      vectorCandidates: clampInt(Number(valueMap.get(VECTOR_CANDIDATES_KEY)), defaults.vectorCandidates, 1, 200),
      keywordCandidates: clampInt(Number(valueMap.get(KEYWORD_CANDIDATES_KEY)), defaults.keywordCandidates, 1, 200),
      finalTopK: clampInt(Number(valueMap.get(FINAL_TOP_K_KEY)), defaults.finalTopK, 1, 50),
      workerPollMs: clampInt(Number(valueMap.get(WORKER_POLL_MS_KEY)), defaults.workerPollMs, 200, 60000),
      workerMaxAttempts: clampInt(Number(valueMap.get(WORKER_MAX_ATTEMPTS_KEY)), defaults.workerMaxAttempts, 1, 20),
      workerRetryBaseMs: clampInt(
        Number(valueMap.get(WORKER_RETRY_BASE_MS_KEY)),
        defaults.workerRetryBaseMs,
        1000,
        300000,
      ),
      httpTimeoutMs: clampInt(Number(valueMap.get(HTTP_TIMEOUT_MS_KEY)), defaults.httpTimeoutMs, 1000, 300000),
    }, qdrantApiKey);
  } catch (error) {
    if (isMissingTableError(error)) {
      return applyRagRuntimeSettings({
        enabled: defaults.enabled,
        qdrantUrl: defaults.qdrantUrl,
        qdrantTimeoutMs: defaults.qdrantTimeoutMs,
        qdrantUpsertMaxBytes: defaults.qdrantUpsertMaxBytes,
        chunkSize: defaults.chunkSize,
        chunkOverlap: defaults.chunkOverlap,
        vectorCandidates: defaults.vectorCandidates,
        keywordCandidates: defaults.keywordCandidates,
        finalTopK: defaults.finalTopK,
        workerPollMs: defaults.workerPollMs,
        workerMaxAttempts: defaults.workerMaxAttempts,
        workerRetryBaseMs: defaults.workerRetryBaseMs,
        httpTimeoutMs: defaults.httpTimeoutMs,
      }, normalizeOptionalText(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantApiKey) ?? "");
    }
    throw error;
  }
}

export async function saveRagRuntimeSettings(
  input: RagRuntimeSettingsInput,
): Promise<SaveRagRuntimeSettingsResult> {
  const previous = await getRagRuntimeSettings();
  let existingQdrantApiKey = normalizeOptionalText(INITIAL_RAG_RUNTIME_DEFAULTS.qdrantApiKey) ?? "";

  try {
    const valueMap = await getValueMap();
    existingQdrantApiKey = normalizeOptionalText(valueMap.get(QDRANT_API_KEY_KEY)) ?? existingQdrantApiKey;
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const qdrantApiKey = input.clearQdrantApiKey
    ? ""
    : normalizeOptionalText(input.qdrantApiKey) ?? existingQdrantApiKey;

  const settings = applyRagRuntimeSettings({
    enabled: Boolean(input.enabled),
    qdrantUrl: normalizeUrl(input.qdrantUrl, previous.qdrantUrl),
    qdrantTimeoutMs: clampInt(input.qdrantTimeoutMs, previous.qdrantTimeoutMs, 1000, 300000),
    qdrantUpsertMaxBytes: clampInt(
      input.qdrantUpsertMaxBytes,
      previous.qdrantUpsertMaxBytes,
      1024 * 1024,
      64 * 1024 * 1024,
    ),
    chunkSize: clampInt(input.chunkSize, previous.chunkSize, 200, 4000),
    chunkOverlap: clampInt(input.chunkOverlap, previous.chunkOverlap, 0, 1000),
    vectorCandidates: clampInt(input.vectorCandidates, previous.vectorCandidates, 1, 200),
    keywordCandidates: clampInt(input.keywordCandidates, previous.keywordCandidates, 1, 200),
    finalTopK: clampInt(input.finalTopK, previous.finalTopK, 1, 50),
    workerPollMs: clampInt(input.workerPollMs, previous.workerPollMs, 200, 60000),
    workerMaxAttempts: clampInt(input.workerMaxAttempts, previous.workerMaxAttempts, 1, 20),
    workerRetryBaseMs: clampInt(input.workerRetryBaseMs, previous.workerRetryBaseMs, 1000, 300000),
    httpTimeoutMs: clampInt(input.httpTimeoutMs, previous.httpTimeoutMs, 1000, 300000),
  }, qdrantApiKey);

  const connectionChanged = previous.qdrantUrl !== settings.qdrantUrl;
  const chunkingChanged = previous.chunkSize !== settings.chunkSize
    || previous.chunkOverlap !== settings.chunkOverlap;

  const writeOperations = [
    prisma.appSetting.upsert({
      where: { key: RAG_ENABLED_KEY },
      update: { value: String(settings.enabled) },
      create: { key: RAG_ENABLED_KEY, value: String(settings.enabled) },
    }),
    prisma.appSetting.upsert({
      where: { key: QDRANT_URL_KEY },
      update: { value: settings.qdrantUrl },
      create: { key: QDRANT_URL_KEY, value: settings.qdrantUrl },
    }),
    prisma.appSetting.upsert({
      where: { key: QDRANT_TIMEOUT_MS_KEY },
      update: { value: String(settings.qdrantTimeoutMs) },
      create: { key: QDRANT_TIMEOUT_MS_KEY, value: String(settings.qdrantTimeoutMs) },
    }),
    prisma.appSetting.upsert({
      where: { key: QDRANT_UPSERT_MAX_BYTES_KEY },
      update: { value: String(settings.qdrantUpsertMaxBytes) },
      create: { key: QDRANT_UPSERT_MAX_BYTES_KEY, value: String(settings.qdrantUpsertMaxBytes) },
    }),
    prisma.appSetting.upsert({
      where: { key: CHUNK_SIZE_KEY },
      update: { value: String(settings.chunkSize) },
      create: { key: CHUNK_SIZE_KEY, value: String(settings.chunkSize) },
    }),
    prisma.appSetting.upsert({
      where: { key: CHUNK_OVERLAP_KEY },
      update: { value: String(settings.chunkOverlap) },
      create: { key: CHUNK_OVERLAP_KEY, value: String(settings.chunkOverlap) },
    }),
    prisma.appSetting.upsert({
      where: { key: VECTOR_CANDIDATES_KEY },
      update: { value: String(settings.vectorCandidates) },
      create: { key: VECTOR_CANDIDATES_KEY, value: String(settings.vectorCandidates) },
    }),
    prisma.appSetting.upsert({
      where: { key: KEYWORD_CANDIDATES_KEY },
      update: { value: String(settings.keywordCandidates) },
      create: { key: KEYWORD_CANDIDATES_KEY, value: String(settings.keywordCandidates) },
    }),
    prisma.appSetting.upsert({
      where: { key: FINAL_TOP_K_KEY },
      update: { value: String(settings.finalTopK) },
      create: { key: FINAL_TOP_K_KEY, value: String(settings.finalTopK) },
    }),
    prisma.appSetting.upsert({
      where: { key: WORKER_POLL_MS_KEY },
      update: { value: String(settings.workerPollMs) },
      create: { key: WORKER_POLL_MS_KEY, value: String(settings.workerPollMs) },
    }),
    prisma.appSetting.upsert({
      where: { key: WORKER_MAX_ATTEMPTS_KEY },
      update: { value: String(settings.workerMaxAttempts) },
      create: { key: WORKER_MAX_ATTEMPTS_KEY, value: String(settings.workerMaxAttempts) },
    }),
    prisma.appSetting.upsert({
      where: { key: WORKER_RETRY_BASE_MS_KEY },
      update: { value: String(settings.workerRetryBaseMs) },
      create: { key: WORKER_RETRY_BASE_MS_KEY, value: String(settings.workerRetryBaseMs) },
    }),
    prisma.appSetting.upsert({
      where: { key: HTTP_TIMEOUT_MS_KEY },
      update: { value: String(settings.httpTimeoutMs) },
      create: { key: HTTP_TIMEOUT_MS_KEY, value: String(settings.httpTimeoutMs) },
    }),
  ];

  try {
    await prisma.$transaction([
      ...writeOperations,
      ...(qdrantApiKey
        ? [prisma.appSetting.upsert({
          where: { key: QDRANT_API_KEY_KEY },
          update: { value: qdrantApiKey },
          create: { key: QDRANT_API_KEY_KEY, value: qdrantApiKey },
        })]
        : [prisma.appSetting.deleteMany({
          where: { key: QDRANT_API_KEY_KEY },
        })]),
    ]);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return {
    settings,
    connectionChanged,
    chunkingChanged,
    shouldReindex: connectionChanged || chunkingChanged,
  };
}
