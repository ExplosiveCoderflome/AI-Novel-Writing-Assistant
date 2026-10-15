import {applyCacheRequestPolicy,getPromptCacheBoundary,resolveCacheCapability} from "../platform/llm/cache";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import {
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  type BaseMessage,
  type MessageContent,
} from "@langchain/core/messages";

interface AnthropicLLMOptions {
  apiKey?: string;
  model: string;
  baseURL: string;
  temperature: number;
  maxTokens?: number;
  timeoutMs?: number;
}

type AnthropicRole = "user" | "assistant";

interface AnthropicMessage {
  role: AnthropicRole;
  content: {type:"text";text:string}[];
}

function stringifyMessageContent(content: MessageContent | unknown): string {
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
  return "";
}

function detectRole(message: BaseMessage): "system" | AnthropicRole {
  if (message instanceof SystemMessage || message.type === "system") {
    return "system";
  }
  if (message instanceof AIMessage || message.type === "ai") {
    return "assistant";
  }
  return "user";
}

function normalizeBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/u, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function convertMessages(messages: BaseMessage[]): { system?: {type:"text";text:string}[]; messages: AnthropicMessage[]; cacheBoundary: import("../platform/llm/cache").PromptCacheBoundary|null } {
  const systemParts: string[] = [];
  const converted: AnthropicMessage[] = [];

  const declared=getPromptCacheBoundary(messages);
  let cacheBoundary:import("../platform/llm/cache").PromptCacheBoundary|null=null;
  for (const [sourceIndex,message] of messages.entries()) {
    const content = stringifyMessageContent(message.content).trim();
    if (!content) {
      continue;
    }
    const role = detectRole(message);
    if (role === "system") {
      if(declared?.messageIndex===sourceIndex && (declared.contentBlockIndex??0)===0)cacheBoundary={messageIndex:0,contentBlockIndex:systemParts.length};
      systemParts.push(content);
      continue;
    }
    const previous = converted[converted.length - 1];
    if (previous && previous.role === role) {
      if(declared?.messageIndex===sourceIndex && (declared.contentBlockIndex??0)===0)cacheBoundary={messageIndex:converted.length,contentBlockIndex:previous.content.length};
      previous.content.push({type:"text",text:content});
    } else {
      if(declared?.messageIndex===sourceIndex && (declared.contentBlockIndex??0)===0)cacheBoundary={messageIndex:converted.length+1,contentBlockIndex:0};
      converted.push({ role, content:[{type:"text",text:content}] });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.map(text=>({type:"text" as const,text})) : undefined,
    messages: converted,
    cacheBoundary,
  };
}

function extractTextContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part) => {
    if (!part || typeof part !== "object") {
      return "";
    }
    const candidate = part as { type?: unknown; text?: unknown };
    return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
  }).join("");
}

function parseStreamLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }
  const raw = trimmed.slice("data:".length).trim();
  if (!raw || raw === "[DONE]") {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function extractDeltaText(event: unknown): string {
  if (!event || typeof event !== "object") {
    return "";
  }
  const delta = (event as { delta?: unknown }).delta;
  if (!delta || typeof delta !== "object") {
    return "";
  }
  const candidate = delta as { type?: unknown; text?: unknown };
  return candidate.type === "text_delta" && typeof candidate.text === "string" ? candidate.text : "";
}

export function createAnthropicLLM(options: AnthropicLLMOptions): {
  invoke: (messages: BaseMessage[], callOptions?: { signal?: AbortSignal }) => Promise<AIMessage>;
  stream: (messages: BaseMessage[], callOptions?: { signal?: AbortSignal }) => Promise<AsyncIterable<AIMessageChunk>>;
  batch: (messages: BaseMessage[][], callOptions?: { signal?: AbortSignal }) => Promise<AIMessage[]>;
} {
  async function postMessages(messages: BaseMessage[], callOptions?: { signal?: AbortSignal }, stream = false) {
    const converted = convertMessages(messages);
    if (converted.messages.length === 0) {
      throw new Error("Anthropic request requires at least one user or assistant message.");
    }
    const controller = new AbortController();
    const signal = callOptions?.signal;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      controller.abort(signal?.reason);
      cleanup();
    };
    const timeout = options.timeoutMs
      ? setTimeout(() => {
        controller.abort(new Error("Anthropic request timed out."));
        cleanup();
      }, options.timeoutMs)
      : null;
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    try {
      controller.signal.throwIfAborted();
      const response = await fetch(`${normalizeBaseURL(options.baseURL)}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey ?? "",
          "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
        },
        body: JSON.stringify(applyCacheRequestPolicy({
          model: options.model,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature,
          stream,
          ...(converted.system ? { system: converted.system } : {}),
          messages: converted.messages,
        },resolveCacheCapability({model:options.model,protocol:"anthropic",baseURL:options.baseURL}),converted.cacheBoundary)),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Anthropic request failed (${response.status}): ${detail || response.statusText}`);
      }
      return { response, controller, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return {
    async invoke(messages, callOptions) {
      const { response, cleanup } = await postMessages(messages, callOptions, false);
      try {
        const payload = await response.json();
        return new AIMessage({
          content: extractTextContent(payload),
          response_metadata: payload && typeof payload === "object" ? payload as Record<string, unknown> : {},
        });
      } finally {
        cleanup();
      }
    },
    async stream(messages, callOptions) {
      const { response, controller, cleanup } = await postMessages(messages, callOptions, true);
      const body = response.body;
      if (!body) {
        cleanup();
        throw new Error("Anthropic stream response body is empty.");
      }
      const reader = body.getReader();
      let finished = false;
      const finish = async () => {
        if (finished) return;
        finished = true;
        cleanup();
        controller.signal.removeEventListener("abort", onStreamAbort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      };
      const onStreamAbort = () => { void finish().catch(() => undefined); };
      controller.signal.addEventListener("abort", onStreamAbort, { once: true });
      if (controller.signal.aborted) await finish();
      const chunks = (async function* () {
          const decoder = new TextDecoder();
          let buffer = "";
          let stopped = false;
          let usage: Record<string, unknown> = {};
          function eventChunk(event: unknown): AIMessageChunk | null {
            if (!event || typeof event !== "object") return null;
            const control=event as {type?:string;error?:{message?:string}};
            if(control.type === "error") throw new Error(control.error?.message ?? "Anthropic stream error.");
            if(control.type === "message_stop") stopped=true;
            const e = event as { message?: { usage?: Record<string, unknown> }; usage?: Record<string, unknown> };
            const reported = e.message?.usage ?? e.usage;
            if (reported) usage = { ...usage, ...reported };
            const text = extractDeltaText(event);
            return text || reported ? new AIMessageChunk({ content: text, ...(reported ? { response_metadata: { usage } } : {}) }) : null;
          }
          try {
            while (true) {
              controller.signal.throwIfAborted();
              const { value, done } = await reader.read();
              controller.signal.throwIfAborted();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/u);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const chunk = eventChunk(parseStreamLine(line));
                if (chunk) yield chunk;
              }
              if (stopped) break;
            }
            const tail = decoder.decode();
            if (tail) {
              buffer += tail;
            }
            for (const line of buffer.split(/\r?\n/u)) {
              const chunk = eventChunk(parseStreamLine(line));
              if (chunk) yield chunk;
            }
            if (!stopped) throw new Error("Anthropic stream interrupted before message_stop.");
          } finally {
            await finish();
          }
      })();
      return new IterableReadableStream<AIMessageChunk>({
        async pull(output) {
          try {
            controller.signal.throwIfAborted();
            const result = await chunks.next();
            if (result.done) output.close();
            else output.enqueue(result.value);
          } catch (error) {
            output.error(error);
          }
        },
        async cancel(reason) {
          controller.abort(reason);
          // A generator returned before its first next() never enters finally.
          await finish();
          await chunks.return();
        },
      }, { highWaterMark: 0 });
    },
    async batch(messages, callOptions) {
      return Promise.all(messages.map((entry) => this.invoke(entry, callOptions)));
    },
  };
}
