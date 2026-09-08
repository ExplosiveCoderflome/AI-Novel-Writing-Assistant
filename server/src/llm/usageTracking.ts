import { AsyncLocalStorage } from "node:async_hooks";
import type { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../db/prisma";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface LlmTokenUsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface LlmUsageTrackingContext {
  workflowTaskId?: string | null;
  generationJobId?: string | null;
  styleExtractionTaskId?: string | null;
  directorTelemetry?: boolean | null;
  novelId?: string | null;
  directorRunId?: string | null;
  directorStepIdempotencyKey?: string | null;
  directorNodeKey?: string | null;
}

export interface LlmUsageTrackingMeta {
  provider?: LLMProvider | string | null;
  model?: string | null;
  taskType?: string | null;
  modelRoute?: string | null;
  routeDegraded?: boolean | null;
  promptMeta?: {
    promptId?: string | null;
    promptVersion?: string | null;
    novelId?: string | null;
    taskId?: string | null;
    chapterId?: string | null;
    volumeId?: string | null;
    stage?: string | null;
    itemKey?: string | null;
    scope?: string | null;
    entrypoint?: string | null;
  } | null;
}

interface TrackedUsageRecordInput {
  durationMs?: number | null;
  status?: string;
  meta?: LlmUsageTrackingMeta;
  metadata?: Record<string, unknown>;
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
  reasoningTokens?: unknown;
  totalTokens?: unknown;
}): LlmTokenUsageSnapshot | null {
  const promptTokens = toPositiveInteger(input.promptTokens) ?? 0;
  const completionTokens = toPositiveInteger(input.completionTokens) ?? 0;
  const reasoningTokens = toPositiveInteger(input.reasoningTokens);
  const totalTokens = toPositiveInteger(input.totalTokens)
    ?? Math.max(promptTokens + completionTokens, 0);
  if (promptTokens <= 0 && completionTokens <= 0 && totalTokens <= 0) {
    return null;
  }
  return {
    promptTokens,
    completionTokens,
    ...(reasoningTokens !== null ? { reasoningTokens } : {}),
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
    completion_tokens_details?: { reasoning_tokens?: unknown } | null;
    output_token_details?: { reasoning?: unknown } | null;
    outputTokenDetails?: { reasoning?: unknown } | null;
  };
  return normalizeSnapshot({
    promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens,
    completionTokens: usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens
      ?? usage.output_token_details?.reasoning
      ?? usage.outputTokenDetails?.reasoning,
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
        ...((acc.reasoningTokens !== undefined || next.reasoningTokens !== undefined)
          ? { reasoningTokens: (acc.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0) }
          : {}),
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
    ...((current.reasoningTokens !== undefined || next.reasoningTokens !== undefined)
      ? { reasoningTokens: Math.max(current.reasoningTokens ?? 0, next.reasoningTokens ?? 0) }
      : {}),
    totalTokens: Math.max(current.totalTokens, next.totalTokens),
  };
}

function mergeContextValue<T extends string | null | undefined>(current: T, next: T): string | null {
  if (next !== undefined) {
    return typeof next === "string" && next.trim().length > 0 ? next.trim() : null;
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function mergeBooleanValue(current: boolean | null | undefined, next: boolean | null | undefined): boolean | null {
  if (next !== undefined) {
    return next === true;
  }
  return current === true;
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
      directorTelemetry: mergeBooleanValue(current?.directorTelemetry, context.directorTelemetry),
      novelId: mergeContextValue(current?.novelId, context.novelId),
      directorRunId: mergeContextValue(current?.directorRunId, context.directorRunId),
      directorStepIdempotencyKey: mergeContextValue(
        current?.directorStepIdempotencyKey,
        context.directorStepIdempotencyKey,
      ),
      directorNodeKey: mergeContextValue(current?.directorNodeKey, context.directorNodeKey),
    },
    runner,
  );
}

function resolveAttributionStatus(context: LlmUsageTrackingContext): "step_attributed" | "task_only" | "unattributed" {
  if (context.directorStepIdempotencyKey?.trim()) {
    return "step_attributed";
  }
  if (context.workflowTaskId?.trim() || context.directorRunId?.trim() || context.directorNodeKey?.trim()) {
    return "task_only";
  }
  return "unattributed";
}

function buildPromptNodeKey(meta: LlmUsageTrackingMeta | undefined): string | null {
  const stage = meta?.promptMeta?.stage?.trim();
  const itemKey = meta?.promptMeta?.itemKey?.trim();
  if (stage && itemKey) {
    return `${stage}.${itemKey}`;
  }
  return stage || null;
}

function buildDirectorUsageMetadata(input: TrackedUsageRecordInput | undefined): string | null {
  const promptMeta = input?.meta?.promptMeta;
  const metadata = {
    ...(input?.metadata ?? {}),
    taskType: input?.meta?.taskType ?? null,
    modelRoute: input?.meta?.modelRoute ?? input?.meta?.taskType ?? null,
    routeDegraded: input?.meta?.routeDegraded === true,
    chapterId: promptMeta?.chapterId ?? null,
    volumeId: promptMeta?.volumeId ?? null,
    stage: promptMeta?.stage ?? null,
    itemKey: promptMeta?.itemKey ?? null,
    scope: promptMeta?.scope ?? null,
    entrypoint: promptMeta?.entrypoint ?? null,
  };
  const meaningful = Object.values(metadata).some((value) => value !== null && value !== undefined && value !== "");
  return meaningful ? JSON.stringify(metadata) : null;
}

async function recordDirectorLlmUsage(input: {
  context: LlmUsageTrackingContext;
  usage: LlmTokenUsageSnapshot;
  record?: TrackedUsageRecordInput;
  recordedAt: Date;
}): Promise<void> {
  if (input.context.directorTelemetry !== true) {
    return;
  }
  const promptMeta = input.record?.meta?.promptMeta;
  await prisma.directorLlmUsageRecord.create({
    data: {
      novelId: input.context.novelId ?? promptMeta?.novelId ?? null,
      taskId: input.context.workflowTaskId ?? promptMeta?.taskId ?? null,
      runId: input.context.directorRunId ?? null,
      stepIdempotencyKey: input.context.directorStepIdempotencyKey ?? null,
      nodeKey: input.context.directorNodeKey ?? buildPromptNodeKey(input.record?.meta) ?? null,
      promptAssetKey: promptMeta?.promptId ?? null,
      promptVersion: promptMeta?.promptVersion ?? null,
      modelRoute: input.record?.meta?.modelRoute ?? input.record?.meta?.taskType ?? null,
      provider: input.record?.meta?.provider ? String(input.record.meta.provider) : null,
      model: input.record?.meta?.model ?? null,
      status: input.record?.status ?? "recorded",
      attributionStatus: resolveAttributionStatus(input.context),
      durationMs: typeof input.record?.durationMs === "number"
        ? Math.max(0, Math.round(input.record.durationMs))
        : null,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      metadataJson: buildDirectorUsageMetadata(input.record),
      recordedAt: input.recordedAt,
    },
  }).catch(() => undefined);
}

export async function recordTrackedLlmUsage(
  usage: LlmTokenUsageSnapshot | null,
  record?: TrackedUsageRecordInput,
): Promise<void> {
  if (!usage) {
    return;
  }
  const context = usageTrackingStore.getStore();
  if (!context) {
    return;
  }
  if (!context?.workflowTaskId && !context?.generationJobId) {
    if (!context?.styleExtractionTaskId && context?.directorTelemetry !== true) {
      return;
    }
  }
  const now = new Date();
  await Promise.all([
    context?.directorTelemetry === true
      ? recordDirectorLlmUsage({
        context,
        usage,
        record,
        recordedAt: now,
      })
      : Promise.resolve(null),
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

function wrapUsageTrackedStream<T>(
  rawStream: AsyncIterable<T>,
  startedAt: number,
  meta?: LlmUsageTrackingMeta,
): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      let usage: LlmTokenUsageSnapshot | null = null;
      try {
        for await (const chunk of rawStream) {
          usage = mergeStreamTokenUsage(usage, extractLlmTokenUsage(chunk));
          yield chunk;
        }
      } finally {
        await recordTrackedLlmUsage(usage, {
          durationMs: Date.now() - startedAt,
          meta,
        });
      }
    },
  };
}

export function attachLLMUsageTracking(llm: ChatOpenAI, meta?: LlmUsageTrackingMeta): ChatOpenAI {
  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_USAGE_PATCHED]) {
    return llm;
  }

  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const originalBatch = llm.batch.bind(llm);

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) => {
    const startedAt = Date.now();
    const result = await originalInvoke(...args);
    await recordTrackedLlmUsage(extractLlmTokenUsage(result), {
      durationMs: Date.now() - startedAt,
      meta,
    });
    return result;
  }) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    const startedAt = Date.now();
    const result = await originalStream(...args);
    return wrapUsageTrackedStream(
      result as AsyncIterable<unknown>,
      startedAt,
      meta,
    ) as Awaited<ReturnType<ChatOpenAI["stream"]>>;
  }) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) => {
    const startedAt = Date.now();
    const result = await originalBatch(...args);
    await recordTrackedLlmUsage(extractLlmTokenUsage(result), {
      durationMs: Date.now() - startedAt,
      meta,
    });
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
