import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ChatOpenAI } from "@langchain/openai";
import type { TaskType } from "./modelRouter";

const LLM_DEBUG_PATCHED = Symbol("LLM_DEBUG_PATCHED");
const LOG_TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const LOG_FALSE_VALUES = new Set(["0", "false", "off", "no"]);

interface LLMDebugMeta {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  taskType?: TaskType;
  baseURL?: string;
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

function serializeLLMInput(input: unknown): MessageLogEntry[] | string {
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
  return chunks.join(" ");
}

function buildLogText(method: "invoke" | "stream" | "batch", input: unknown, meta: LLMDebugMeta): string {
  const header = buildHeader(method, meta);
  const payload = serializeLLMInput(input);
  if (!Array.isArray(payload)) {
    return `${header}\n${payload}`;
  }

  const body = payload.map((entry, index) => {
    return `----- ${index + 1}. ${entry.role} -----\n${entry.content}`;
  }).join("\n");

  return `${header}\n${body}`;
}

function logLLMRequest(method: "invoke" | "stream" | "batch", input: unknown, meta: LLMDebugMeta): void {
  console.info(buildLogText(method, input, meta));
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
    logLLMRequest("invoke", args[0], meta);
    return originalInvoke(...args);
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    logLLMRequest("stream", args[0], meta);
    return originalStream(...args);
  }) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
    logLLMRequest("batch", args[0], meta);
    return originalBatch(...args);
  }) as ChatOpenAI["batch"];

  Object.defineProperty(patchable, LLM_DEBUG_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
