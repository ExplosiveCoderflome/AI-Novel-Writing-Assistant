import { normalizeApiBaseURL, originBoundFetch, assertApiResponse } from "./protocols/transport";
import { resolveProtocol } from "./protocols/ProtocolPolicy";
import { getModelTokenSettings } from "../services/settings/modelTokens";
import { secretStore } from "../services/settings/secretStore";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import type { LLMProvider, ProviderAuthMode } from "@ai-novel/shared/types/llm";
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
  authMode?: ProviderAuthMode;
  forceRefresh?: boolean;
  allowAnonymous?: boolean;
  fallbackModel?: string;
  fallbackModels?: string[];
  includeBuiltInFallback?: boolean;
}

const MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
const modelCache = new Map<string, ModelCacheItem>();

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

export function parseModelList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? uniqueModels(parsed.filter((item): item is string => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

export function parseHiddenModels(value: string | null | undefined): string[] {
  return parseModelList(value);
}

export function serializeHiddenModels(models: string[]): string {
  return JSON.stringify(uniqueModels(models));
}

export function serializeModelList(models: string[]): string {
  return JSON.stringify(uniqueModels(models));
}

export function filterHiddenModels(
  models: string[],
  hiddenModels: string[],
  currentModel?: string,
): string[] {
  const hidden = new Set(hiddenModels);
  const current = currentModel?.trim();
  return uniqueModels(models).filter((model) => model === current || !hidden.has(model));
}

function getFallbackModels(provider: LLMProvider, options: GetProviderModelsOptions = {}): string[] {
  const builtInModels = options.includeBuiltInFallback === false
    ? []
    : isBuiltInProvider(provider) ? PROVIDERS[provider].models : [];
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
    const response = await originBoundFetch(url)(url, {
      ...init,
      signal: controller.signal,
    });

    const h=new Headers(init.headers);const credential=h.get("x-api-key") ?? h.get("x-goog-api-key") ?? h.get("authorization")?.replace(/^Bearer /i,"");
    await assertApiResponse(response,credential ?? undefined);
    try{return await response.json();}catch(error){if(error instanceof SyntaxError)throw new Error("模型列表响应不是合法 JSON，请检查接口模式和 API URL；可手动填写模型 ID。");throw error;}
  } finally {
    clearTimeout(timer);
  }
}

export function buildProviderModelHeaders(
  provider: LLMProvider,
  apiKey?: string,
  authMode: ProviderAuthMode = "bearer",
): Record<string, string> {
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

  if (!isBuiltInProvider(provider) && authMode === "none") {
    return headers;
  }

  if (!isBuiltInProvider(provider) && authMode === "x-api-key") {
    headers["x-api-key"] = apiKey;
    return headers;
  }

  headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export function resolveModelsEndpoint(baseURL: string): string {
  return `${normalizeApiBaseURL(baseURL)}/models`;
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

  const payload = await fetchJson(resolveModelsEndpoint(baseURL), {
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
  authMode?: ProviderAuthMode,
): Promise<string[]> {
  const baseURL = resolveProviderBaseUrl(provider, customBaseURL, customBaseURL);
  if (!baseURL) {
    throw new Error("未配置可用的 API URL。");
  }
  if (provider === "ollama") {
    return fetchOllamaModels(baseURL);
  }

  const saved=await secretStore.getProvider(provider).catch(()=>null);
  const settings=await getModelTokenSettings(provider,saved?.model ?? "");
  const protocol=resolveProtocol("auto",settings.requestProtocol,baseURL);
  const normalized=normalizeApiBaseURL(baseURL,protocol);
  const headers:Record<string,string>={Accept:"application/json"};
  if(apiKey && authMode!=="none") {
    if(protocol === "anthropic") {headers["x-api-key"]=apiKey;headers["anthropic-version"]="2023-06-01";}
    else if(protocol === "gemini") headers["x-goog-api-key"]=apiKey;
    else if(authMode === "x-api-key") headers["x-api-key"]=apiKey;
    else headers.Authorization=`Bearer ${apiKey}`;
  }
  return fetchPaginatedModels(normalized,protocol,headers);
}

export async function fetchPaginatedModels(baseURL:string, protocol:ModelRouteRequestProtocol, headers:Record<string,string>={}):Promise<string[]> {
  const normalized=normalizeApiBaseURL(baseURL,protocol), origin=new URL(normalized).origin;
  let next=`${normalized}/models`; const seen=new Set<string>(), models:string[]=[];
  for(let page=0;page<50;page++) {
    if(new URL(next).origin !== origin) throw new Error("模型列表的下一页指向其他域名，已停止；可手动填写模型 ID。");
    if(seen.has(next)) throw new Error("模型列表分页重复，已停止；可手动填写模型 ID。");
    seen.add(next);
    const data=await fetchJson(next,{method:"GET",headers}) as any;
    const catalog=protocol === "gemini" && Array.isArray(data.models) ? {...data,models:data.models.filter((item:any)=>!Array.isArray(item.supportedGenerationMethods) || item.supportedGenerationMethods.some((method:string)=>method === "generateContent" || method === "streamGenerateContent"))} : data;
    models.push(...parseModelIds(catalog).map(id=>protocol === "gemini"?id.replace(/^models\//, ""):id));
    if(models.length>10000) throw new Error("模型列表超过分页保护范围，请手动填写模型 ID。");
    if(data.nextPageToken) {const u=new URL(`${normalized}/models`);u.searchParams.set("pageToken",data.nextPageToken);next=u.href;}
    else if(data.has_more) {
      const last=data.last_id ?? data.data?.at(-1)?.id;
      if(!last) throw new Error("模型列表缺少下一页游标。");
      const u=new URL(`${normalized}/models`);u.searchParams.set("after_id",last);next=u.href;
    } else if(typeof data.next === "string" && data.next) next=new URL(data.next,next).href;
    else {const result=uniqueModels(models);if(!result.length)throw new Error("模型列表为空；可手动填写模型 ID。");return result;}
  }
  throw new Error("模型列表分页未结束，请手动填写模型 ID。");
}


export async function getProviderModels(
  provider: LLMProvider,
  options: GetProviderModelsOptions = {},
): Promise<string[]> {
  const fallback = getFallbackModels(provider, options);
  if (!options.forceRefresh) {
    const cached = getCachedModels(provider, options.baseURL);
    if (cached && cached.length > 0) {
      return uniqueModels([...cached,...fallback]);
    }
  }

  const normalizedApiKey = options.apiKey?.trim();
  const allowAnonymous = options.allowAnonymous ?? !providerRequiresApiKey(provider);
  const canFetchRemotely = normalizedApiKey || allowAnonymous;
  if (!canFetchRemotely) {
    return fallback;
  }

  try {
    const models = await fetchProviderModels(provider, normalizedApiKey, options.baseURL, options.authMode);
    return models.length > 0 ? setCachedModels(provider, uniqueModels([...models,...fallback]), options.baseURL) : fallback;
  } catch {
    const cached = getCachedModels(provider, options.baseURL);
    if (cached && cached.length > 0) {
      return uniqueModels([...cached,...fallback]);
    }
    return fallback;
  }
}

export async function refreshProviderModels(
  provider: LLMProvider,
  apiKey?: string,
  baseURL?: string,
  authMode?: ProviderAuthMode,
): Promise<string[]> {
  const models = await fetchProviderModels(provider, apiKey?.trim(), baseURL, authMode);
  return setCachedModels(provider, models, baseURL);
}
