/** Provider-reported input accounting. Cache writes are included in cache misses. */
export interface LlmInputCacheUsage {
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  cacheWriteTokens: number | null;
  cacheUsageStatus: "reported" | "unavailable" | "invalid";
}

export interface LlmInvocationUsageItem {
 invocationId:string; runId:string|null; generationJobId:string|null; workflowTaskId:string|null;
 novelId:string|null; chapterId:string|null; stage:string|null; provider:string|null; model:string|null;
 requestProtocol:string; promptId:string|null; promptVersion:string|null;
 status:string; startedAt:string; finishedAt:string;
 promptTokens:number|null; completionTokens:number|null; totalTokens:number|null; inputCache:LlmInputCacheUsage;
}
export interface LlmInvocationUsagePage {
 items:LlmInvocationUsageItem[]; nextCursor:string|null;
 recordedSummary:{inputCache:LlmInputCacheUsage;recordedCallCount:number;unknownCallCount:number;invalidCallCount:number;partialCallCount:number};
}

/** Known physical-call usage only. Null means no provider report, never an estimate. */
export interface NovelUsageSummary {
  recordedCallCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  unknownUsageCallCount: number;
  cacheReportedCallCount: number;
  failedCallCount: number;
  partialCallCount: number;
}

export interface NovelUsageQuery {
  limit?: number;
  cursor?: string | null;
  chapterId?: string;
  stage?: string;
  provider?: string;
  model?: string;
  status?: "completed" | "partial" | "failed";
}

export interface NovelUsageChapter {
  id: string;
  order: number;
  title: string;
}

export interface NovelUsagePage {
  novel: { id: string; title: string };
  summary: NovelUsageSummary;
  filteredSummary: NovelUsageSummary;
  chapterBreakdown: (NovelUsageSummary & { chapterId: string | null; label: string })[];
  facets: { chapters: NovelUsageChapter[]; stages: string[]; providers: string[]; models: string[] };
  items: (LlmInvocationUsageItem & { chapter: NovelUsageChapter | null })[];
  nextCursor: string | null;
  firstRecordedAt: string | null;
}
