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
