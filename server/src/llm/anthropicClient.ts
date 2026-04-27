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
  content: string;
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

function convertMessages(messages: BaseMessage[]): { system?: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const converted: AnthropicMessage[] = [];

  for (const message of messages) {
    const content = stringifyMessageContent(message.content).trim();
    if (!content) {
      continue;
    }
    const role = detectRole(message);
    if (role === "system") {
      systemParts.push(content);
      continue;
    }
    const previous = converted[converted.length - 1];
    if (previous && previous.role === role) {
      previous.content = `${previous.content}\n\n${content}`;
    } else {
      converted.push({ role, content });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: converted,
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
  async function postMessages(messages: BaseMessage[], callOptions?: { signal?: AbortSignal }, stream = false): Promise<Response> {
    const converted = convertMessages(messages);
    if (converted.messages.length === 0) {
      throw new Error("Anthropic request requires at least one user or assistant message.");
    }
    const controller = new AbortController();
    const timeout = options.timeoutMs
      ? setTimeout(() => controller.abort(new Error("Anthropic request timed out.")), options.timeoutMs)
      : null;
    callOptions?.signal?.addEventListener("abort", () => controller.abort(callOptions.signal?.reason), { once: true });
    try {
      const response = await fetch(`${normalizeBaseURL(options.baseURL)}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey ?? "",
          "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature,
          stream,
          ...(converted.system ? { system: converted.system } : {}),
          messages: converted.messages,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Anthropic request failed (${response.status}): ${detail || response.statusText}`);
      }
      return response;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  return {
    async invoke(messages, callOptions) {
      const response = await postMessages(messages, callOptions, false);
      const payload = await response.json();
      return new AIMessage({
        content: extractTextContent(payload),
        response_metadata: payload && typeof payload === "object" ? payload as Record<string, unknown> : {},
      });
    },
    async stream(messages, callOptions) {
      const response = await postMessages(messages, callOptions, true);
      const body = response.body;
      if (!body) {
        throw new Error("Anthropic stream response body is empty.");
      }
      return {
        async *[Symbol.asyncIterator]() {
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/u);
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const text = extractDeltaText(parseStreamLine(line));
                if (text) {
                  yield new AIMessageChunk(text);
                }
              }
            }
            const tail = decoder.decode();
            if (tail) {
              buffer += tail;
            }
            for (const line of buffer.split(/\r?\n/u)) {
              const text = extractDeltaText(parseStreamLine(line));
              if (text) {
                yield new AIMessageChunk(text);
              }
            }
          } finally {
            reader.releaseLock();
          }
        },
      };
    },
    async batch(messages, callOptions) {
      return Promise.all(messages.map((entry) => this.invoke(entry, callOptions)));
    },
  };
}
