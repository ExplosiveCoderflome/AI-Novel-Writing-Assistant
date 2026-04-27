import type { ChatOpenAI } from "@langchain/openai";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

const LLM_REQUEST_GUARD_PATCHED = Symbol("LLM_REQUEST_GUARD_PATCHED");

interface LLMRequestGuardMeta {
  provider: LLMProvider;
  model: string;
  taskType?: TaskType;
  promptMeta?: Partial<PromptInvocationMeta>;
}

type LLMRequestMethod = "invoke" | "stream" | "batch";

type PatchableChatOpenAI = ChatOpenAI & {
  [LLM_REQUEST_GUARD_PATCHED]?: boolean;
};

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
      if (part && typeof part === "object" && "content" in part) {
        return stringifyContent((part as { content?: unknown }).content);
      }
      return "";
    }).join("\n");
  }
  if (content && typeof content === "object" && "text" in content) {
    return stringifyContent((content as { text?: unknown }).text);
  }
  return "";
}

function extractInputText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map(extractInputText).join("\n");
  }
  if (!input || typeof input !== "object") {
    return "";
  }

  const candidate = input as {
    content?: unknown;
    messages?: unknown;
    toChatMessages?: unknown;
    toString?: unknown;
  };
  if ("content" in candidate) {
    return stringifyContent(candidate.content);
  }
  if (Array.isArray(candidate.messages)) {
    return extractInputText(candidate.messages);
  }
  if (typeof candidate.toChatMessages === "function") {
    try {
      return extractInputText(candidate.toChatMessages());
    } catch {
      return "";
    }
  }
  if (typeof candidate.toString === "function" && candidate.toString !== Object.prototype.toString) {
    const rendered = candidate.toString();
    return typeof rendered === "string" && rendered !== "[object Object]" ? rendered : "";
  }
  return "";
}

function formatEmptyRequestMessage(method: LLMRequestMethod, meta: LLMRequestGuardMeta, batchIndex?: number): string {
  const chunks = [
    "empty LLM request blocked before provider call",
    `provider=${meta.provider}`,
    `model=${meta.model}`,
    `method=${method}`,
  ];
  if (typeof batchIndex === "number") {
    chunks.push(`batchIndex=${batchIndex}`);
  }
  if (meta.taskType) {
    chunks.push(`taskType=${meta.taskType}`);
  }
  if (meta.promptMeta?.promptId) {
    chunks.push(`promptId=${meta.promptMeta.promptId}`);
  }
  if (meta.promptMeta?.promptVersion) {
    chunks.push(`promptVersion=${meta.promptMeta.promptVersion}`);
  }
  return chunks.join(" ");
}

function assertSingleInput(method: LLMRequestMethod, input: unknown, meta: LLMRequestGuardMeta, batchIndex?: number): void {
  const text = extractInputText(input);
  if (!text.trim()) {
    throw new Error(formatEmptyRequestMessage(method, meta, batchIndex));
  }
}

export function assertNonEmptyLLMInput(method: LLMRequestMethod, input: unknown, meta: LLMRequestGuardMeta): void {
  if (method === "batch") {
    if (!Array.isArray(input) || input.length === 0) {
      throw new Error(formatEmptyRequestMessage(method, meta));
    }
    input.forEach((entry, index) => assertSingleInput(method, entry, meta, index));
    return;
  }
  if (Array.isArray(input) && input.length === 0) {
    throw new Error(formatEmptyRequestMessage(method, meta));
  }
  assertSingleInput(method, input, meta);
}

export function attachLLMRequestGuard(llm: ChatOpenAI, meta: LLMRequestGuardMeta): ChatOpenAI {
  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_REQUEST_GUARD_PATCHED]) {
    return llm;
  }

  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const originalBatch = llm.batch.bind(llm);

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    assertNonEmptyLLMInput("invoke", args[0], meta);
    return originalInvoke(...args);
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    assertNonEmptyLLMInput("stream", args[0], meta);
    return originalStream(...args);
  }) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
    assertNonEmptyLLMInput("batch", args[0], meta);
    return originalBatch(...args);
  }) as ChatOpenAI["batch"];

  Object.defineProperty(patchable, LLM_REQUEST_GUARD_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
