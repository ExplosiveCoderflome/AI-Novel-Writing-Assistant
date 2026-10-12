import type { NovelUsageSummary } from "@ai-novel/shared/types/llmUsage";

const tokenFields = ["promptTokens", "completionTokens", "totalTokens", "cacheHitTokens", "cacheMissTokens"] as const;
type TokenField = typeof tokenFields[number];

/** Database aggregates, never raw request content or business task counters. */
export interface NovelUsageAggregate {
  chapterId: string | null;
  stage: string | null;
  provider: string | null;
  model: string | null;
  status: string;
  cacheUsageStatus: string;
  _sum: Record<TokenField, number | null>;
  _count: Record<TokenField, number> & { _all: number };
  _min: { startedAt: Date | null };
}

export function projectNovelUsage(groups: readonly NovelUsageAggregate[]): NovelUsageSummary {
  const tokens = Object.fromEntries(tokenFields.map(key => {
    const eligible = key === "cacheHitTokens" || key === "cacheMissTokens"
      ? groups.filter(g => g.cacheUsageStatus === "reported") : groups;
    const reported = eligible.some(g => g._count[key] > 0);
    return [key, reported ? eligible.reduce((n, g) => n + (g._sum[key] ?? 0), 0) : null];
  })) as Record<TokenField, number | null>;
  return {
    ...tokens,
    recordedCallCount: groups.reduce((n, g) => n + g._count._all, 0),
    unknownUsageCallCount: groups.reduce((n, g) => n + g._count._all - g._count.totalTokens, 0),
    cacheReportedCallCount: groups.reduce((n, g) => n + (g.cacheUsageStatus === "reported" ? Math.min(g._count.cacheHitTokens, g._count.cacheMissTokens) : 0), 0),
    failedCallCount: groups.filter(g => g.status === "failed").reduce((n, g) => n + g._count._all, 0),
    partialCallCount: groups.filter(g => g.status === "partial").reduce((n, g) => n + g._count._all, 0),
  };
}
