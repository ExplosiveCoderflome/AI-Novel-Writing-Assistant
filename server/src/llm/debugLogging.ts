import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ChatOpenAI } from "@langchain/openai";
import type { TaskType } from "./modelRouter";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { appendLlmSessionLog } from "./sessionLogFile";

const LLM_DEBUG_PATCHED = Symbol("LLM_DEBUG_PATCHED");
const LOG_TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const LOG_FALSE_VALUES = new Set(["0", "false", "off", "no"]);

let logSequence = 0;

interface LLMDebugMeta {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  taskType?: TaskType;
  baseURL?: string;
  promptMeta?: PromptInvocationMeta;
}

interface MessageLogEntry {
  role: string;
  content: string;
}

type PatchableChatOpenAI = ChatOpenAI & {
  [LLM_DEBUG_PATCHED]?: boolean;
};

function shouldLogLLMRequests(): boolean {
  const raw = process.env.LLM_DEBUG_LOG?.trim().toLowerCase();
  if (raw && LOG_FALSE_VALUES.has(raw)) {
    return false;
  }
  if (raw && LOG_TRUE_VALUES.has(raw)) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, currentValue) => {
      if (typeof currentValue === "function") {
        return `[Function ${currentValue.name || "anonymous"}]`;
      }
      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) {
          return "[Circular]";
        }
        seen.add(currentValue);
      }
      return currentValue;
    }, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part) {
        return stringifyContent((part as { text?: unknown }).text);
      }
      return safeStringify(part);
    }).join("\n");
  }
  return safeStringify(content);
}

function detectMessageRole(message: unknown, fallbackRole: string): string {
  if (!message || typeof message !== "object") {
    return fallbackRole;
  }

  const candidate = message as {
    role?: unknown;
    type?: unknown;
    getType?: unknown;
    _getType?: unknown;
    constructor?: { name?: unknown };
  };

  if (typeof candidate._getType === "function") {
    return String(candidate._getType());
  }
  if (typeof candidate.getType === "function") {
    return String(candidate.getType());
  }
  if (typeof candidate.role === "string" && candidate.role.trim()) {
    return candidate.role.trim();
  }
  if (typeof candidate.type === "string" && candidate.type.trim()) {
    return candidate.type.trim();
  }
  if (typeof candidate.constructor?.name === "string" && candidate.constructor.name.trim()) {
    return candidate.constructor.name.replace(/Message$/u, "").toLowerCase();
  }
  return fallbackRole;
}

function serializeMessages(messages: unknown[]): MessageLogEntry[] {
  return messages.map((message, index) => {
    if (typeof message === "string") {
      return {
        role: `message_${index + 1}`,
        content: message,
      };
    }
    if (!message || typeof message !== "object") {
      return {
        role: `message_${index + 1}`,
        content: safeStringify(message),
      };
    }

    const record = message as { content?: unknown };
    return {
      role: detectMessageRole(message, `message_${index + 1}`),
      content: stringifyContent(record.content),
    };
  });
}

function serializeSingleLLMInput(input: unknown): MessageLogEntry[] | string {
  if (Array.isArray(input)) {
    return serializeMessages(input);
  }

  if (input && typeof input === "object") {
    const candidate = input as {
      messages?: unknown;
      toChatMessages?: unknown;
      toString?: unknown;
    };

    if (Array.isArray(candidate.messages)) {
      return serializeMessages(candidate.messages);
    }

    if (typeof candidate.toChatMessages === "function") {
      try {
        return serializeMessages(candidate.toChatMessages() as unknown[]);
      } catch {
        return safeStringify(input);
      }
    }

    if (typeof candidate.toString === "function" && candidate.toString !== Object.prototype.toString) {
      const rendered = candidate.toString();
      if (typeof rendered === "string" && rendered !== "[object Object]") {
        return rendered;
      }
    }
  }

  if (typeof input === "string") {
    return input;
  }

  return safeStringify(input);
}

function formatSerializedPayload(payload: MessageLogEntry[] | string): string {
  if (!Array.isArray(payload)) {
    return payload;
  }

  return payload.map((entry, index) => {
    return `----- ${index + 1}. ${entry.role} -----\n${entry.content}`;
  }).join("\n");
}

function serializeLLMInputForJson(method: "invoke" | "stream" | "batch", input: unknown): unknown {
  if (method !== "batch" || !Array.isArray(input)) {
    return serializeSingleLLMInput(input);
  }

  return input.map((entry, index) => ({
    index,
    payload: serializeSingleLLMInput(entry),
  }));
}

function serializeLLMInput(method: "invoke" | "stream" | "batch", input: unknown): string {
  if (method !== "batch" || !Array.isArray(input)) {
    return formatSerializedPayload(serializeSingleLLMInput(input));
  }

  return input.map((entry, index) => {
    return [
      `===== batch_input_${index + 1} =====`,
      formatSerializedPayload(serializeSingleLLMInput(entry)),
    ].join("\n");
  }).join("\n");
}

function buildMetadataSections(value: unknown, label: string): string[] {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value) && value.length === 0) {
    return [];
  }
  if (typeof value === "object" && value !== null && Object.keys(value as Record<string, unknown>).length === 0) {
    return [];
  }
  return [`----- ${label} -----\n${safeStringify(value)}`];
}

function serializeSingleLLMOutputForJson(output: unknown, fallbackRole: string): unknown {
  if (typeof output === "string") {
    return output;
  }

  if (!output || typeof output !== "object") {
    return safeStringify(output);
  }

  const record = output as {
    content?: unknown;
    response_metadata?: unknown;
    usage_metadata?: unknown;
    tool_calls?: unknown;
    invalid_tool_calls?: unknown;
    additional_kwargs?: unknown;
  };

  return {
    role: detectMessageRole(output, fallbackRole),
    content: stringifyContent(record.content),
    responseMetadata: record.response_metadata,
    usageMetadata: record.usage_metadata,
    toolCalls: record.tool_calls,
    invalidToolCalls: record.invalid_tool_calls,
    additionalKwargs: record.additional_kwargs,
  };
}

function serializeSingleLLMOutput(output: unknown, fallbackRole: string): string {
  if (typeof output === "string") {
    return output;
  }

  if (!output || typeof output !== "object") {
    return safeStringify(output);
  }

  const record = output as {
    content?: unknown;
    response_metadata?: unknown;
    usage_metadata?: unknown;
    tool_calls?: unknown;
    invalid_tool_calls?: unknown;
    additional_kwargs?: unknown;
  };
  const sections: string[] = [];

  if ("content" in record) {
    sections.push(
      `----- ${detectMessageRole(output, fallbackRole)} -----\n${stringifyContent(record.content)}`,
    );
  }

  sections.push(...buildMetadataSections(record.response_metadata, "response_metadata"));
  sections.push(...buildMetadataSections(record.usage_metadata, "usage_metadata"));
  sections.push(...buildMetadataSections(record.tool_calls, "tool_calls"));
  sections.push(...buildMetadataSections(record.invalid_tool_calls, "invalid_tool_calls"));
  sections.push(...buildMetadataSections(record.additional_kwargs, "additional_kwargs"));

  return sections.length > 0 ? sections.join("\n") : safeStringify(output);
}

function serializeLLMOutputForJson(method: "invoke" | "stream" | "batch", output: unknown): unknown {
  if (method !== "batch" || !Array.isArray(output)) {
    return serializeSingleLLMOutputForJson(output, "assistant");
  }

  return output.map((entry, index) => ({
    index,
    payload: serializeSingleLLMOutputForJson(entry, `assistant_${index + 1}`),
  }));
}

function serializeLLMOutput(method: "invoke" | "stream" | "batch", output: unknown): string {
  if (method !== "batch" || !Array.isArray(output)) {
    return serializeSingleLLMOutput(output, "assistant");
  }

  return output.map((entry, index) => {
    return [
      `===== batch_output_${index + 1} =====`,
      serializeSingleLLMOutput(entry, `assistant_${index + 1}`),
    ].join("\n");
  }).join("\n");
}

function buildHeader(method: "invoke" | "stream" | "batch", meta: LLMDebugMeta): string {
  const chunks = [
    `[llm.debug] ${method}`,
    `provider=${meta.provider}`,
    `model=${meta.model}`,
    `temperature=${meta.temperature}`,
  ];
  if (typeof meta.maxTokens === "number") {
    chunks.push(`maxTokens=${meta.maxTokens}`);
  }
  if (meta.taskType) {
    chunks.push(`taskType=${meta.taskType}`);
  }
  if (meta.baseURL) {
    chunks.push(`baseURL=${meta.baseURL}`);
  }
  if (meta.promptMeta) {
    chunks.push(`promptId=${meta.promptMeta.promptId}`);
    chunks.push(`promptVersion=${meta.promptMeta.promptVersion}`);
    chunks.push(`estimatedInputTokens=${meta.promptMeta.estimatedInputTokens}`);
    chunks.push(`repairUsed=${meta.promptMeta.repairUsed}`);
    chunks.push(`repairAttempts=${meta.promptMeta.repairAttempts}`);
    chunks.push(`semanticRetryUsed=${meta.promptMeta.semanticRetryUsed}`);
    chunks.push(`semanticRetryAttempts=${meta.promptMeta.semanticRetryAttempts}`);
    if (meta.promptMeta.contextBlockIds.length > 0) {
      chunks.push(`contextBlockIds=${meta.promptMeta.contextBlockIds.join(",")}`);
    }
    if (meta.promptMeta.droppedContextBlockIds.length > 0) {
      chunks.push(`droppedContextBlockIds=${meta.promptMeta.droppedContextBlockIds.join(",")}`);
    }
    if (meta.promptMeta.summarizedContextBlockIds.length > 0) {
      chunks.push(`summarizedContextBlockIds=${meta.promptMeta.summarizedContextBlockIds.join(",")}`);
    }
  }
  return chunks.join(" ");
}

function buildRequestLogText(method: "invoke" | "stream" | "batch", input: unknown, meta: LLMDebugMeta): string {
  return `${buildHeader(method, meta)}\n${serializeLLMInput(method, input)}`;
}

function nextRequestId(method: "invoke" | "stream" | "batch"): string {
  logSequence += 1;
  return `${method}-${Date.now()}-${logSequence}`;
}

function buildFileLogBlock(input: {
  requestId: string;
  event: "request" | "response" | "error";
  method: "invoke" | "stream" | "batch";
  meta: LLMDebugMeta;
  payload?: unknown;
  latencyMs?: number;
  error?: unknown;
}): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    event: input.event,
    requestId: input.requestId,
    method: input.method,
    provider: input.meta.provider,
    model: input.meta.model,
    temperature: input.meta.temperature,
    maxTokens: input.meta.maxTokens ?? null,
    taskType: input.meta.taskType ?? null,
    baseURL: input.meta.baseURL ?? null,
    promptMeta: input.meta.promptMeta ?? null,
    latencyMs: input.latencyMs ?? null,
    payload: input.payload ?? null,
    error: input.error ?? null,
  };
}

function logLlmFileBlock(input: {
  requestId: string;
  event: "request" | "response" | "error";
  method: "invoke" | "stream" | "batch";
  meta: LLMDebugMeta;
  payload?: unknown;
  latencyMs?: number;
  error?: unknown;
}): void {
  appendLlmSessionLog(buildFileLogBlock(input));
}

function logLLMRequest(method: "invoke" | "stream" | "batch", input: unknown, meta: LLMDebugMeta, requestId: string): void {
  const rendered = buildRequestLogText(method, input, meta);
  console.info(rendered);
  logLlmFileBlock({
    requestId,
    event: "request",
    method,
    meta,
    payload: serializeLLMInputForJson(method, input),
  });
}

function logLLMResponse(method: "invoke" | "stream" | "batch", output: unknown, meta: LLMDebugMeta, requestId: string, latencyMs: number): void {
  const renderedOutput = serializeLLMOutput(method, output);
  console.info(
    [
      "[llm.debug]",
      `event=${method}_response`,
      `requestId=${requestId}`,
      `provider=${meta.provider}`,
      `model=${meta.model}`,
      `latencyMs=${latencyMs}`,
      `outputChars=${renderedOutput.length}`,
    ].join(" "),
  );
  logLlmFileBlock({
    requestId,
    event: "response",
    method,
    meta,
    payload: serializeLLMOutputForJson(method, output),
    latencyMs,
  });
}

function logLLMError(method: "invoke" | "stream" | "batch", error: unknown, meta: LLMDebugMeta, requestId: string, latencyMs: number): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    [
      "[llm.debug]",
      `event=${method}_error`,
      `requestId=${requestId}`,
      `provider=${meta.provider}`,
      `model=${meta.model}`,
      `latencyMs=${latencyMs}`,
      `message=${JSON.stringify(message)}`,
    ].join(" "),
  );
  logLlmFileBlock({
    requestId,
    event: "error",
    method,
    meta,
    latencyMs,
    error: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack ?? null }
      : { message },
  });
}

function wrapLoggedStream(stream: AsyncIterable<unknown>, meta: LLMDebugMeta, requestId: string, startedAt: number): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      const chunks: string[] = [];
      try {
        for await (const chunk of stream) {
          if (chunk && typeof chunk === "object" && "content" in (chunk as Record<string, unknown>)) {
            chunks.push(stringifyContent((chunk as { content?: unknown }).content));
          } else {
            chunks.push(safeStringify(chunk));
          }
          yield chunk;
        }
        logLLMResponse(
          "stream",
          { content: chunks.join("") },
          meta,
          requestId,
          Date.now() - startedAt,
        );
      } catch (error) {
        logLLMError("stream", error, meta, requestId, Date.now() - startedAt);
        throw error;
      }
    },
  };
}

export function attachLLMDebugLogging(llm: ChatOpenAI, meta: LLMDebugMeta): ChatOpenAI {
  if (!shouldLogLLMRequests()) {
    return llm;
  }

  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_DEBUG_PATCHED]) {
    return llm;
  }

  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const originalBatch = llm.batch.bind(llm);

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    const requestId = nextRequestId("invoke");
    const startedAt = Date.now();
    logLLMRequest("invoke", args[0], meta, requestId);
    try {
      const result = await originalInvoke(...args);
      logLLMResponse("invoke", result, meta, requestId, Date.now() - startedAt);
      return result;
    } catch (error) {
      logLLMError("invoke", error, meta, requestId, Date.now() - startedAt);
      throw error;
    }
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    const requestId = nextRequestId("stream");
    const startedAt = Date.now();
    logLLMRequest("stream", args[0], meta, requestId);
    try {
      const stream = await originalStream(...args);
      return wrapLoggedStream(stream as AsyncIterable<unknown>, meta, requestId, startedAt) as Awaited<ReturnType<ChatOpenAI["stream"]>>;
    } catch (error) {
      logLLMError("stream", error, meta, requestId, Date.now() - startedAt);
      throw error;
    }
  }) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
    const requestId = nextRequestId("batch");
    const startedAt = Date.now();
    logLLMRequest("batch", args[0], meta, requestId);
    try {
      const result = await originalBatch(...args);
      logLLMResponse("batch", result, meta, requestId, Date.now() - startedAt);
      return result;
    } catch (error) {
      logLLMError("batch", error, meta, requestId, Date.now() - startedAt);
      throw error;
    }
  }) as ChatOpenAI["batch"];

  Object.defineProperty(patchable, LLM_DEBUG_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
