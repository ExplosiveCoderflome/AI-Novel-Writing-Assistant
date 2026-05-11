import type { ZodType } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import {
  createLLMFromResolvedOptions,
  resolveLLMClientOptions,
  type ResolvedLLMClientOptions,
} from "./factory";
import { resolveModel, toStructuredOutputStrategy } from "./modelRouter";
import {
  buildStructuredResponseFormat,
  classifyStructuredOutputFailure,
  describeNetworkErrorCause,
  enrichErrorMessageWithCause,
  extractStructuredOutputErrorCategory,
  resolveStructuredOutputProfile,
  schemaAllowsTopLevelArray,
  selectStructuredOutputStrategy,
  StructuredOutputError,
  type StructuredOutputErrorCategory,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { getStructuredFallbackSettings } from "./structuredFallbackSettings";
import { normalizeEnforcedTimeoutMs, runWithEnforcedTimeout } from "./invokeTimeout";
import {
  buildStructuredError,
  logStructuredInvokeEvent,
  parseStructuredLlmRawContentDetailed,
  wrapStructuredInvokeError,
  type StructuredInvokeResult,
} from "./structuredInvokeParser";
import { toText } from "../services/novel/novelP0Utils";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

export {
  parseStructuredLlmRawContentDetailed,
  shouldUseJsonObjectResponseFormat,
  type StructuredInvokeRawParseInput,
  type StructuredInvokeResult,
} from "./structuredInvokeParser";

export interface StructuredInvokeInput<T> {
  systemPrompt?: string;
  userPrompt?: string;
  messages?: BaseMessage[];
  schema: ZodType<T>;
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  taskType?: TaskType;
  requestHeadersText?: string | null;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredStrategy?: StructuredOutputStrategy;
  label: string;
  maxRepairAttempts?: number;
  promptMeta?: PromptInvocationMeta;
  disableFallbackModel?: boolean;
}

interface StructuredAttemptTarget {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature: number;
  maxTokens?: number;
  profile: StructuredOutputProfile;
  requestProtocol: ResolvedLLMClientOptions["requestProtocol"];
  requestHeadersText?: string | null;
  preferredStrategy: StructuredOutputStrategy | null;
}

interface OpenAICompatibleChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildFallbackResponseDiagnostics(input: {
  response: {
    status?: number;
    statusText?: string;
    headers?: Headers;
  };
  bodyPreview?: string;
}): string {
  const contentType = input.response.headers?.get("content-type")?.trim() || "unknown";
  const requestId = input.response.headers?.get("x-request-id")?.trim() || "unknown";
  const bodyPreview = input.bodyPreview?.replace(/\s+/g, " ").trim() || "unavailable";
  return [
    `fallback_response_status=${input.response.status ?? "unknown"}`,
    `fallback_response_status_text=${input.response.statusText || "unknown"}`,
    `fallback_response_content_type=${contentType}`,
    `fallback_response_request_id=${requestId}`,
    `fallback_body_preview=${bodyPreview.slice(0, 240)}`,
  ].join(" ");
}

function buildFallbackBodyPreview(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

async function readSseChatCompletion(response: Response): Promise<{
  content: string;
  rawText: string;
  finishReason: string | null;
}> {
  const body = (response as Response & { body?: ReadableStream<Uint8Array> | null }).body;
  if (!body || typeof (body as ReadableStream<Uint8Array>).getReader !== "function") {
    throw new Error("SSE response has no readable body.");
  }
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let content = "";
  let rawText = "";
  let finishReason: string | null = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      rawText += chunk;
      let separatorIdx: number;
      while ((separatorIdx = buffer.indexOf("\n\n")) >= 0) {
        const rawEvent = buffer.slice(0, separatorIdx);
        buffer = buffer.slice(separatorIdx + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) {
            continue;
          }
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") {
            continue;
          }
          type ChatCompletionChunk = {
            choices?: Array<{
              delta?: { content?: string | Array<{ text?: string; type?: string }> };
              finish_reason?: string | null;
            }>;
          };
          let parsedEvent: ChatCompletionChunk | null = null;
          try {
            parsedEvent = JSON.parse(data) as ChatCompletionChunk;
          } catch {
            continue;
          }
          const choice = parsedEvent?.choices?.[0];
          if (!choice) {
            continue;
          }
          const delta = choice.delta?.content;
          if (typeof delta === "string") {
            content += delta;
          } else if (Array.isArray(delta)) {
            for (const part of delta) {
              if (part && typeof part === "object" && typeof part.text === "string") {
                content += part.text;
              }
            }
          }
          if (typeof choice.finish_reason === "string" && choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }
      }
    }
    rawText += decoder.decode();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  return { content, rawText, finishReason };
}

function buildInvokeMessages<T>(input: StructuredInvokeInput<T>): BaseMessage[] {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    return input.messages;
  }
  if (typeof input.systemPrompt === "string" && typeof input.userPrompt === "string") {
    return [new SystemMessage(input.systemPrompt), new HumanMessage(input.userPrompt)];
  }
  throw new Error(`[${input.label}] missing prompt messages.`);
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    }).join("\n");
  }
  return JSON.stringify(content ?? "");
}

function isTimeoutStructuredTransportError(error: StructuredOutputError): boolean {
  return error.category === "transport_error"
    && /timed out after \d+ms/i.test(error.message);
}

function toOpenAICompatibleChatMessages(messages: BaseMessage[]): OpenAICompatibleChatMessage[] {
  return messages
    .map((message) => {
      const content = stringifyMessageContent(message.content).trim();
      if (!content) {
        return null;
      }
      const role = message instanceof SystemMessage || message.type === "system"
        ? "system"
        : message.type === "ai"
          ? "assistant"
          : "user";
      return { role, content };
    })
    .filter((entry): entry is OpenAICompatibleChatMessage => Boolean(entry));
}

function buildStrategySequence<T>(
  profile: StructuredOutputProfile,
  schema: ZodType<T>,
): StructuredOutputStrategy[] {
  const first = selectStructuredOutputStrategy(profile, schema);
  const sequence: StructuredOutputStrategy[] = [first];
  if (first === "json_schema" && profile.nativeJsonObject) {
    sequence.push("json_object");
  }
  if (first !== "prompt_json") {
    sequence.push("prompt_json");
  }
  return Array.from(new Set(sequence));
}

function computeAttemptTemperature(baseTemperature: number, strategyIndex: number): number {
  if (strategyIndex === 0) {
    return baseTemperature;
  }
  return Math.min(baseTemperature, 0.2);
}

function resolveStructuredAttemptTimeout(input: {
  explicitTimeoutMs?: number;
  resolvedTimeoutMs?: number;
  strategy: StructuredOutputStrategy;
  requestProtocol: ModelRouteRequestProtocol;
}): number | undefined {
  const explicitTimeoutMs = normalizeEnforcedTimeoutMs(input.explicitTimeoutMs);
  if (typeof explicitTimeoutMs === "number") {
    return explicitTimeoutMs;
  }

  const resolvedTimeoutMs = normalizeEnforcedTimeoutMs(input.resolvedTimeoutMs);
  if (typeof resolvedTimeoutMs === "number") {
    return resolvedTimeoutMs;
  }

  if (input.requestProtocol === "openai_compatible") {
    if (input.strategy === "json_schema" || input.strategy === "json_object") {
      return 45000;
    }
  }

  if (input.requestProtocol === "openai_compatible" && input.strategy === "prompt_json") {
    return 45000;
  }

  return undefined;
}

function resolveDirectOpenAITransportFallbackTimeout(input: {
  explicitTimeoutMs?: number;
  resolvedTimeoutMs?: number;
  strategyIndex: number;
}): number | undefined {
  const explicitTimeoutMs = normalizeEnforcedTimeoutMs(input.explicitTimeoutMs);
  if (typeof explicitTimeoutMs === "number") {
    return explicitTimeoutMs;
  }

  const resolvedTimeoutMs = normalizeEnforcedTimeoutMs(input.resolvedTimeoutMs);
  if (typeof resolvedTimeoutMs === "number") {
    return input.strategyIndex > 0
      ? Math.max(resolvedTimeoutMs, 200000)
      : resolvedTimeoutMs;
  }

  return input.strategyIndex > 0 ? 200000 : 45000;
}

function shouldUseDirectOpenAITransportFallback(input: {
  strategy: StructuredOutputStrategy;
  requestProtocol: ModelRouteRequestProtocol;
  error: StructuredOutputError;
  strategyIndex: number;
}): boolean {
  if (
    input.strategy !== "prompt_json"
    || input.requestProtocol !== "openai_compatible"
    || input.error.category !== "transport_error"
  ) {
    return false;
  }

  if (!isTimeoutStructuredTransportError(input.error)) {
    return true;
  }

  return input.strategyIndex > 0;
}

function shouldContinueAfterOpenAICompatibleTransportError(input: {
  strategy: StructuredOutputStrategy;
  requestProtocol: ModelRouteRequestProtocol;
  error: StructuredOutputError;
}): boolean {
  return input.requestProtocol === "openai_compatible"
    && input.error.category === "transport_error"
    && input.strategy !== "prompt_json";
}

async function invokeStructuredPromptJsonViaDirectOpenAICompatible<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  resolved: ResolvedLLMClientOptions;
  attemptTimeoutMs?: number;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  retryBudget?: number;
}): Promise<StructuredInvokeResult<T>> {
  const messages = buildInvokeMessages(input.baseInput);
  const requestHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...input.resolved.requestHeaders,
  };
  if (input.resolved.apiKey) {
    requestHeaders.authorization = `Bearer ${input.resolved.apiKey}`;
  }

  const startedAt = Date.now();
  const runFallbackFetch = async (): Promise<Response> => runWithEnforcedTimeout({
    label: `${input.baseInput.label}.fallback`,
    timeoutMs: input.attemptTimeoutMs,
    signal: input.baseInput.signal,
    run: (signal) => fetch(`${input.resolved.baseURL.replace(/\/+$/u, "")}/chat/completions`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        model: input.resolved.model,
        temperature: input.resolved.temperature,
        ...(typeof input.resolved.maxTokens === "number" ? { max_tokens: input.resolved.maxTokens } : {}),
        messages: toOpenAICompatibleChatMessages(messages),
        stream: true,
      }),
      signal,
    }),
  });
  try {
    let response: Response | null = null;
    let lastFetchError: unknown = null;
    const maxAttempts = (input.retryBudget ?? 0) > 0 ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        response = await runFallbackFetch();
        lastFetchError = null;
        break;
      } catch (error) {
        lastFetchError = error;
        const isTransportError = classifyStructuredOutputFailure({ error }) === "transport_error";
        const isGovernedTimeout = error instanceof Error
          && /timed out after \d+ms/i.test(error.message);
        const shouldRetry = attempt < maxAttempts - 1
          && isTransportError
          && !isGovernedTimeout;
        if (!shouldRetry) {
          if (error instanceof Error) {
            const enriched = enrichErrorMessageWithCause(error);
            if (enriched && enriched !== error.message) {
              error.message = enriched;
            }
          }
          throw error;
        }
      }
    }

    if (!response) {
      const fallbackError = lastFetchError instanceof Error
        ? lastFetchError
        : new Error("fetch failed");
      const enriched = enrichErrorMessageWithCause(fallbackError, "fetch failed");
      if (enriched && enriched !== fallbackError.message) {
        fallbackError.message = enriched;
      }
      throw fallbackError;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`[${input.baseInput.label}] direct transport fallback 请求失败 (${response.status}): ${detail || response.statusText}`);
    }

    const responseContentType = response.headers?.get?.("content-type")?.toLowerCase() ?? "";
    const isSseResponse = responseContentType.includes("text/event-stream")
      || responseContentType.includes("application/x-ndjson");
    let payload: {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string; type?: string }>;
        };
      }>;
    };
    let responseText = "";
    let streamedContent: string | null = null;
    try {
      if (isSseResponse) {
        const streamResult = await readSseChatCompletion(response);
        streamedContent = streamResult.content;
        responseText = streamResult.rawText.slice(0, 4096);
        payload = {
          choices: [{ message: { content: streamResult.content } }],
        };
      } else if (typeof response.json === "function") {
        try {
          payload = await response.json() as typeof payload;
          responseText = buildFallbackBodyPreview(payload);
        } catch (jsonError) {
          if (typeof response.text === "function") {
            responseText = await response.text();
            if (responseText.trim()) {
              payload = JSON.parse(responseText) as typeof payload;
            } else {
              throw jsonError;
            }
          } else {
            throw jsonError;
          }
        }
      } else if (typeof response.text === "function") {
        responseText = await response.text();
        if (!responseText.trim()) {
          throw new Error("Fallback response body is empty.");
        }
        payload = JSON.parse(responseText) as typeof payload;
      } else {
        throw new Error("Fallback response does not expose text() or json().");
      }
    } catch (error) {
      const diagnostics = buildFallbackResponseDiagnostics({
        response,
        bodyPreview: responseText,
      });
      logStructuredInvokeEvent({
        event: "fallback_response_read_error",
        label: `${input.baseInput.label}.fallback`,
        provider: input.resolved.provider,
        model: input.resolved.model,
        taskType: input.baseInput.taskType,
        strategy: "prompt_json",
        errorCategory: classifyStructuredOutputFailure({ error }),
        fallbackUsed: input.fallbackUsed,
        reasoningForcedOff: input.resolved.reasoningForcedOff,
      });
      console.info(`[structured.invoke] ${diagnostics}`);
      throw new Error(`${error instanceof Error ? error.message : String(error)} ${diagnostics}`);
    }
    const rawContent = (streamedContent !== null
      ? streamedContent
      : toText(payload.choices?.[0]?.message?.content)).trim();
    logStructuredInvokeEvent({
      event: "invoke_done",
      label: `${input.baseInput.label}.fallback`,
      provider: input.resolved.provider,
      model: input.resolved.model,
      taskType: input.baseInput.taskType,
      latencyMs: Date.now() - startedAt,
      rawChars: rawContent.length,
      strategy: "prompt_json",
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: input.resolved.reasoningForcedOff,
    });
    return parseStructuredLlmRawContentDetailed({
      rawContent,
      schema: input.baseInput.schema,
      provider: input.resolved.provider,
      model: input.resolved.model,
      apiKey: input.resolved.apiKey,
      baseURL: input.resolved.baseURL,
      temperature: input.resolved.temperature,
      maxTokens: input.resolved.maxTokens,
      timeoutMs: input.attemptTimeoutMs,
      signal: input.baseInput.signal,
      taskType: input.baseInput.taskType,
      requestProtocol: input.resolved.requestProtocol,
      label: `${input.baseInput.label}.fallback`,
      maxRepairAttempts: input.baseInput.maxRepairAttempts,
      promptMeta: input.baseInput.promptMeta,
      strategy: "prompt_json",
      profile: input.resolved.structuredProfile ?? input.target.profile,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: input.resolved.reasoningForcedOff,
    });
  } catch (error) {
    logStructuredInvokeEvent({
      event: "invoke_error",
      label: `${input.baseInput.label}.fallback`,
      provider: input.resolved.provider,
      model: input.resolved.model,
      taskType: input.baseInput.taskType,
      latencyMs: Date.now() - startedAt,
      strategy: "prompt_json",
      errorCategory: error instanceof StructuredOutputError ? error.category : classifyStructuredOutputFailure({ error }),
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: input.resolved.reasoningForcedOff,
    });
    throw wrapStructuredInvokeError({
      label: `${input.baseInput.label}.fallback`,
      error,
      strategy: "prompt_json",
      profile: input.resolved.structuredProfile ?? input.target.profile,
      reasoningForcedOff: input.resolved.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
    });
  }
}

async function resolveAttemptTarget(input: {
  provider?: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  taskType?: TaskType;
  requestHeadersText?: string | null;
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
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    requestHeadersText: input.requestHeadersText,
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
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    requestProtocol: resolved.requestProtocol,
    requestHeadersText: input.requestHeadersText ?? route?.requestHeadersText,
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
    model: input.target.model,
    temperature: attemptTemperature,
    maxTokens: input.target.maxTokens,
    timeoutMs: input.baseInput.timeoutMs,
    taskType: input.baseInput.taskType ?? "planner",
    requestHeadersText: input.target.requestHeadersText,
    promptMeta: input.baseInput.promptMeta,
    executionMode: "structured",
    structuredStrategy: input.strategy,
    requestProtocol: input.target.requestProtocol,
  });
  const llm = createLLMFromResolvedOptions(resolved);
  const attemptTimeoutMs = resolveStructuredAttemptTimeout({
    explicitTimeoutMs: input.baseInput.timeoutMs,
    resolvedTimeoutMs: resolved.timeoutMs,
    strategy: input.strategy,
    requestProtocol: resolved.requestProtocol,
  });
  const invokeOptions: Record<string, unknown> = {};
  const responseFormat = buildStructuredResponseFormat({
    strategy: input.strategy,
    schema: input.baseInput.schema,
    label: input.baseInput.label,
  });
  if (responseFormat) {
    invokeOptions.response_format = responseFormat;
  }
  if (input.baseInput.signal) {
    invokeOptions.signal = input.baseInput.signal;
  }

  const messages = buildInvokeMessages(input.baseInput);
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
  try {
    const result = await runWithEnforcedTimeout({
      label: input.baseInput.label,
      timeoutMs: attemptTimeoutMs,
      signal: input.baseInput.signal,
      run: (signal) => llm.invoke(
        messages,
        signal ? { ...invokeOptions, signal } : invokeOptions,
      ),
    });
    const rawContent = toText(result.content);
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
    return parseStructuredLlmRawContentDetailed({
      rawContent,
      schema: input.baseInput.schema,
      provider: resolved.provider,
      model: resolved.model,
      apiKey: input.target.apiKey,
      baseURL: resolved.baseURL,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      timeoutMs: attemptTimeoutMs,
      signal: input.baseInput.signal,
      taskType: input.baseInput.taskType,
      requestProtocol: resolved.requestProtocol,
      label: input.baseInput.label,
      maxRepairAttempts: input.baseInput.maxRepairAttempts,
      promptMeta: input.baseInput.promptMeta,
      strategy: input.strategy,
      profile: resolved.structuredProfile ?? input.target.profile,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
      reasoningForcedOff: resolved.reasoningForcedOff,
    });
  } catch (error) {
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
    throw wrapStructuredInvokeError({
      label: input.baseInput.label,
      error,
      strategy: input.strategy,
      profile: resolved.structuredProfile ?? input.target.profile,
      reasoningForcedOff: resolved.reasoningForcedOff,
      fallbackAvailable: input.fallbackAvailable,
      fallbackUsed: input.fallbackUsed,
    });
  }
}

async function tryStructuredStrategies<T>(input: {
  baseInput: StructuredInvokeInput<T>;
  target: StructuredAttemptTarget;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
}): Promise<StructuredInvokeResult<T>> {
  const sequence = buildStrategySequence(input.target.profile, input.baseInput.schema);
  const preferredSequence = input.target.preferredStrategy
    ? [
      input.target.preferredStrategy,
      ...sequence.filter((strategy) => strategy !== input.target.preferredStrategy),
    ]
    : sequence;
  let lastError: StructuredOutputError | null = null;
  for (let index = 0; index < preferredSequence.length; index += 1) {
    const strategy = preferredSequence[index]!;
    try {
      return await invokeStructuredAttempt({
        baseInput: input.baseInput,
        target: input.target,
        strategy,
        strategyIndex: index,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      });
    } catch (error) {
      lastError = wrapStructuredInvokeError({
        label: input.baseInput.label,
        error,
        strategy,
        profile: input.target.profile,
        fallbackAvailable: input.fallbackAvailable,
        fallbackUsed: input.fallbackUsed,
      });
      if (shouldUseDirectOpenAITransportFallback({
        strategy,
        requestProtocol: input.target.requestProtocol,
        error: lastError,
        strategyIndex: index,
      })) {
        const resolved = await resolveLLMClientOptions(input.target.provider, {
          fallbackProvider: "deepseek",
          apiKey: input.target.apiKey,
          baseURL: input.target.baseURL,
          model: input.target.model,
          temperature: computeAttemptTemperature(input.target.temperature, index),
          maxTokens: input.target.maxTokens,
          timeoutMs: input.baseInput.timeoutMs,
          taskType: input.baseInput.taskType ?? "planner",
          requestHeadersText: input.target.requestHeadersText,
          promptMeta: input.baseInput.promptMeta,
          executionMode: "structured",
          structuredStrategy: "prompt_json",
          requestProtocol: input.target.requestProtocol,
        });
        const attemptTimeoutMs = resolveStructuredAttemptTimeout({
          explicitTimeoutMs: input.baseInput.timeoutMs,
          resolvedTimeoutMs: resolved.timeoutMs,
          strategy: "prompt_json",
          requestProtocol: resolved.requestProtocol,
        });
        return await invokeStructuredPromptJsonViaDirectOpenAICompatible({
          baseInput: input.baseInput,
          target: input.target,
          resolved,
          attemptTimeoutMs: resolveDirectOpenAITransportFallbackTimeout({
            explicitTimeoutMs: input.baseInput.timeoutMs,
            resolvedTimeoutMs: attemptTimeoutMs,
            strategyIndex: index,
          }),
          fallbackAvailable: input.fallbackAvailable,
          fallbackUsed: input.fallbackUsed,
          retryBudget: index > 0 ? 1 : 0,
        });
      }
      if (shouldContinueAfterOpenAICompatibleTransportError({
        strategy,
        requestProtocol: input.target.requestProtocol,
        error: lastError,
      })) {
        continue;
      }
      if (lastError.category === "transport_error") {
        break;
      }
      if (lastError.category === "schema_mismatch" && strategy === "prompt_json") {
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

export async function invokeStructuredLlmDetailed<T>(input: StructuredInvokeInput<T>): Promise<StructuredInvokeResult<T>> {
  const primaryTarget = await resolveAttemptTarget({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    temperature: input.temperature ?? 0.3,
    maxTokens: input.maxTokens,
    taskType: input.taskType ?? "planner",
    requestHeadersText: input.requestHeadersText,
    requestProtocol: input.requestProtocol,
    structuredStrategy: input.structuredStrategy,
  });
  const fallbackSettings = input.disableFallbackModel ? null : await getStructuredFallbackSettings();
  const fallbackEnabled = Boolean(
    fallbackSettings?.enabled
    && fallbackSettings.model.trim().length > 0
    && !(
      fallbackSettings.provider === primaryTarget.provider
      && fallbackSettings.model === primaryTarget.model
    ),
  );

  try {
    return await tryStructuredStrategies({
      baseInput: input,
      target: primaryTarget,
      fallbackAvailable: fallbackEnabled,
      fallbackUsed: false,
    });
  } catch (primaryError) {
    if (!fallbackEnabled || !fallbackSettings) {
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
      return await tryStructuredStrategies({
        baseInput: {
          ...input,
          provider: fallbackTarget.provider,
          model: fallbackTarget.model,
          temperature: fallbackTarget.temperature,
          maxTokens: fallbackTarget.maxTokens,
          disableFallbackModel: true,
        },
        target: fallbackTarget,
        fallbackAvailable: true,
        fallbackUsed: true,
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
  const transportSuffix = input.fallbackAvailable
    ? "（建议检查上游/代理网络后重试，或启用结构化备用模型）。"
    : "（建议检查上游/代理网络后重试）。";
  const cause = describeNetworkErrorCause(input.error)
    ?? (input.error instanceof StructuredOutputError
      ? describeNetworkErrorCause((input.error as Error & { cause?: unknown }).cause)
      : null);
  const transportTail = cause ? `（cause: ${cause}）${transportSuffix}` : transportSuffix;
  const summaryMap: Record<StructuredOutputErrorCategory, string> = {
    unsupported_native_json: `当前模型端点不兼容原生 JSON 输出${suffix}`,
    thinking_pollution: `当前模型的思考内容污染了结构化输出${suffix}`,
    incomplete_json: incompleteJsonSummary,
    malformed_json: `模型输出的 JSON 格式不稳定${suffix}`,
    schema_mismatch: `模型输出未满足目标结构要求${suffix}`,
    transport_error: `结构化调用过程发生传输或服务端错误${transportTail}`,
  };
  return {
    category,
    failureCode: `STRUCTURED_OUTPUT_${category.toUpperCase()}`,
    summary: summaryMap[category],
  };
}

export { schemaAllowsTopLevelArray };
