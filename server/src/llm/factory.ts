import { protocolBoundFetch } from "./protocols/OpenAIStreamTransport";
import { createGeminiLLM } from "./protocols/GeminiClient";
import { normalizeApiBaseURL, originBoundFetch } from "./protocols/transport";
import { resolveProtocol, buildThinkingParameters } from "./protocols/ProtocolPolicy";
import { getModelTokenSettings, validateOutputTokens, type ModelTokenSettings } from "../services/settings/modelTokens";
import {attachLLMCacheRequestPolicy,resolveCacheCapability} from "../platform/llm/cache";
import {attachExecutionSignal} from "../platform/llm/execution";
import type { LLMProvider, ProviderAuthMode, ReasoningEffort } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import { ChatOpenAI } from "@langchain/openai";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { secretStore } from "../services/settings/secretStore";
import { resolveModelTemperature } from "./capabilities";
import { createAnthropicLLM } from "./anthropicClient";
import { attachLLMDebugLogging } from "./debugLogging";
import { attachLLMRequestLimiter } from "./requestLimiter";
import { attachLLMRequestGuard } from "./requestGuard";
import { resolveProviderReasoningBehavior } from "./reasoning";
import {
  resolveStructuredOutputProfile,
  type StructuredExecutionMode,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { attachLLMUsageTracking } from "./usageTracking";
import { resolveModel, toStructuredOutputStrategy, type TaskType } from "./modelRouter";
import {
  getProviderEnvApiKey,
  getProviderEnvModel,
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
  resolveProviderBaseUrl,
} from "./providers";

interface LLMOptions {
  requireApiKey?: boolean; // false only for read-only budget inspection, never starts a client request
  defaultMaxTokens?: number;
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  maxTokens?: number;
  timeoutMs?: number;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  executionMode?: StructuredExecutionMode;
  structuredStrategy?: StructuredOutputStrategy;
  requestProtocol?: ModelRouteRequestProtocol;
  modelKwargs?: Record<string, unknown>;
  fallbackProvider?: LLMProvider;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
  modelRoute?: string;
  routeDegraded?: boolean;
}

export interface ProviderSecret {
  key?: string;
  model?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  displayName?: string;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}

export interface ResolvedLLMClientOptions {
  tools?: any[];
  tokenSettings?: ModelTokenSettings;
  provider: LLMProvider;
  providerName: string;
  model: string;
  temperature: number;
  apiKey?: string;
  baseURL: string;
  authMode: ProviderAuthMode;
  maxTokens?: number;
  timeoutMs?: number;
  concurrencyLimit: number;
  requestIntervalMs: number;
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  modelKwargs?: Record<string, unknown>;
  includeRawResponse: boolean;
  requestProtocol: ModelRouteRequestProtocol;
  executionMode: StructuredExecutionMode;
  structuredProfile?: StructuredOutputProfile | null;
  structuredStrategy?: StructuredOutputStrategy | null;
  reasoningForcedOff: boolean;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
  modelRoute?: string;
  routeDegraded?: boolean;
}

const providerSecrets = new Map<LLMProvider, ProviderSecret>();
const RESOLVED_LLM_OPTIONS = Symbol("RESOLVED_LLM_OPTIONS");

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

function normalizeOptionalTimeoutMs(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeProviderAuthMode(value: unknown): ProviderAuthMode {
  return value === "x-api-key" || value === "none" ? value : "bearer";
}

function normalizeProviderSecret(secret: ProviderSecret): ProviderSecret {
  return {
    key: normalizeOptionalText(secret.key),
    model: normalizeOptionalText(secret.model),
    baseURL: normalizeOptionalText(secret.baseURL),
    authMode: normalizeProviderAuthMode(secret.authMode),
    displayName: normalizeOptionalText(secret.displayName),
    reasoningEnabled: secret.reasoningEnabled ?? true,
    reasoningEffort: secret.reasoningEffort,
    concurrencyLimit: normalizeLimitValue(secret.concurrencyLimit),
    requestIntervalMs: normalizeLimitValue(secret.requestIntervalMs),
  };
}

function normalizeLimitValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function toProviderSecret(item: {
  key?: string | null;
  model?: string | null;
  baseURL?: string | null;
  authMode?: string | null;
  displayName?: string | null;
  reasoningEnabled?: boolean | null;
  reasoningEffort?: string | null;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}): ProviderSecret {
  return normalizeProviderSecret({
    key: item.key ?? undefined,
    model: item.model ?? undefined,
    baseURL: item.baseURL ?? undefined,
    authMode: normalizeProviderAuthMode(item.authMode),
    displayName: item.displayName ?? undefined,
    reasoningEnabled: item.reasoningEnabled ?? undefined,
    reasoningEffort: item.reasoningEffort === "low" || item.reasoningEffort === "high" || item.reasoningEffort === "max"
      ? item.reasoningEffort
      : undefined,
    concurrencyLimit: normalizeLimitValue(item.concurrencyLimit),
    requestIntervalMs: normalizeLimitValue(item.requestIntervalMs),
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
  rawOptions: LLMOptions = {},
): Promise<ResolvedLLMClientOptions> {
  const options: LLMOptions = { ...rawOptions };
  let resolvedProvider = provider ?? options.fallbackProvider ?? "deepseek";
  let resolvedModel = normalizeOptionalText(options.model);
  let resolvedTemperature: number | undefined = options.temperature;
  let resolvedMaxTokens: number | undefined = validateOutputTokens(options.maxTokens);
  let resolvedModelRoute: string | undefined;
  let resolvedRouteDegraded = false;

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
    if (options.requestProtocol == null) {
      options.requestProtocol = route.requestProtocol;
    }
    if (options.structuredStrategy == null) {
      const routeStructuredStrategy = toStructuredOutputStrategy(route.structuredResponseFormat);
      if (routeStructuredStrategy) {
        options.structuredStrategy = routeStructuredStrategy;
      }
    }
    resolvedModelRoute = route.routeKey;
    resolvedRouteDegraded = route.routeDegraded;
  }

  const dbSecret = await resolveProviderSecret(resolvedProvider);
  const providerName = isBuiltInProvider(resolvedProvider)
    ? PROVIDERS[resolvedProvider].name
    : dbSecret?.displayName ?? resolvedProvider;
  const apiKey = normalizeOptionalText(options.apiKey)
    ?? dbSecret?.key
    ?? getProviderEnvApiKey(resolvedProvider);

  if (!apiKey && providerRequiresApiKey(resolvedProvider) && options.requireApiKey !== false) {
    throw new Error(`未配置 ${providerName} 的 API Key。`);
  }

  const model = resolvedModel
    ?? dbSecret?.model
    ?? getProviderEnvModel(resolvedProvider)
    ?? (isBuiltInProvider(resolvedProvider) ? PROVIDERS[resolvedProvider].defaultModel : undefined);
  if (!model) {
    throw new Error(`未配置 ${providerName} 的默认模型。`);
  }

  const rawBaseURL = resolveProviderBaseUrl(
    resolvedProvider,
    options.baseURL ?? dbSecret?.baseURL,
    dbSecret?.baseURL,
  );
  if (!rawBaseURL) {
    throw new Error(`未配置 ${providerName} 的 API URL。`);
  }
  if (options.baseURL && !options.apiKey && dbSecret?.key) {
    const savedBase = resolveProviderBaseUrl(resolvedProvider, dbSecret.baseURL, dbSecret.baseURL);
    if (savedBase && new URL(options.baseURL).origin !== new URL(savedBase).origin) throw new Error("API 域名与保存的凭据不一致；请在该服务配置中提供对应凭据。");
  }
  const tokenSettings = await getModelTokenSettings(resolvedProvider, model);
  const requestProtocol = resolveProtocol(options.requestProtocol, tokenSettings.requestProtocol, rawBaseURL);
  if(requestProtocol !== "openai_compatible" && tokenSettings.outputTokenParameter !== "auto") {
    const error=new Error("所选接口由协议固定输出字段，请将 Chat 输出字段设为自动后重试。") as Error & {retryable:boolean};error.retryable=false;throw error;
  }
  const baseURL = normalizeApiBaseURL(rawBaseURL, requestProtocol);
  const authMode = normalizeProviderAuthMode(options.authMode ?? dbSecret?.authMode);

  const temperature = resolveModelTemperature(resolvedProvider, model, resolvedTemperature);
  const timeoutMs = normalizeOptionalTimeoutMs(options.timeoutMs);
  const concurrencyLimit = normalizeLimitValue(dbSecret?.concurrencyLimit);
  const requestIntervalMs = normalizeLimitValue(dbSecret?.requestIntervalMs);
  const structuredStrategy = options.structuredStrategy;
  const executionMode = options.executionMode ?? "plain";
  const structuredProfile = executionMode === "structured"
    ? resolveStructuredOutputProfile({
      provider: resolvedProvider,
      model,
      baseURL,
      executionMode,
      requestProtocol,
    })
    : null;
  const usesNativeStructured = structuredStrategy != null && structuredStrategy !== "prompt_json";
  const explicitThinking = tokenSettings.thinkingMode !== "default" || tokenSettings.thinkingEffort !== "default" || tokenSettings.thinkingBudgetTokens != null;
  const requestedReasoningEnabled = explicitThinking ? tokenSettings.thinkingMode !== "disabled" && tokenSettings.thinkingEffort !== "none" : options.reasoningEnabled ?? dbSecret?.reasoningEnabled ?? true;
  if(explicitThinking && requestedReasoningEnabled && usesNativeStructured && structuredProfile?.requiresNonThinkingForStructured) throw new Error("此服务的原生结构格式不支持所选思考模式，请改用提示词 JSON 或调整思考设置。");
  const requestedReasoningEffort = options.reasoningEffort ?? dbSecret?.reasoningEffort ?? "high";
  const shouldForceDisableReasoning = Boolean(
    !explicitThinking && structuredProfile
      && structuredProfile.requiresNonThinkingForStructured
      && structuredProfile.supportsReasoningToggle,
  );
  const reasoningEnabled = shouldForceDisableReasoning ? false : requestedReasoningEnabled;
  const effectiveMaxTokens = resolvedMaxTokens ?? tokenSettings.maxOutputTokens ?? options.defaultMaxTokens;
  const usesEnableThinkingFlag = Boolean(
    shouldForceDisableReasoning
      && structuredProfile?.family.includes("qwen"),
  );
  const baseModelKwargs: Record<string, unknown> = {
    ...(options.modelKwargs ?? {}),
    ...(usesEnableThinkingFlag ? { enable_thinking: false } : {}),
  };
  const knownHost = /^(api\.openai\.com|api\.deepseek\.com|open\.bigmodel\.cn|dashscope\.aliyuncs\.com)$/.test(new URL(baseURL).hostname);
  const reasoningBehavior = knownHost ? resolveProviderReasoningBehavior({
    provider: resolvedProvider,
    baseURL,
    model,
    reasoningEnabled,
    reasoningEffort: requestedReasoningEffort,
  }) : {reasoningEnabled, reasoningEffort: null, modelKwargs: {}, includeRawResponse: true};
  const thinkingParameters = buildThinkingParameters(requestProtocol, tokenSettings, effectiveMaxTokens);
  const modelKwargs = {
    ...(reasoningBehavior.modelKwargs ?? {}),
    ...baseModelKwargs,
    ...thinkingParameters,
  };

  return {
    provider: resolvedProvider,
    providerName,
    model,
    temperature,
    apiKey,
    baseURL,
    authMode,
    maxTokens: effectiveMaxTokens,
    tokenSettings,
    timeoutMs,
    concurrencyLimit,
    requestIntervalMs,
    reasoningEnabled: reasoningBehavior.reasoningEnabled,
    reasoningEffort: reasoningBehavior.reasoningEffort,
    modelKwargs: Object.keys(modelKwargs).length > 0 ? modelKwargs : undefined,
    includeRawResponse: reasoningBehavior.includeRawResponse,
    requestProtocol,
    executionMode,
    structuredProfile,
    structuredStrategy: structuredStrategy ?? null,
    reasoningForcedOff: shouldForceDisableReasoning && requestedReasoningEnabled,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
    modelRoute: resolvedModelRoute,
    routeDegraded: resolvedRouteDegraded,
  };
}

export function buildOpenAICompatibleDefaultHeaders(
  authMode: ProviderAuthMode,
  apiKey?: string,
): Record<string, string | null> | undefined {
  if (authMode === "bearer") {
    return undefined;
  }
  return {
    Authorization: null,
    ...(authMode === "x-api-key" && apiKey ? { "x-api-key": apiKey } : {}),
  };
}

function openAIModelKwargs(resolved: ResolvedLLMClientOptions): Record<string, unknown> | undefined {
  const kwargs = {...resolved.modelKwargs};
  if (resolved.requestProtocol === "openai_responses") { delete kwargs.reasoning_effort; return Object.keys(kwargs).length ? kwargs : undefined; }
  const parameter = resolved.tokenSettings?.outputTokenParameter ?? "auto";
  const officialReasoning = new URL(resolved.baseURL).hostname === "api.openai.com" && /^(gpt-[56]|o[1-9])/.test(resolved.model);
  if (resolved.maxTokens != null && (parameter === "max_completion_tokens" || (parameter === "auto" && officialReasoning))) {
    kwargs.max_tokens = undefined; kwargs.max_completion_tokens = resolved.maxTokens;
  }
  return Object.keys(kwargs).length ? kwargs : undefined;
}

export function createLLMFromResolvedOptions(resolved: ResolvedLLMClientOptions): ChatOpenAI {
  const llm = resolved.requestProtocol === "anthropic"
    ? createAnthropicLLM({
      apiKey: resolved.apiKey,
      model: resolved.model,
      baseURL: resolved.baseURL,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      timeoutMs: resolved.timeoutMs,
      modelKwargs: resolved.modelKwargs,
      tools: resolved.tools,
    }) as unknown as ChatOpenAI
    : resolved.requestProtocol === "gemini" ? createGeminiLLM({
      apiKey: resolved.apiKey, model: resolved.model, baseURL: resolved.baseURL,
      temperature: resolved.temperature, maxTokens: resolved.maxTokens, timeoutMs: resolved.timeoutMs,
      tools: resolved.tools,
      thinking: resolved.modelKwargs?.thinkingConfig as Record<string, unknown> | undefined,
    }) as unknown as ChatOpenAI
    : new ChatOpenAI({
      apiKey: resolved.apiKey ?? "ollama",
      model: resolved.model,
      modelName: resolved.model,
      temperature: resolved.temperature,
      useResponsesApi: resolved.requestProtocol === "openai_responses",
      maxTokens: resolved.maxTokens,
      ...(resolved.requestProtocol === "openai_responses" && resolved.modelKwargs?.reasoning ? {reasoning:resolved.modelKwargs.reasoning as any} : {}),
      timeout: resolved.timeoutMs,
      maxRetries: 0,
      modelKwargs: openAIModelKwargs(resolved),
      __includeRawResponse: true,
      configuration: {
        baseURL: resolved.baseURL,
        fetch: protocolBoundFetch(resolved.baseURL,resolved.requestProtocol, resolved.tokenSettings?.outputTokenParameter === "max_completion_tokens" || (resolved.tokenSettings?.outputTokenParameter !== "max_tokens" && new URL(resolved.baseURL).hostname === "api.openai.com" && /^(gpt-[56]|o[1-9])/.test(resolved.model)) ? "max_completion_tokens" : "max_tokens"),
        defaultHeaders: buildOpenAICompatibleDefaultHeaders(resolved.authMode, resolved.apiKey),
      },
    });
  if(resolved.requestProtocol === "anthropic" || resolved.requestProtocol === "gemini") {
    llm.bindTools = ((tools:any[])=>createLLMFromResolvedOptions({...resolved,tools})) as ChatOpenAI["bindTools"];
  }
  const meta = {
    tools:resolved.tools,
    provider: resolved.provider,
    model: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    timeoutMs: resolved.timeoutMs,
    taskType: resolved.taskType,
    modelRoute: resolved.modelRoute,
    routeDegraded: resolved.routeDegraded,
    baseURL: resolved.baseURL,
    requestProtocol: resolved.requestProtocol,
    promptMeta: resolved.promptMeta,
    tokenSettings: resolved.tokenSettings,
  };
  const cacheAware=attachLLMCacheRequestPolicy(llm,resolveCacheCapability({model:resolved.model,baseURL:resolved.baseURL,protocol:resolved.requestProtocol==="anthropic"?"anthropic":"openai-compatible"}));
  const decorated = attachLLMDebugLogging(attachLLMUsageTracking(attachLLMRequestGuard(cacheAware, meta), meta), meta);
  const limited = attachLLMRequestLimiter(decorated, {
    provider: resolved.provider,
    model: resolved.model,
    concurrencyLimit: resolved.concurrencyLimit,
    requestIntervalMs: resolved.requestIntervalMs,
  });
  (limited as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS] = resolved;
  return attachExecutionSignal(limited);
}

export async function getLLM(provider?: LLMProvider, options: LLMOptions = {}): Promise<ChatOpenAI> {
  const resolved = await resolveLLMClientOptions(provider, options);
  return createLLMFromResolvedOptions(resolved);
}

export function getResolvedLLMClientOptionsFromInstance(llm: ChatOpenAI): ResolvedLLMClientOptions | undefined {
  return (llm as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS];
}
