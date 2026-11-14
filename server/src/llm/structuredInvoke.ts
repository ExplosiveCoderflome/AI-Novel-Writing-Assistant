import { implicatesStructuredMode, recordFailedMode, runWithInvocationChain, observeInvocationParse } from "./compatibility";
import { ProductionBudgetExceededError } from "../modules/production/common";
import { declarePromptCacheBoundary, getPromptCacheBoundary } from "../platform/llm/cache";
import { toJSONSchema } from "zod";
import { randomUUID } from "node:crypto";
import { beginStructuredDiagnostic, finishStructuredDiagnostic, type StructuredDiagnosticContext } from "../platform/llm/diagnostics/StructuredDiagnosticStore";
import { emptyResponseEvidence, observeStructuredChunk, classifyResponseEvidence, terminalResponseReason } from "../platform/llm/diagnostics/structuredEvidence";
import type { ZodType } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMProvider, ProviderAuthMode } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import {
  createLLMFromResolvedOptions,
  resolveLLMClientOptions,
  type ResolvedLLMClientOptions,
} from "./factory";
import { resolveModel, toStructuredOutputStrategy } from "./modelRouter";
import {
  buildStructuredCallOptions,
  structuredStrategySequence,
  classifyStructuredOutputFailure,
  extractStructuredOutputErrorCategory,
  resolveStructuredOutputProfile,
  schemaAllowsTopLevelArray,
  selectStructuredOutputStrategy,
  describeStructuredResponseFailure,
  StructuredOutputError,
  type StructuredOutputErrorCategory,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { getStructuredFallbackSettings } from "./structuredFallbackSettings";
import { extractLlmTokenUsage, mergeStreamTokenUsage } from "./usageTracking";
import { runWithEnforcedTimeout } from "./invokeTimeout";
import { beginLlmLiveSession } from "../platform/llm/live/llmLiveSession";
import {
  buildStructuredError,
  logStructuredInvokeEvent,
  parseStructuredLlmRawContentDetailed,
  wrapStructuredInvokeError,
  type StructuredInvokeResult,
} from "./structuredInvokeParser";
import { toText } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { ReasoningStreamCollector } from "./reasoning";
import { claimModelRequest, currentModelRequestBudget } from "../platform/llm/retries";

export {
  parseStructuredLlmRawContentDetailed,
  shouldUseJsonObjectResponseFormat,
  type StructuredInvokeRawParseInput,
  type StructuredInvokeResult,
} from "./structuredInvokeParser";

export interface StructuredInvokeInput<T> {
  diagnosticContext?: StructuredDiagnosticContext;
  systemPrompt?: string;
  userPrompt?: string;
  messages?: BaseMessage[];
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  taskType?: TaskType;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredStrategy?: StructuredOutputStrategy;
  label: string;
  maxRepairAttempts?: number;
  fallbackMaxRepairAttempts?: number;
  repairGuidance?: string;
  promptMeta?: PromptInvocationMeta;
  disableFallbackModel?: boolean;
}

interface StructuredAttemptTarget {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  temperature: number;
  maxTokens?: number;
  profile: StructuredOutputProfile;
  requestProtocol: ResolvedLLMClientOptions["requestProtocol"];
  preferredStrategy: StructuredOutputStrategy | null;
}

const DEFAULT_TRANSPORT_RETRY_COUNT = 1;
const MAX_TRANSPORT_RETRY_COUNT = 3;

function normalizeTransportRetryCount(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TRANSPORT_RETRY_COUNT;
  }
  return Math.min(MAX_TRANSPORT_RETRY_COUNT, Math.max(0, Math.floor(value!)));
}

function waitForTransportRetry(signal: AbortSignal | undefined, retryAttempt: number, retryAfterMs?: number | null): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error("请求已取消。"));
  }
  const delayMs = retryAfterMs ?? Math.min(2_000, 500 * 2 ** (retryAttempt - 1));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new Error("请求已取消。"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildInvokeMessages<T>(input: StructuredInvokeInput<T>): BaseMessage[] {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    const messages = [...input.messages];
    const boundary = getPromptCacheBoundary(input.messages);
    if (boundary) declarePromptCacheBoundary(messages, boundary);
    return messages;
  }
  if (typeof input.systemPrompt === "string" && typeof input.userPrompt === "string") {
    return [new SystemMessage(input.systemPrompt), new HumanMessage(input.userPrompt)];
  }
  throw new Error(`[${input.label}] missing prompt messages.`);
}

export function formatLivePrompt(messages: BaseMessage[]): string {
  return messages.map((message, index) => {
    const role = message._getType?.() ?? `message_${index + 1}`;
    const content = typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);
    return `[${role}]\n${content}`;
  }).join("\n\n");
}

function buildStrategySequence<T>(
  profile: StructuredOutputProfile,
  schema: ZodType<T>,
): StructuredOutputStrategy[] {
  return structuredStrategySequence(profile, schema);
}

function computeAttemptTemperature(baseTemperature: number, strategyIndex: number): number {
  if (strategyIndex === 0) {
    return baseTemperature;
  }
  return Math.min(baseTemperature, 0.2);
}

async function resolveAttemptTarget(input: {
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredStrategy?: StructuredOutputStrategy;
}): Promise<StructuredAttemptTarget> {
  const shouldResolveRoutePreference = Boolean(
    input.taskType
      && input.provider == null
      && input.model == null
      && input.structuredStrategy == null,
  );
  const route = shouldResolveRoutePreference ? await resolveModel(input.taskType!) : null;
  const resolved = await resolveLLMClientOptions(input.provider, {
    fallbackProvider: "deepseek",
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    authMode: input.authMode,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    requestProtocol: input.requestProtocol,
    structuredStrategy: input.structuredStrategy,
    executionMode: "plain",
  });
  const preferredStrategy = input.structuredStrategy ?? (route
    && resolved.provider === route.provider
    && resolved.model === route.model
    ? toStructuredOutputStrategy(route.structuredResponseFormat)
    : null);
  return {
    provider: resolved.provider,
    model: resolved.model,
    apiKey: input.apiKey,
    baseURL: resolved.baseURL,
    authMode: resolved.authMode,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    requestProtocol: resolved.requestProtocol,
    preferredStrategy,
    profile: resolveStructuredOutputProfile({
      provider: resolved.provider,
      model: resolved.model,
      baseURL: resolved.baseURL,
      executionMode: "structured",
      requestProtocol: resolved.requestProtocol,
    }),
  };
}

async function invokeStructuredAttempt<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  strategy: StructuredOutputStrategy;
  strategyIndex: number;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
}): Promise<StructuredInvokeResult<T>> {
  const attemptTemperature = computeAttemptTemperature(input.target.temperature, input.strategyIndex);
  const resolved = await resolveLLMClientOptions(input.target.provider, {
    fallbackProvider: "deepseek",
    apiKey: input.target.apiKey,
    baseURL: input.target.baseURL,
    authMode: input.target.authMode,
    model: input.target.model,
    temperature: attemptTemperature,
    maxTokens: input.target.maxTokens,
    timeoutMs: input.baseInput.timeoutMs,
    taskType: input.baseInput.taskType ?? "planner",
    promptMeta: input.baseInput.promptMeta,
    executionMode: "structured",
    structuredStrategy: input.strategy,
    requestProtocol: input.target.requestProtocol,
  });
  const llm = createLLMFromResolvedOptions(resolved);
  const invokeOptions = buildStructuredCallOptions({
    strategy: input.strategy,
    schema: input.baseInput.schema,
    label: input.baseInput.label,
  });
  if (input.baseInput.signal) {
    invokeOptions.signal = input.baseInput.signal;
  }

  const messages = buildInvokeMessages(input.baseInput);
  // Registry messages already include schema hints and may be frozen by production preflight.
  if (!input.baseInput.promptMeta && (input.strategy === "prompt_json" || input.strategy === "json_object")) {
    messages.push(new HumanMessage(`Return only JSON matching this schema: ${JSON.stringify(toJSONSchema(input.baseInput.schema, { unrepresentable: "any" }))}`));
  }
  logStructuredInvokeEvent({
    event: "invoke_start",
    label: input.baseInput.label,
    provider: resolved.provider,
    model: resolved.model,
    taskType: input.baseInput.taskType,
    strategy: input.strategy,
    fallbackUsed: input.fallbackUsed,
    reasoningForcedOff: resolved.reasoningForcedOff,
  });
  const startedAt = Date.now();
  const liveSession = beginLlmLiveSession({
    label: input.baseInput.label,
    mode: "structured",
    promptMeta: input.baseInput.promptMeta,
    provider: resolved.provider,
    model: resolved.model,
    promptText: formatLivePrompt(messages),
  });
  const evidence = emptyResponseEvidence(resolved.maxTokens);
  let diagnosticId: string | null = null;
  try {
    liveSession.phase("streaming", "模型正在返回结构化结果");
    diagnosticId = await beginStructuredDiagnostic({ meta: input.baseInput.promptMeta, context: input.baseInput.diagnosticContext,
      provider: resolved.provider, model: resolved.model, requestProtocol: resolved.requestProtocol,
      strategy: input.strategy, response: evidence });
    const collected = await runWithEnforcedTimeout({
      label: input.baseInput.label,
      timeoutMs: input.baseInput.timeoutMs,
      signal: input.baseInput.signal,
      run: async (signal) => {
        await claimModelRequest({configuration:resolved,input:messages,options:invokeOptions});
        const stream = await llm.stream(
          messages,
          signal ? { ...invokeOptions, signal } : invokeOptions,
        );
        let rawContent = "";
        let tokenUsage = null;
        const reasoningCollector = new ReasoningStreamCollector();
        for await (const chunk of stream) {
          const toolChunk = chunk as typeof chunk & { tool_call_chunks?: Array<{ args?: string }> };
          const content = input.strategy === "tool_calling"
            ? (toolChunk.tool_call_chunks ?? []).map((call) => call.args ?? "").join("")
            : toText(chunk.content);
          observeStructuredChunk(evidence, chunk);
          const reasoning = reasoningCollector.push(chunk, content);
          evidence.reasoningChars += reasoning.length;
          liveSession.reasoning(reasoning);
          rawContent += content;
          evidence.contentChars = rawContent.trim().length;
          liveSession.delta(content);
          tokenUsage = mergeStreamTokenUsage(tokenUsage, extractLlmTokenUsage(chunk));
        }
        const tail = reasoningCollector.flush();
        evidence.reasoningChars += tail.length;
        liveSession.reasoning(tail);
        return { rawContent, tokenUsage };
      },
    });
    const rawContent = collected.rawContent;
    evidence.failureReason = classifyResponseEvidence(evidence);
    if (terminalResponseReason(evidence.failureReason)) {
      const failure = describeStructuredResponseFailure(evidence.failureReason!);
      throw buildStructuredError({
        message: `[${input.baseInput.label}] ${failure.message}`,
        category: failure.category,
        strategy: input.strategy,
        retryWithNextStrategy: evidence.failureReason === "empty_response" && input.strategy !== "prompt_json",
        profile: resolved.structuredProfile ?? input.target.profile,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
        reasoningForcedOff: resolved.reasoningForcedOff,
        response: evidence,
      });
    }
    logStructuredInvokeEvent({
      event: "invoke_done",
      label: input.baseInput.label,
      provider: resolved.provider,
      model: resolved.model,
      taskType: input.baseInput.taskType,
      latencyMs: Date.now() - startedAt,
      rawChars: rawContent.length,
      strategy: input.strategy,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    });
    liveSession.phase("validating", "正在检查生成结果");
    let repairStarted = false;
    const parsed = await liveSession.observe(() => parseStructuredLlmRawContentDetailed({
      rawContent,
      responseEvidence: evidence,
      diagnosticContext: input.baseInput.diagnosticContext,
      schema: input.baseInput.schema,
      tokenUsage: collected.tokenUsage,
      provider: resolved.provider,
      model: resolved.model,
      apiKey: input.target.apiKey,
      baseURL: resolved.baseURL,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      timeoutMs: input.baseInput.timeoutMs,
      signal: input.baseInput.signal,
      taskType: input.baseInput.taskType,
      requestProtocol: resolved.requestProtocol,
      label: input.baseInput.label,
      maxRepairAttempts: input.baseInput.maxRepairAttempts ?? 1,
      repairGuidance: input.baseInput.repairGuidance,
      promptMeta: input.baseInput.promptMeta,
      repairMessages: currentModelRequestBudget() ? messages : undefined,
      onRepairOutputDelta: (content) => {
        if (!repairStarted) {
          repairStarted = true;
          liveSession.phase("repairing", "正在修复生成结果");
        }
        liveSession.delta(content);
      },
      strategy: input.strategy,
      profile: resolved.structuredProfile ?? input.target.profile,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    }));
    liveSession.usage(parsed.tokenUsage ? {
      ...parsed.tokenUsage,
      reasoningTokens: parsed.tokenUsage.reasoningTokens ?? null,
    } : null);
    evidence.durationMs = Date.now() - startedAt;
    evidence.failureReason = null;
    parsed.diagnostics.response = evidence;
    parsed.diagnostics.attemptId = diagnosticId;
    await finishStructuredDiagnostic(diagnosticId, "succeeded", evidence);
    liveSession.complete();
    return parsed;
  } catch (error) {
    liveSession.fail(error);
    // A budget refusal raised inside beforeRequest proves no provider dispatch
    // happened. It must reach the production kernel typed so the run pauses with
    // the budget grant flow instead of an "unknown claims" pause; classifying it
    // as a transport error would destroy that signal and burn a transport retry
    // on a request that can never be dispatched.
    if (error instanceof ProductionBudgetExceededError) {
      evidence.durationMs = Date.now() - startedAt;
      await finishStructuredDiagnostic(diagnosticId, "failed", evidence);
      throw error;
    }
    const category = error instanceof StructuredOutputError
      ? error.category
      : classifyStructuredOutputFailure({ error });
    logStructuredInvokeEvent({
      event: "invoke_error",
      label: input.baseInput.label,
      provider: resolved.provider,
      model: resolved.model,
      taskType: input.baseInput.taskType,
      latencyMs: Date.now() - startedAt,
      strategy: input.strategy,
      errorCategory: category,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    });
    let wrapped = wrapStructuredInvokeError({
      label: input.baseInput.label,
      error,
      strategy: input.strategy,
      profile: resolved.structuredProfile ?? input.target.profile,
      reasoningForcedOff: resolved.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
    });
    const child = wrapped.diagnostics.response;
    if (child && child !== evidence) {
      evidence.failureReason ??= child.failureReason;
      evidence.httpStatus ??= child.httpStatus;
      evidence.providerCode ??= child.providerCode;
      evidence.retryAfterMs ??= child.retryAfterMs;
    }
    evidence.failureReason ??= classifyResponseEvidence(evidence, error, wrapped.category, input.baseInput.signal?.aborted);
    if (!(error instanceof StructuredOutputError) && (evidence.failureReason === "network" || evidence.failureReason === "timeout")) {
      wrapped = buildStructuredError({
        message: `[${input.baseInput.label}] ${evidence.failureReason === "network"
          ? "连接模型服务时发生网络错误，请检查网络、渠道地址和服务状态后重试。"
          : "模型请求超时，请检查服务状态或稍后重试。"}`,
        cause: error,
        category: "transport_error",
        strategy: input.strategy,
        profile: resolved.structuredProfile ?? input.target.profile,
        reasoningForcedOff: resolved.reasoningForcedOff,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
        response: evidence,
      });
    }
    evidence.durationMs = Date.now() - startedAt;
    wrapped.diagnostics.response = evidence;
    wrapped.diagnostics.attemptId = diagnosticId;
    await finishStructuredDiagnostic(diagnosticId, "failed", evidence);
    throw wrapped;
  }
}

async function tryStructuredStrategies<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
}): Promise<StructuredInvokeResult<T>> {
  input.target.profile = resolveStructuredOutputProfile({ ...input.target, executionMode: "structured" });
  const sequence = buildStrategySequence(input.target.profile, input.baseInput.schema);
  const preferredSequence = input.target.preferredStrategy
    && !schemaAllowsTopLevelArray(input.baseInput.schema)
    && !input.target.profile.failedModes?.includes(input.target.preferredStrategy === "prompt_json" ? "prompt_only" : input.target.preferredStrategy)
    && (input.target.requestProtocol !== "anthropic" || input.target.preferredStrategy === "prompt_json")
    ? [
      input.target.preferredStrategy,
      ...sequence.filter((strategy) => strategy !== input.target.preferredStrategy),
    ]
    : sequence;
  let lastError: StructuredOutputError | null = null;
  const budget = currentModelRequestBudget();
  for (let index = 0; index < preferredSequence.length || Boolean(budget && budget.remaining() > 0
    && (!input.fallbackAvailable || input.fallbackUsed)); index += 1) {
    const strategy = preferredSequence[index] ?? preferredSequence.at(-1)!;
    const remainingBefore = budget?.remaining();
    try {
      return await observeInvocationParse(() => invokeStructuredAttempt({
        baseInput: input.baseInput,
        target: input.target,
        strategy,
        strategyIndex: index,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      }), value => value.data);
    } catch (error) {
      // Keep a typed budget refusal typed: strategy fallback and transport
      // retries must never run against a request the budget refused to dispatch.
      if (error instanceof ProductionBudgetExceededError) throw error;
      lastError = wrapStructuredInvokeError({
        label: input.baseInput.label,
        error,
        strategy,
        profile: input.target.profile,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      });
      const reason = lastError.diagnostics.response?.failureReason;
      const modeFailure = strategy !== "prompt_json" && !input.baseInput.signal?.aborted
        && implicatesStructuredMode({ category: lastError.category, message: lastError.message,
          httpStatus: lastError.diagnostics.response?.httpStatus, failureReason: reason });
      if (modeFailure) {
        await recordFailedMode(input.target, strategy);
        if (budget?.remaining() === 0) break;
        continue;
      }
      if (terminalResponseReason(lastError.diagnostics.response?.failureReason)
        && !(lastError.diagnostics.response?.failureReason === "empty_response" && lastError.retryWithNextStrategy)) break;
      if (currentModelRequestBudget()?.remaining() === 0) break;
      if (budget && index >= preferredSequence.length - 1 && budget.remaining() === remainingBefore) break;
      if (lastError.category === "transport_error" && !lastError.retryWithNextStrategy) {
        break;
      }
      if (!budget && lastError.category === "schema_mismatch" && strategy === "prompt_json") {
        break;
      }
    }
  }
  throw lastError ?? buildStructuredError({
    message: `[${input.baseInput.label}] Structured output failed.`,
    category: "transport_error",
    strategy: selectStructuredOutputStrategy(input.target.profile, input.baseInput.schema),
    profile: input.target.profile,
    fallbackAvailable: input.fallbackAvailable,
    fallbackUsed: input.fallbackUsed,
  });
}

async function tryStructuredStrategiesWithTransportRetries<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  retryCount: number;
}): Promise<StructuredInvokeResult<T>> {
  let retryAttempt = 0;
  while (true) {
    try {
      return await tryStructuredStrategies({
        baseInput: input.baseInput,
        target: input.target,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      });
    } catch (error) {
      const structuredError = error instanceof StructuredOutputError ? error : null;
      if (
        structuredError?.category !== "transport_error"
        || terminalResponseReason(structuredError.diagnostics.response?.failureReason)
        || (structuredError.diagnostics.response?.retryAfterMs ?? 0) > 60_000
        || Boolean(structuredError.diagnostics.response?.httpStatus && structuredError.diagnostics.response.httpStatus < 500
          && ![408,429].includes(structuredError.diagnostics.response.httpStatus))
        || retryAttempt >= input.retryCount
        || input.baseInput.signal?.aborted
        || currentModelRequestBudget()?.remaining() === 0
      ) {
        throw error;
      }
      retryAttempt += 1;
      logStructuredInvokeEvent({
        event: "transport_retry",
        label: input.baseInput.label,
        provider: input.target.provider,
        model: input.target.model,
        taskType: input.baseInput.taskType,
        errorCategory: structuredError.category,
        fallbackUsed: input.fallbackUsed,
      });
      await waitForTransportRetry(input.baseInput.signal, retryAttempt, structuredError.diagnostics.response?.retryAfterMs);
    }
  }
}

export function invokeStructuredLlmDetailed<T>(input: StructuredInvokeInput<T>): Promise<StructuredInvokeResult<T>> {
  return runWithInvocationChain(() => invokeStructuredLlmInChain(input));
}

async function invokeStructuredLlmInChain<T>(input: StructuredInvokeInput<T>): Promise<StructuredInvokeResult<T>> {
  input = { ...input, diagnosticContext: input.diagnosticContext ?? { invocationId: randomUUID(), nextAttempt: 0 } };
  const primaryTarget = await resolveAttemptTarget({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    authMode: input.authMode,
    temperature: input.temperature ?? 0.3,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    requestProtocol: input.requestProtocol,
    structuredStrategy: input.structuredStrategy,
  });
  const fallbackSettings = input.disableFallbackModel ? null : await getStructuredFallbackSettings();
  const transportRetryCount = normalizeTransportRetryCount(fallbackSettings?.retryCount);
  const fallbackEnabled = Boolean(
    fallbackSettings?.enabled
    && fallbackSettings.model.trim().length > 0
    && !(
      fallbackSettings.provider === primaryTarget.provider
      && fallbackSettings.model === primaryTarget.model
    ),
  );

  try {
    return await tryStructuredStrategiesWithTransportRetries({
      baseInput: input,
      target: primaryTarget,
      fallbackAvailable: fallbackEnabled,
      fallbackUsed: false,
      retryCount: transportRetryCount,
    });
  } catch (primaryError) {
    const reason = primaryError instanceof StructuredOutputError ? primaryError.diagnostics.response?.failureReason : null;
    if ((reason === "rate_limited" && primaryError instanceof StructuredOutputError && (primaryError.diagnostics.response?.retryAfterMs ?? 0) > 0
      && fallbackSettings?.provider === primaryTarget.provider) || reason === "blocked" || reason === "cancelled" || !fallbackEnabled || !fallbackSettings || currentModelRequestBudget()?.remaining() === 0) {
      throw primaryError;
    }

    const fallbackTarget = await resolveAttemptTarget({
      provider: fallbackSettings.provider,
      model: fallbackSettings.model,
      temperature: fallbackSettings.temperature,
      maxTokens: fallbackSettings.maxTokens ?? undefined,
      taskType: input.taskType ?? "planner",
    });
    try {
      return await tryStructuredStrategiesWithTransportRetries({
        baseInput: {
          ...input,
          provider: fallbackTarget.provider,
          model: fallbackTarget.model,
          temperature: fallbackTarget.temperature,
          maxTokens: fallbackTarget.maxTokens,
          maxRepairAttempts: input.fallbackMaxRepairAttempts ?? input.maxRepairAttempts,
          disableFallbackModel: true,
        },
        target: fallbackTarget,
        fallbackAvailable: true,
        fallbackUsed: true,
        retryCount: transportRetryCount,
      });
    } catch (fallbackError) {
      throw fallbackError instanceof StructuredOutputError
        ? fallbackError
        : primaryError;
    }
  }
}

export async function invokeStructuredLlm<T>(input: StructuredInvokeInput<T>): Promise<T> {
  const result = await invokeStructuredLlmDetailed(input);
  return result.data;
}

export function summarizeStructuredOutputFailure(input: {
  error: unknown;
  fallbackAvailable?: boolean;
}): {
  category: StructuredOutputErrorCategory;
  failureCode: string;
  summary: string;
} {
  const message = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  const category = input.error instanceof StructuredOutputError
    ? input.error.category
    : extractStructuredOutputErrorCategory(message) ?? classifyStructuredOutputFailure({ error: input.error });
  const suffix = input.fallbackAvailable ? "，可考虑启用结构化备用模型。" : "。";
  const incompleteJsonSummary = input.fallbackAvailable
    ? "模型输出的 JSON 被截断或不完整，可能是输出被截断或 token 上限不足；建议先重试，必要时切换更强模型或启用结构化备用模型。"
    : "模型输出的 JSON 被截断或不完整，可能是输出被截断或 token 上限不足；建议先重试，必要时切换更强模型。";
  const summaryMap: Record<StructuredOutputErrorCategory, string> = {
    unsupported_native_json: `当前模型端点不兼容原生 JSON 输出${suffix}`,
    thinking_pollution: `当前模型的思考内容污染了结构化输出${suffix}`,
    incomplete_json: incompleteJsonSummary,
    malformed_json: `模型输出的 JSON 格式不稳定${suffix}`,
    schema_mismatch: `模型输出未满足目标结构要求${suffix}`,
    empty_response: "模型返回了空内容，没有收到可用正文；请重试，持续出现时检查渠道兼容性、思考设置或更换模型。",
    reasoning_budget_exhausted: "模型只返回了思考内容，输出 Token 已在生成正文前耗尽；请关闭深度思考或提高输出 Token 上限。",
    output_budget_exhausted: "模型输出达到 Token 上限后被截断，结果不完整；请提高输出 Token 上限后重试。",
    model_unavailable: "模型余额或可用额度不足；请检查账户额度，或更换可用的模型渠道后重试。",
    transport_error: `结构化调用过程发生传输或服务端错误${suffix}`,
  };
  return {
    category,
    failureCode: `STRUCTURED_OUTPUT_${category.toUpperCase()}`,
    summary: summaryMap[category],
  };
}

export { schemaAllowsTopLevelArray };
