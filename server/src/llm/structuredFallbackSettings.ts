import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../db/prisma";

const STRUCTURED_FALLBACK_ENABLED_KEY = "structuredFallback.enabled";
const STRUCTURED_FALLBACK_PROVIDER_KEY = "structuredFallback.provider";
const STRUCTURED_FALLBACK_MODEL_KEY = "structuredFallback.model";
const STRUCTURED_FALLBACK_TEMPERATURE_KEY = "structuredFallback.temperature";
const STRUCTURED_FALLBACK_MAX_TOKENS_KEY = "structuredFallback.maxTokens";
const STRUCTURED_FALLBACK_RETRY_COUNT_KEY = "structuredFallback.retryCount";

const DEFAULT_STRUCTURED_FALLBACK_SETTINGS: StructuredFallbackSettings = {
  enabled: false,
  provider: "deepseek",
  model: "deepseek-chat",
  temperature: 0.2,
  maxTokens: null,
  retryCount: 1,
};

let cachedSettings: StructuredFallbackSettings | null = null;

export interface StructuredFallbackSettings {
  enabled: boolean;
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number | null;
  retryCount: number;
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeProvider(value: string | undefined | null): LLMProvider {
  const trimmed = value?.trim();
  return (trimmed || DEFAULT_STRUCTURED_FALLBACK_SETTINGS.provider) as LLMProvider;
}

function normalizeModel(value: string | undefined | null): string {
  return value?.trim() || DEFAULT_STRUCTURED_FALLBACK_SETTINGS.model;
}

function clampTemperature(value: number | undefined | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_STRUCTURED_FALLBACK_SETTINGS.temperature;
  }
  return Math.min(2, Math.max(0, value));
}

function normalizeMaxTokens(value: number | string | undefined | null): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_STRUCTURED_FALLBACK_SETTINGS.maxTokens;
  }
  const normalized = Math.floor(numeric);
  if (normalized < 64) {
    return 64;
  }
  return Math.min(32768, normalized);
}

function normalizeRetryCount(value: number | string | undefined | null): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_STRUCTURED_FALLBACK_SETTINGS.retryCount;
  }
  return Math.min(3, Math.max(0, Math.floor(numeric)));
}

function buildSettingsFromEntries(entries: Map<string, string>): StructuredFallbackSettings {
  return {
    enabled: entries.get(STRUCTURED_FALLBACK_ENABLED_KEY) === "true",
    provider: normalizeProvider(entries.get(STRUCTURED_FALLBACK_PROVIDER_KEY)),
    model: normalizeModel(entries.get(STRUCTURED_FALLBACK_MODEL_KEY)),
    temperature: clampTemperature(Number(entries.get(STRUCTURED_FALLBACK_TEMPERATURE_KEY))),
    maxTokens: normalizeMaxTokens(entries.get(STRUCTURED_FALLBACK_MAX_TOKENS_KEY)),
    retryCount: normalizeRetryCount(entries.get(STRUCTURED_FALLBACK_RETRY_COUNT_KEY)),
  };
}

export async function getStructuredFallbackSettings(forceRefresh = false): Promise<StructuredFallbackSettings> {
  if (!forceRefresh && cachedSettings) {
    return cachedSettings;
  }
  try {
    const rows = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            STRUCTURED_FALLBACK_ENABLED_KEY,
            STRUCTURED_FALLBACK_PROVIDER_KEY,
            STRUCTURED_FALLBACK_MODEL_KEY,
            STRUCTURED_FALLBACK_TEMPERATURE_KEY,
            STRUCTURED_FALLBACK_MAX_TOKENS_KEY,
            STRUCTURED_FALLBACK_RETRY_COUNT_KEY,
          ],
        },
      },
    });
    const valueMap = new Map(rows.map((item) => [item.key, item.value]));
    cachedSettings = buildSettingsFromEntries(valueMap);
    return cachedSettings;
  } catch (error) {
    if (isMissingTableError(error)) {
      cachedSettings = { ...DEFAULT_STRUCTURED_FALLBACK_SETTINGS };
      return cachedSettings;
    }
    throw error;
  }
}

export async function saveStructuredFallbackSettings(input: Partial<StructuredFallbackSettings>): Promise<StructuredFallbackSettings> {
  const previous = await getStructuredFallbackSettings(true);
  const next: StructuredFallbackSettings = {
    enabled: input.enabled ?? previous.enabled,
    provider: normalizeProvider(input.provider ?? previous.provider),
    model: normalizeModel(input.model ?? previous.model),
    temperature: clampTemperature(input.temperature ?? previous.temperature),
    maxTokens: normalizeMaxTokens(input.maxTokens ?? previous.maxTokens),
    retryCount: normalizeRetryCount(input.retryCount ?? previous.retryCount),
  };
  try {
    await prisma.$transaction([
      prisma.appSetting.upsert({
        where: { key: STRUCTURED_FALLBACK_ENABLED_KEY },
        update: { value: String(next.enabled) },
        create: { key: STRUCTURED_FALLBACK_ENABLED_KEY, value: String(next.enabled) },
      }),
      prisma.appSetting.upsert({
        where: { key: STRUCTURED_FALLBACK_PROVIDER_KEY },
        update: { value: next.provider },
        create: { key: STRUCTURED_FALLBACK_PROVIDER_KEY, value: next.provider },
      }),
      prisma.appSetting.upsert({
        where: { key: STRUCTURED_FALLBACK_MODEL_KEY },
        update: { value: next.model },
        create: { key: STRUCTURED_FALLBACK_MODEL_KEY, value: next.model },
      }),
      prisma.appSetting.upsert({
        where: { key: STRUCTURED_FALLBACK_TEMPERATURE_KEY },
        update: { value: String(next.temperature) },
        create: { key: STRUCTURED_FALLBACK_TEMPERATURE_KEY, value: String(next.temperature) },
      }),
      prisma.appSetting.upsert({
        where: { key: STRUCTURED_FALLBACK_MAX_TOKENS_KEY },
        update: { value: next.maxTokens == null ? "" : String(next.maxTokens) },
        create: { key: STRUCTURED_FALLBACK_MAX_TOKENS_KEY, value: next.maxTokens == null ? "" : String(next.maxTokens) },
      }),
      prisma.appSetting.upsert({
        where: { key: STRUCTURED_FALLBACK_RETRY_COUNT_KEY },
        update: { value: String(next.retryCount) },
        create: { key: STRUCTURED_FALLBACK_RETRY_COUNT_KEY, value: String(next.retryCount) },
      }),
    ]);
    cachedSettings = next;
    return next;
  } catch (error) {
    if (isMissingTableError(error)) {
      cachedSettings = next;
      return next;
    }
    throw error;
  }
}
