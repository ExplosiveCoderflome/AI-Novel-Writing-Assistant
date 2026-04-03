import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
  resolveProviderBaseUrl,
} from "./providers";

interface ModelCacheItem {
  models: string[];
  cachedAt: number;
}

interface GetProviderModelsOptions {
  apiKey?: string;
  baseURL?: string;
  forceRefresh?: boolean;
  allowAnonymous?: boolean;
  fallbackModel?: string;
  fallbackModels?: string[];
}

const MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
const modelCache = new Map<string, ModelCacheItem>();

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

function getFallbackModels(provider: LLMProvider, options: GetProviderModelsOptions = {}): string[] {
  const builtInModels = isBuiltInProvider(provider) ? PROVIDERS[provider].models : [];
  return uniqueModels([
    ...builtInModels,
    ...(options.fallbackModels ?? []),
    options.fallbackModel ?? "",
  ]);
}

function getCacheKey(provider: LLMProvider, baseURL?: string): string {
  const resolvedBaseURL = resolveProviderBaseUrl(provider, baseURL, baseURL) ?? "";
  return `${provider}::${resolvedBaseURL}`;
}

function getCachedModels(provider: LLMProvider, baseURL?: string): string[] | undefined {
  const cacheKey = getCacheKey(provider, baseURL);
  const item = modelCache.get(cacheKey);
  if (!item) {
    return undefined;
  }
  const expired = Date.now() - item.cachedAt > MODEL_CACHE_TTL_MS;
  if (expired) {
    modelCache.delete(cacheKey);
    return undefined;
  }
  return item.models;
}

function setCachedModels(provider: LLMProvider, models: string[], baseURL?: string): string[] {
  const normalized = uniqueModels(models);
  modelCache.set(getCacheKey(provider, baseURL), {
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

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`拉取模型列表失败（${response.status}）：${detail || "未知错误"}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(provider: LLMProvider, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (!apiKey) {
    return headers;
  }

  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = process.env.ANTHROPIC_VERSION ?? "2023-06-01";
    return headers;
  }

  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function fetchOllamaModels(baseURL: string): Promise<string[]> {
  const nativeBaseURL = baseURL.endsWith("/v1") ? baseURL.slice(0, -3) : baseURL;

  try {
    const payload = await fetchJson(`${nativeBaseURL}/api/tags`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    const models = parseModelIds(payload);
    if (models.length > 0) {
      return models;
    }
  } catch {
    // Fall back to the OpenAI-compatible models endpoint.
  }

  const payload = await fetchJson(`${baseURL}/models`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const models = parseModelIds(payload);
  if (models.length === 0) {
    throw new Error("模型列表为空。");
  }
  return models;
}

async function fetchProviderModels(
  provider: LLMProvider,
  apiKey?: string,
  customBaseURL?: string,
): Promise<string[]> {
  const baseURL = resolveProviderBaseUrl(provider, customBaseURL, customBaseURL);
  if (!baseURL) {
    throw new Error("未配置可用的 API URL。");
  }
  if (provider === "ollama") {
    return fetchOllamaModels(baseURL);
  }

  const payload = await fetchJson(`${baseURL}/models`, {
    method: "GET",
    headers: buildHeaders(provider, apiKey),
  });

  const models = parseModelIds(payload);
  if (models.length === 0) {
    throw new Error("模型列表为空。");
  }
  return models;
}

export async function getProviderModels(
  provider: LLMProvider,
  options: GetProviderModelsOptions = {},
): Promise<string[]> {
  const fallback = getFallbackModels(provider, options);
  if (!options.forceRefresh) {
    const cached = getCachedModels(provider, options.baseURL);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  const normalizedApiKey = options.apiKey?.trim();
  const allowAnonymous = options.allowAnonymous ?? !providerRequiresApiKey(provider);
  const canFetchRemotely = normalizedApiKey || allowAnonymous;
  if (!canFetchRemotely) {
    return fallback;
  }

  try {
    const models = await fetchProviderModels(provider, normalizedApiKey, options.baseURL);
    return models.length > 0 ? setCachedModels(provider, models, options.baseURL) : fallback;
  } catch {
    const cached = getCachedModels(provider, options.baseURL);
    if (cached && cached.length > 0) {
      return cached;
    }
    return fallback;
  }
}

export async function refreshProviderModels(
  provider: LLMProvider,
  apiKey?: string,
  baseURL?: string,
): Promise<string[]> {
  const models = await fetchProviderModels(provider, apiKey?.trim(), baseURL);
  return setCachedModels(provider, models, baseURL);
}
