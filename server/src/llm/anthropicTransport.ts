import {
  AIMessage,
  AIMessageChunk,
  type ContentBlock,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import type { TaskType } from "./modelRouter";
import type { ResolvedLLMClientOptions } from "./factory";

interface AnthropicTransportMeta {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  taskType?: TaskType;
  baseURL?: string;
  promptMeta?: PromptInvocationMeta;
}

interface AnthropicTransportLike {
  timeout?: number;
  caller: { maxRetries: number };
  invoke(input: BaseMessage[], options?: Record<string, unknown>): Promise<AIMessage>;
  stream(input: BaseMessage[], options?: Record<string, unknown>): Promise<AsyncIterable<AIMessageChunk>>;
  batch(inputs: BaseMessage[][], options?: Record<string, unknown>): Promise<AIMessage[]>;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | Record<string, unknown>;

type AnthropicMessageResponse = {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  } | null;
};

function toLangChainContent(content: AnthropicContentBlock[] | undefined): ContentBlock.Standard[] {
  const normalized = normalizeContentBlocks(content);
  const blocks: ContentBlock.Standard[] = [];
  for (const block of normalized) {
    if (!block || typeof block !== "object" || typeof block.type !== "string") {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      blocks.push({ type: "text", text: block.text });
      continue;
    }
    if (block.type === "thinking" && typeof block.thinking === "string") {
      blocks.push({ type: "reasoning", reasoning: block.thinking });
    }
  }
  return blocks;
}

function toAnthropicSystem(messages: BaseMessage[]): string | undefined {
  const parts = messages
    .filter((message) => SystemMessage.isInstance(message))
    .map((message) => message.text.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
}

function toAnthropicRole(message: BaseMessage): "user" | "assistant" {
  if (AIMessage.isInstance(message)) {
    return "assistant";
  }
  return "user";
}

function toAnthropicMessages(messages: BaseMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => !SystemMessage.isInstance(message))
    .map((message) => ({
      role: toAnthropicRole(message),
      content: message.text,
    }));
}

function buildAnthropicHeaders(resolved: ResolvedLLMClientOptions): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": resolved.apiKey ?? "",
    "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
  };
}

function buildAnthropicUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/u, "")}/messages`;
}

function normalizeContentBlocks(content: AnthropicContentBlock[] | undefined): AnthropicContentBlock[] {
  return Array.isArray(content) ? content : [];
}

function buildUsageMetadata(response: AnthropicMessageResponse):
  | {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_token_details: { cache_read: number };
  }
  | undefined {
  if (!response.usage) {
    return undefined;
  }
  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;
  const cacheRead = response.usage.cache_read_input_tokens ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    input_token_details: {
      cache_read: cacheRead,
    },
  };
}

function buildResponseMetadata(response: AnthropicMessageResponse, resolved: ResolvedLLMClientOptions): Record<string, unknown> {
  return {
    model_provider: "anthropic",
    model: response.model ?? resolved.model,
    stop_reason: response.stop_reason ?? null,
    usage: response.usage ?? null,
  };
}

function buildInvokeMessage(response: AnthropicMessageResponse, resolved: ResolvedLLMClientOptions): AIMessage {
  const content = toLangChainContent(response.content);
  return new AIMessage({
    id: response.id,
    content,
    usage_metadata: buildUsageMetadata(response),
    response_metadata: buildResponseMetadata(response, resolved),
  });
}

async function invokeAnthropicMessages(
  resolved: ResolvedLLMClientOptions,
  messages: BaseMessage[],
  options?: Record<string, unknown>,
): Promise<AIMessage> {
  const payload = {
    model: resolved.model,
    max_tokens: resolved.maxTokens ?? 1024,
    temperature: resolved.temperature,
    system: toAnthropicSystem(messages),
    messages: toAnthropicMessages(messages),
    ...(options ?? {}),
  };

  const response = await fetch(buildAnthropicUrl(resolved.baseURL), {
    method: "POST",
    headers: buildAnthropicHeaders(resolved),
    body: JSON.stringify(payload),
    signal: typeof resolved.timeoutMs === "number" ? AbortSignal.timeout(resolved.timeoutMs) : undefined,
  });

  const rawText = await response.text();
  let parsed: AnthropicMessageResponse | { error?: unknown };
  try {
    parsed = JSON.parse(rawText) as AnthropicMessageResponse;
  } catch {
    throw new Error(`Anthropic transport returned non-JSON response: ${rawText}`);
  }

  if (!response.ok) {
    const errorMessage = typeof parsed === "object" && parsed && "error" in parsed
      ? JSON.stringify(parsed.error)
      : rawText;
    throw new Error(errorMessage);
  }

  return buildInvokeMessage(parsed as AnthropicMessageResponse, resolved);
}

function toMessageChunks(message: AIMessage): AsyncIterable<AIMessageChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const contentBlocks = Array.isArray(message.content) ? message.content : [{ type: "text", text: message.text }];
      let usageEmitted = false;
      for (const block of contentBlocks) {
        yield new AIMessageChunk({
          id: message.id,
          content: [block],
          response_metadata: message.response_metadata,
          usage_metadata: usageEmitted ? undefined : message.usage_metadata,
        });
        usageEmitted = true;
      }
      if (contentBlocks.length === 0) {
        yield new AIMessageChunk({
          id: message.id,
          content: "",
          response_metadata: message.response_metadata,
          usage_metadata: message.usage_metadata,
        });
      }
    },
  };
}

export function createAnthropicMessagesTransport(
  resolved: ResolvedLLMClientOptions,
  _meta: AnthropicTransportMeta,
): AnthropicTransportLike {
  return {
    timeout: resolved.timeoutMs,
    caller: {
      maxRetries: resolved.maxRetries,
    },
    async invoke(input: BaseMessage[], options?: Record<string, unknown>) {
      return invokeAnthropicMessages(resolved, input, options);
    },
    async stream(input: BaseMessage[], options?: Record<string, unknown>) {
      const message = await invokeAnthropicMessages(resolved, input, options);
      return toMessageChunks(message);
    },
    async batch(inputs: BaseMessage[][], options?: Record<string, unknown>) {
      const results: AIMessage[] = [];
      for (const input of inputs) {
        results.push(await invokeAnthropicMessages(resolved, input, options));
      }
      return results;
    },
  };
}
