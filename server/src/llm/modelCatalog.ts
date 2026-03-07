import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { PROVIDERS } from "./providers";

interface ModelCacheItem {
  models: string[];
  cachedAt: number;
}

interface GetProviderModelsOptions {
  apiKey?: string;
  forceRefresh?: boolean;
}

const MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
const modelCache = new Map<LLMProvider, ModelCacheItem>();

function getProviderEnvBaseUrl(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_BASE_URL;
    case "siliconflow":
      return process.env.SILICONFLOW_BASE_URL;
    case "openai":
      return process.env.OPENAI_BASE_URL;
    case "anthropic":
      return process.env.ANTHROPIC_BASE_URL;
    case "grok":
      return process.env.XAI_BASE_URL;
    default:
      return undefined;
  }
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
}

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

function getFallbackModels(provider: LLMProvider): string[] {
  return uniqueModels(PROVIDERS[provider].models);
}

function getCachedModels(provider: LLMProvider): string[] | undefined {
  const item = modelCache.get(provider);
  if (!item) {
    return undefined;
  }
  const expired = Date.now() - item.cachedAt > MODEL_CACHE_TTL_MS;
  if (expired) {
    modelCache.delete(provider);
    return undefined;
  }
  return item.models;
}

function setCachedModels(provider: LLMProvider, models: string[]): string[] {
  const normalized = uniqueModels(models);
  if (normalized.length === 0) {
    return getFallbackModels(provider);
  }
  modelCache.set(provider, {
    models: normalized,
    cachedAt: Date.now(),
  });
  return normalized;
}

function parseModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const data = (payload as { data?: unknown; models?: unknown }).data ?? (payload as { models?: unknown }).models;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const candidate = (item as { id?: unknown; model?: unknown; name?: unknown }).id
        ?? (item as { model?: unknown }).model
        ?? (item as { name?: unknown }).name;
      return typeof candidate === "string" ? candidate : "";
    })
    .filter(Boolean);
}

async function fetchProviderModels(provider: LLMProvider, apiKey: string): Promise<string[]> {
  const baseURL = normalizeBaseUrl(getProviderEnvBaseUrl(provider) ?? PROVIDERS[provider].baseURL);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = process.env.ANTHROPIC_VERSION ?? "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${baseURL}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`拉取模型列表失败（${response.status}）：${detail || "未知错误"}`);
    }

    const payload = (await response.json()) as unknown;
    const models = parseModelIds(payload);
    if (models.length === 0) {
      throw new Error("模型列表为空。");
    }
    return models;
  } finally {
    clearTimeout(timer);
  }
}

export async function getProviderModels(
  provider: LLMProvider,
  options: GetProviderModelsOptions = {},
): Promise<string[]> {
  const fallback = getFallbackModels(provider);
  if (!options.forceRefresh) {
    const cached = getCachedModels(provider);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  if (!options.apiKey) {
    return fallback;
  }

  try {
    const models = await fetchProviderModels(provider, options.apiKey);
    return setCachedModels(provider, models);
  } catch {
    const cached = getCachedModels(provider);
    if (cached && cached.length > 0) {
      return cached;
    }
    return fallback;
  }
}

export async function refreshProviderModels(provider: LLMProvider, apiKey: string): Promise<string[]> {
  const models = await fetchProviderModels(provider, apiKey);
  return setCachedModels(provider, models);
}
