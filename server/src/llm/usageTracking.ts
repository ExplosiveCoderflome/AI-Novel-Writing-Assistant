import { AsyncLocalStorage } from "node:async_hooks";
import type { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../db/prisma";

export interface LlmTokenUsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmUsageTrackingContext {
  workflowTaskId?: string | null;
  generationJobId?: string | null;
  styleExtractionTaskId?: string | null;
}

const usageTrackingStore = new AsyncLocalStorage<LlmUsageTrackingContext>();
const LLM_USAGE_PATCHED = Symbol("LLM_USAGE_PATCHED");

type PatchableChatOpenAI = ChatOpenAI & {
  [LLM_USAGE_PATCHED]?: boolean;
};

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.max(0, Math.round(value));
  return normalized;
}

function normalizeSnapshot(input: {
  promptTokens?: unknown;
  completionTokens?: unknown;
  totalTokens?: unknown;
}): LlmTokenUsageSnapshot | null {
  const promptTokens = toPositiveInteger(input.promptTokens) ?? 0;
  const completionTokens = toPositiveInteger(input.completionTokens) ?? 0;
  const totalTokens = toPositiveInteger(input.totalTokens)
    ?? Math.max(promptTokens + completionTokens, 0);
  if (promptTokens <= 0 && completionTokens <= 0 && totalTokens <= 0) {
    return null;
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(totalTokens, promptTokens + completionTokens),
  };
}

function extractUsageObject(value: unknown): LlmTokenUsageSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const usage = value as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    promptTokens?: unknown;
    completionTokens?: unknown;
    totalTokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
  };
  return normalizeSnapshot({
    promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens,
    completionTokens: usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
  });
}

export function extractLlmTokenUsage(output: unknown): LlmTokenUsageSnapshot | null {
  if (Array.isArray(output)) {
    return output.reduce<LlmTokenUsageSnapshot | null>((acc, item) => {
      const next = extractLlmTokenUsage(item);
      if (!next) {
        return acc;
      }
      if (!acc) {
        return next;
      }
      return {
        promptTokens: acc.promptTokens + next.promptTokens,
        completionTokens: acc.completionTokens + next.completionTokens,
        totalTokens: acc.totalTokens + next.totalTokens,
      };
    }, null);
  }

  if (!output || typeof output !== "object") {
    return null;
  }

  const candidate = output as {
    usage_metadata?: unknown;
    usageMetadata?: unknown;
    response_metadata?: { usage?: unknown; tokenUsage?: unknown } | null;
    responseMetadata?: { usage?: unknown; tokenUsage?: unknown } | null;
    llmOutput?: { tokenUsage?: unknown; estimatedTokenUsage?: unknown } | null;
  };

  return (
    extractUsageObject(candidate.usage_metadata)
    ?? extractUsageObject(candidate.usageMetadata)
    ?? extractUsageObject(candidate.response_metadata?.usage)
    ?? extractUsageObject(candidate.response_metadata?.tokenUsage)
    ?? extractUsageObject(candidate.responseMetadata?.usage)
    ?? extractUsageObject(candidate.responseMetadata?.tokenUsage)
    ?? extractUsageObject(candidate.llmOutput?.tokenUsage)
    ?? extractUsageObject(candidate.llmOutput?.estimatedTokenUsage)
  );
}

export function mergeStreamTokenUsage(
  current: LlmTokenUsageSnapshot | null,
  next: LlmTokenUsageSnapshot | null,
): LlmTokenUsageSnapshot | null {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return {
    promptTokens: Math.max(current.promptTokens, next.promptTokens),
    completionTokens: Math.max(current.completionTokens, next.completionTokens),
    totalTokens: Math.max(current.totalTokens, next.totalTokens),
  };
}

function mergeContextValue<T extends string | null | undefined>(current: T, next: T): string | null {
  if (next !== undefined) {
    return typeof next === "string" && next.trim().length > 0 ? next.trim() : null;
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

export function runWithLlmUsageTracking<T>(
  context: LlmUsageTrackingContext,
  runner: () => Promise<T>,
): Promise<T> {
  const current = usageTrackingStore.getStore();
  return usageTrackingStore.run(
    {
      workflowTaskId: mergeContextValue(current?.workflowTaskId, context.workflowTaskId),
      generationJobId: mergeContextValue(current?.generationJobId, context.generationJobId),
      styleExtractionTaskId: mergeContextValue(current?.styleExtractionTaskId, context.styleExtractionTaskId),
    },
    runner,
  );
}

export async function recordTrackedLlmUsage(usage: LlmTokenUsageSnapshot | null): Promise<void> {
  if (!usage) {
    return;
  }
  const context = usageTrackingStore.getStore();
  if (!context?.workflowTaskId && !context?.generationJobId) {
    if (!context?.styleExtractionTaskId) {
      return;
    }
  }
  const now = new Date();
  await Promise.all([
    context.workflowTaskId
      ? prisma.novelWorkflowTask.updateMany({
        where: { id: context.workflowTaskId },
        data: {
          promptTokens: { increment: usage.promptTokens },
          completionTokens: { increment: usage.completionTokens },
          totalTokens: { increment: usage.totalTokens },
          llmCallCount: { increment: 1 },
          lastTokenRecordedAt: now,
        },
      }).catch(() => null)
      : Promise.resolve(null),
    context.generationJobId
      ? prisma.generationJob.updateMany({
        where: { id: context.generationJobId },
        data: {
          promptTokens: { increment: usage.promptTokens },
          completionTokens: { increment: usage.completionTokens },
          totalTokens: { increment: usage.totalTokens },
          llmCallCount: { increment: 1 },
          lastTokenRecordedAt: now,
        },
      }).catch(() => null)
      : Promise.resolve(null),
    context.styleExtractionTaskId
      ? prisma.styleExtractionTask.updateMany({
        where: { id: context.styleExtractionTaskId },
        data: {
          promptTokens: { increment: usage.promptTokens },
          completionTokens: { increment: usage.completionTokens },
          totalTokens: { increment: usage.totalTokens },
          llmCallCount: { increment: 1 },
          lastTokenRecordedAt: now,
        },
      }).catch(() => null)
      : Promise.resolve(null),
  ]);
}

function wrapUsageTrackedStream<T>(rawStream: AsyncIterable<T>): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      let usage: LlmTokenUsageSnapshot | null = null;
      try {
        for await (const chunk of rawStream) {
          usage = mergeStreamTokenUsage(usage, extractLlmTokenUsage(chunk));
          yield chunk;
        }
      } finally {
        await recordTrackedLlmUsage(usage);
      }
    },
  };
}

export function attachLLMUsageTracking(llm: ChatOpenAI): ChatOpenAI {
  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_USAGE_PATCHED]) {
    return llm;
  }

  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const originalBatch = llm.batch.bind(llm);

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    const result = await originalInvoke(...args);
    await recordTrackedLlmUsage(extractLlmTokenUsage(result));
    return result;
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    const result = await originalStream(...args);
    return wrapUsageTrackedStream(result as AsyncIterable<unknown>) as Awaited<ReturnType<ChatOpenAI["stream"]>>;
  }) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
    const result = await originalBatch(...args);
    await recordTrackedLlmUsage(extractLlmTokenUsage(result));
    return result;
  }) as ChatOpenAI["batch"];

  Object.defineProperty(patchable, LLM_USAGE_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
