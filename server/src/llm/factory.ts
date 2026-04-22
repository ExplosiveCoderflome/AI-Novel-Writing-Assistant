import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { ChatOpenAI } from "@langchain/openai";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { secretStore } from "../services/settings/secretStore";
import { createAnthropicMessagesTransport } from "./anthropicTransport";
import { resolveModelTemperature } from "./capabilities";
import { attachLLMDebugLogging } from "./debugLogging";
import { resolveProviderReasoningBehavior } from "./reasoning";
import {
  resolveStructuredOutputProfile,
  type StructuredExecutionMode,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { resolveTransportProtocol, type TransportProtocol } from "./transportRouting";
import { attachLLMUsageTracking } from "./usageTracking";
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
  timeoutMs?: number;
  maxRetries?: number;
  reasoningEnabled?: boolean;
  executionMode?: StructuredExecutionMode;
  structuredStrategy?: StructuredOutputStrategy;
  modelKwargs?: Record<string, unknown>;
  fallbackProvider?: LLMProvider;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
}

export interface ProviderSecret {
  key?: string;
  model?: string;
  baseURL?: string;
  displayName?: string;
  reasoningEnabled?: boolean;
}

export interface ResolvedLLMClientOptions {
  provider: LLMProvider;
  providerName: string;
  model: string;
  transportProtocol: TransportProtocol;
  temperature: number;
  apiKey?: string;
  baseURL: string;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries: number;
  reasoningEnabled: boolean;
  modelKwargs?: Record<string, unknown>;
  includeRawResponse: boolean;
  executionMode: StructuredExecutionMode;
  structuredProfile?: StructuredOutputProfile | null;
  structuredStrategy?: StructuredOutputStrategy | null;
  reasoningForcedOff: boolean;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
}

const providerSecrets = new Map<LLMProvider, ProviderSecret>();
const RESOLVED_LLM_OPTIONS = Symbol("RESOLVED_LLM_OPTIONS");
const DEFAULT_LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 600000);
const DEFAULT_LLM_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);

type ChatOpenAIWithResolvedOptions = ChatOpenAI & {
  [RESOLVED_LLM_OPTIONS]?: ResolvedLLMClientOptions;
};

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
    reasoningEnabled: secret.reasoningEnabled ?? true,
  };
}

function normalizeTimeoutMs(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value == null || value <= 0) {
    return undefined;
  }
  return Math.trunc(value);
}

function normalizeMaxRetries(value: number | undefined): number {
  if (!Number.isFinite(value) || value == null || value < 0) {
    return DEFAULT_LLM_MAX_RETRIES;
  }
  return Math.trunc(value);
}

function toProviderSecret(item: {
  key?: string | null;
  model?: string | null;
  baseURL?: string | null;
  displayName?: string | null;
  reasoningEnabled?: boolean | null;
}): ProviderSecret {
  return normalizeProviderSecret({
    key: item.key ?? undefined,
    model: item.model ?? undefined,
    baseURL: item.baseURL ?? undefined,
    displayName: item.displayName ?? undefined,
    reasoningEnabled: item.reasoningEnabled ?? undefined,
  });
}

export async function loadProviderApiKeys(): Promise<void> {
  try {
    const keys = await secretStore.listProviders({ onlyActive: true });
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
    const secret = await secretStore.getProvider(provider);
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

  const explicitApiKey = normalizeOptionalText(options.apiKey);
  const explicitBaseURL = normalizeOptionalText(options.baseURL);
  const canResolveWithoutDb = Boolean(
    explicitApiKey
    && resolvedModel
    && (explicitBaseURL || isBuiltInProvider(resolvedProvider)),
  );
  const dbSecret = canResolveWithoutDb
    ? undefined
    : await resolveProviderSecret(resolvedProvider);
  const providerName = isBuiltInProvider(resolvedProvider)
    ? PROVIDERS[resolvedProvider].name
    : dbSecret?.displayName ?? resolvedProvider;
  const apiKey = explicitApiKey
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
  const transportProtocol = resolveTransportProtocol(resolvedProvider, model);
  const executionMode = options.executionMode ?? "plain";
  const structuredProfile = executionMode === "structured"
    ? resolveStructuredOutputProfile({
      provider: transportProtocol === "anthropic" ? "anthropic" : resolvedProvider,
      model,
      baseURL,
      executionMode,
    })
    : null;
  const usesNativeStructured = options.structuredStrategy != null && options.structuredStrategy !== "prompt_json";
  const requestedReasoningEnabled = options.reasoningEnabled ?? dbSecret?.reasoningEnabled ?? true;
  const shouldForceDisableReasoning = Boolean(
    structuredProfile
      && structuredProfile.requiresNonThinkingForStructured
      && structuredProfile.supportsReasoningToggle,
  );
  const reasoningEnabled = shouldForceDisableReasoning ? false : requestedReasoningEnabled;
  let effectiveMaxTokens = resolvedMaxTokens;
  if (structuredProfile && usesNativeStructured && structuredProfile.omitMaxTokensForNativeStructured) {
    effectiveMaxTokens = undefined;
  } else if (
    structuredProfile
    && typeof structuredProfile.safeStructuredMaxTokens === "number"
    && typeof effectiveMaxTokens === "number"
  ) {
    effectiveMaxTokens = Math.min(effectiveMaxTokens, structuredProfile.safeStructuredMaxTokens);
  }
  const baseModelKwargs: Record<string, unknown> = {
    ...(options.modelKwargs ?? {}),
    ...(shouldForceDisableReasoning ? { enable_thinking: false } : {}),
  };
  const reasoningBehavior = resolveProviderReasoningBehavior({
    provider: resolvedProvider,
    baseURL,
    model,
    reasoningEnabled,
  });
  const modelKwargs = {
    ...(reasoningBehavior.modelKwargs ?? {}),
    ...baseModelKwargs,
  };

  return {
    provider: resolvedProvider,
    providerName,
    model,
    transportProtocol,
    temperature,
    apiKey,
    baseURL,
    maxTokens: effectiveMaxTokens,
    timeoutMs: normalizeTimeoutMs(options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS),
    maxRetries: normalizeMaxRetries(options.maxRetries),
    reasoningEnabled: reasoningBehavior.reasoningEnabled,
    modelKwargs: Object.keys(modelKwargs).length > 0 ? modelKwargs : undefined,
    includeRawResponse: reasoningBehavior.includeRawResponse,
    executionMode,
    structuredProfile,
    structuredStrategy: options.structuredStrategy ?? null,
    reasoningForcedOff: shouldForceDisableReasoning && requestedReasoningEnabled,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
  };
}

export function createLLMFromResolvedOptions(resolved: ResolvedLLMClientOptions): ChatOpenAI {
  if (resolved.transportProtocol === "anthropic") {
    const anthropicTransport = createAnthropicMessagesTransport(resolved, {
      provider: resolved.provider,
      model: resolved.model,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      taskType: resolved.taskType,
      baseURL: resolved.baseURL,
      promptMeta: resolved.promptMeta,
    });
    const decorated = attachLLMDebugLogging(attachLLMUsageTracking(anthropicTransport as unknown as ChatOpenAI), {
      provider: resolved.provider,
      model: resolved.model,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      taskType: resolved.taskType,
      baseURL: resolved.baseURL,
      promptMeta: resolved.promptMeta,
    });
    (decorated as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS] = resolved;
    return decorated;
  }

  const llm = new ChatOpenAI({
    apiKey: resolved.apiKey ?? "ollama",
    model: resolved.model,
    modelName: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    timeout: resolved.timeoutMs,
    maxRetries: resolved.maxRetries,
    modelKwargs: resolved.modelKwargs,
    __includeRawResponse: resolved.includeRawResponse,
    configuration: {
      baseURL: resolved.baseURL,
    },
  });
  const decorated = attachLLMDebugLogging(attachLLMUsageTracking(llm), {
    provider: resolved.provider,
    model: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    taskType: resolved.taskType,
    baseURL: resolved.baseURL,
    promptMeta: resolved.promptMeta,
  });
  (decorated as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS] = resolved;
  return decorated;
}

export async function getLLM(provider?: LLMProvider, options: LLMOptions = {}): Promise<ChatOpenAI> {
  const resolved = await resolveLLMClientOptions(provider, options);
  return createLLMFromResolvedOptions(resolved);
}

export function getResolvedLLMClientOptionsFromInstance(llm: ChatOpenAI): ResolvedLLMClientOptions | undefined {
  return (llm as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS];
}
