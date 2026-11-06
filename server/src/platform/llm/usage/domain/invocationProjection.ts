import type { LlmInvocationUsageRecord } from "@prisma/client";
import type { LlmInvocationUsageItem } from "@ai-novel/shared/types/llmUsage";

export function projectInvocation(row: LlmInvocationUsageRecord): LlmInvocationUsageItem {
  const { id, cacheDiagnostic, cacheHitTokens, cacheMissTokens, cacheWriteTokens, cacheUsageStatus, ...rest } = row;
  return { ...rest, invocationId: id, startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(),
    durationMs: row.durationMs ?? row.finishedAt.getTime() - row.startedAt.getTime(), firstTokenMs: row.firstTokenMs ?? null,
    attemptNumber: row.attemptNumber ?? 1, chainId: row.chainId ?? null, parentInvocationId: row.parentInvocationId ?? null,
    structuredMode: row.structuredMode ?? null,
    inputCache: { cacheHitTokens, cacheMissTokens, cacheWriteTokens, cacheUsageStatus: cacheUsageStatus as "reported" | "unavailable" | "invalid" } };
}
