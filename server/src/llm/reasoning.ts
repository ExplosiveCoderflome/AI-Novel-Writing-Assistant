import type { BaseMessageChunk } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
const MINIMAX_HOST_PATTERN = /(?:^|:\/\/)(?:api\.)?minimax(?:i)?\.(?:io|com)(?:\/|$)/i;
const MINIMAX_MODEL_PATTERN = /^minimax-m2(?:[.-]|$)/i;

export interface ProviderReasoningBehavior {
  reasoningEnabled: boolean;
  modelKwargs?: Record<string, unknown>;
  includeRawResponse: boolean;
  usesAccumulatedStreamDeltas: boolean;
}

export interface StreamFilterResult {
  text: string;
  reasoning: string;
}

export interface MiniMaxStreamState {
  contentBuffer: string;
  reasoningBuffer: string;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function collectTextArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return item.trim() ? [item] : [];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    if ("text" in item && typeof item.text === "string" && item.text.trim()) {
      return [item.text];
    }
    if ("reasoning" in item && typeof item.reasoning === "string" && item.reasoning.trim()) {
      return [item.reasoning];
    }
    return [];
  });
}

function extractReasoningTextFromSummary(reasoning: unknown): string[] {
  if (!reasoning || typeof reasoning !== "object") {
    return [];
  }
  if ("summary" in reasoning) {
    return collectTextArray((reasoning as { summary?: unknown }).summary);
  }
  if ("text" in reasoning && typeof reasoning.text === "string" && reasoning.text.trim()) {
    return [reasoning.text];
  }
  return [];
}

function uniqueJoinedText(parts: string[]): string {
  return Array.from(new Set(parts.map((item) => item.trim()).filter(Boolean))).join("");
}

export function isMiniMaxCompatibleProvider(
  provider: LLMProvider,
  baseURL?: string,
  model?: string,
): boolean {
  if (provider === "minimax") {
    return true;
  }
  const normalizedBaseURL = normalizeOptionalText(baseURL);
  if (normalizedBaseURL && MINIMAX_HOST_PATTERN.test(normalizedBaseURL)) {
    return true;
  }
  const normalizedModel = normalizeOptionalText(model);
  return Boolean(normalizedModel && MINIMAX_MODEL_PATTERN.test(normalizedModel));
}

export function resolveProviderReasoningBehavior(input: {
  provider: LLMProvider;
  baseURL: string;
  model: string;
  reasoningEnabled: boolean;
}): ProviderReasoningBehavior {
  const isMiniMax = isMiniMaxCompatibleProvider(input.provider, input.baseURL, input.model);
  if (isMiniMax) {
    return {
      reasoningEnabled: input.reasoningEnabled,
      modelKwargs: {
        reasoning_split: true,
      },
      includeRawResponse: true,
      usesAccumulatedStreamDeltas: true,
    };
  }

  return {
    reasoningEnabled: input.reasoningEnabled,
    includeRawResponse: false,
    usesAccumulatedStreamDeltas: false,
  };
}

export function extractReasoningTextFromChunk(chunk: BaseMessageChunk): string {
  const additionalKwargs = (chunk.additional_kwargs ?? {}) as Record<string, unknown>;
  const directReasoning = [
    ...collectTextArray(additionalKwargs.reasoning_content),
    ...collectTextArray(additionalKwargs.reasoning_details),
    ...extractReasoningTextFromSummary(additionalKwargs.reasoning),
  ];

  const contentReasoning = Array.isArray(chunk.content)
    ? chunk.content.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      if ("type" in item && item.type === "reasoning" && "reasoning" in item && typeof item.reasoning === "string") {
        return item.reasoning.trim() ? [item.reasoning] : [];
      }
      if ("reasoning" in item && typeof item.reasoning === "string") {
        return item.reasoning.trim() ? [item.reasoning] : [];
      }
      return [];
    })
    : [];

  return uniqueJoinedText([...directReasoning, ...contentReasoning]);
}

export function extractMiniMaxRawStreamData(rawResponse: unknown): {
  contentBuffer?: string;
  reasoningBuffer?: string;
} {
  if (!rawResponse || typeof rawResponse !== "object") {
    return {};
  }
  const choices = (rawResponse as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return {};
  }
  const delta = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as { delta?: unknown }).delta
    : undefined;
  if (!delta || typeof delta !== "object") {
    return {};
  }
  const contentBuffer = typeof (delta as { content?: unknown }).content === "string"
    ? (delta as { content: string }).content
    : undefined;
  const reasoningBuffer = uniqueJoinedText(
    collectTextArray((delta as { reasoning_details?: unknown }).reasoning_details),
  ) || undefined;
  return {
    contentBuffer,
    reasoningBuffer,
  };
}

export function diffAccumulatedText(previousBuffer: string, nextBuffer?: string): {
  nextBuffer: string;
  delta: string;
} {
  if (!nextBuffer) {
    return {
      nextBuffer: previousBuffer,
      delta: "",
    };
  }
  if (!previousBuffer) {
    return {
      nextBuffer,
      delta: nextBuffer,
    };
  }
  if (nextBuffer === previousBuffer) {
    return {
      nextBuffer,
      delta: "",
    };
  }
  if (nextBuffer.startsWith(previousBuffer)) {
    return {
      nextBuffer,
      delta: nextBuffer.slice(previousBuffer.length),
    };
  }
  if (previousBuffer.startsWith(nextBuffer)) {
    return {
      nextBuffer,
      delta: "",
    };
  }
  return {
    nextBuffer,
    delta: nextBuffer,
  };
}

export class ThinkTagStreamFilter {
  private pending = "";

  private insideThink = false;

  push(input: string): StreamFilterResult {
    this.pending += input;
    return this.consume(false);
  }

  flush(): StreamFilterResult {
    return this.consume(true);
  }

  private consume(flush: boolean): StreamFilterResult {
    let text = "";
    let reasoning = "";

    while (this.pending.length > 0) {
      if (!this.insideThink && this.pending.startsWith(THINK_CLOSE_TAG)) {
        this.pending = this.pending.slice(THINK_CLOSE_TAG.length);
        continue;
      }

      if (this.insideThink) {
        const closeIndex = this.pending.indexOf(THINK_CLOSE_TAG);
        if (closeIndex >= 0) {
          reasoning += this.pending.slice(0, closeIndex);
          this.pending = this.pending.slice(closeIndex + THINK_CLOSE_TAG.length);
          this.insideThink = false;
          continue;
        }
        const safeLength = flush ? this.pending.length : Math.max(0, this.pending.length - (THINK_CLOSE_TAG.length - 1));
        if (safeLength === 0) {
          break;
        }
        reasoning += this.pending.slice(0, safeLength);
        this.pending = this.pending.slice(safeLength);
        continue;
      }

      const openIndex = this.pending.indexOf(THINK_OPEN_TAG);
      if (openIndex >= 0) {
        text += this.pending.slice(0, openIndex);
        this.pending = this.pending.slice(openIndex + THINK_OPEN_TAG.length);
        this.insideThink = true;
        continue;
      }

      const safeLength = flush ? this.pending.length : Math.max(0, this.pending.length - (THINK_OPEN_TAG.length - 1));
      if (safeLength === 0) {
        break;
      }
      text += this.pending.slice(0, safeLength);
      this.pending = this.pending.slice(safeLength);
    }

    return {
      text,
      reasoning,
    };
  }
}
