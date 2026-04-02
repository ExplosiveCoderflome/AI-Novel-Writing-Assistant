import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../db/prisma";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { resolveModelTemperature } from "./capabilities";
import { attachLLMDebugLogging } from "./debugLogging";
import { resolveModel, type TaskType } from "./modelRouter";
import {
  getProviderEnvApiKey,
  getProviderEnvModel,
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
  resolveProviderBaseUrl,
} from "./providers";

interface LLMOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  fallbackProvider?: LLMProvider;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
}

export interface ProviderSecret {
  key?: string;
  model?: string;
  baseURL?: string;
  displayName?: string;
}

export interface ResolvedLLMClientOptions {
  provider: LLMProvider;
  providerName: string;
  model: string;
  temperature: number;
  apiKey?: string;
  baseURL: string;
  maxTokens?: number;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
}

const providerSecrets = new Map<LLMProvider, ProviderSecret>();

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeProviderSecret(secret: ProviderSecret): ProviderSecret {
  return {
    key: normalizeOptionalText(secret.key),
    model: normalizeOptionalText(secret.model),
    baseURL: normalizeOptionalText(secret.baseURL),
    displayName: normalizeOptionalText(secret.displayName),
  };
}

function toProviderSecret(item: {
  key?: string | null;
  model?: string | null;
  baseURL?: string | null;
  displayName?: string | null;
}): ProviderSecret {
  return normalizeProviderSecret({
    key: item.key ?? undefined,
    model: item.model ?? undefined,
    baseURL: item.baseURL ?? undefined,
    displayName: item.displayName ?? undefined,
  });
}

export async function loadProviderApiKeys(): Promise<void> {
  try {
    const keys = await prisma.aPIKey.findMany({
      where: { isActive: true },
    });
    providerSecrets.clear();
    for (const item of keys) {
      providerSecrets.set(item.provider as LLMProvider, toProviderSecret(item));
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
}

export function setProviderSecretCache(provider: LLMProvider, secret: ProviderSecret | null): void {
  if (!secret) {
    providerSecrets.delete(provider);
    return;
  }
  providerSecrets.set(provider, normalizeProviderSecret(secret));
}

async function resolveProviderSecret(provider: LLMProvider): Promise<ProviderSecret | undefined> {
  const cached = providerSecrets.get(provider);
  if (cached) {
    return cached;
  }
  try {
    const secret = await prisma.aPIKey.findUnique({
      where: { provider },
    });
    if (!secret || !secret.isActive) {
      return undefined;
    }
    const value = toProviderSecret(secret);
    providerSecrets.set(provider, value);
    return value;
  } catch (error) {
    if (isMissingTableError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function resolveLLMClientOptions(
  provider?: LLMProvider,
  options: LLMOptions = {},
): Promise<ResolvedLLMClientOptions> {
  let resolvedProvider = provider ?? options.fallbackProvider ?? "deepseek";
  let resolvedModel = normalizeOptionalText(options.model);
  let resolvedTemperature: number | undefined = options.temperature;
  let resolvedMaxTokens: number | undefined = options.maxTokens;

  if (options.taskType) {
    const hasExplicitProvider = provider != null;
    const hasExplicitModel = options.model != null;
    const shouldUseRouteProvider = !hasExplicitProvider && !hasExplicitModel;
    const route = await resolveModel(options.taskType, {
      ...(shouldUseRouteProvider ? {} : { provider: resolvedProvider }),
      ...(options.model != null ? { model: options.model } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens != null ? { maxTokens: options.maxTokens } : {}),
    });
    if (shouldUseRouteProvider) {
      resolvedProvider = route.provider;
    }
    if (options.model == null && shouldUseRouteProvider) {
      resolvedModel = normalizeOptionalText(route.model);
    }
    if (options.temperature == null) {
      resolvedTemperature = route.temperature;
    }
    if (options.maxTokens == null) {
      resolvedMaxTokens = route.maxTokens;
    }
  }

  const dbSecret = await resolveProviderSecret(resolvedProvider);
  const providerName = isBuiltInProvider(resolvedProvider)
    ? PROVIDERS[resolvedProvider].name
    : dbSecret?.displayName ?? resolvedProvider;
  const apiKey = normalizeOptionalText(options.apiKey)
    ?? dbSecret?.key
    ?? getProviderEnvApiKey(resolvedProvider);

  if (!apiKey && providerRequiresApiKey(resolvedProvider)) {
    throw new Error(`未配置 ${providerName} 的 API Key。`);
  }

  const model = resolvedModel
    ?? dbSecret?.model
    ?? getProviderEnvModel(resolvedProvider)
    ?? (isBuiltInProvider(resolvedProvider) ? PROVIDERS[resolvedProvider].defaultModel : undefined);
  if (!model) {
    throw new Error(`未配置 ${providerName} 的默认模型。`);
  }

  const baseURL = resolveProviderBaseUrl(
    resolvedProvider,
    options.baseURL ?? dbSecret?.baseURL,
    dbSecret?.baseURL,
  );
  if (!baseURL) {
    throw new Error(`未配置 ${providerName} 的 API URL。`);
  }

  const temperature = resolveModelTemperature(resolvedProvider, model, resolvedTemperature);

  return {
    provider: resolvedProvider,
    providerName,
    model,
    temperature,
    apiKey,
    baseURL,
    maxTokens: resolvedMaxTokens,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
  };
}

export async function getLLM(provider?: LLMProvider, options: LLMOptions = {}): Promise<ChatOpenAI> {
  const resolved = await resolveLLMClientOptions(provider, options);

  const llm = new ChatOpenAI({
    apiKey: resolved.apiKey ?? "ollama",
    model: resolved.model,
    modelName: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    configuration: {
      baseURL: resolved.baseURL,
    },
  });

  return attachLLMDebugLogging(llm, {
    provider: resolved.provider,
    model: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    taskType: resolved.taskType,
    baseURL: resolved.baseURL,
    promptMeta: resolved.promptMeta,
  });
}
