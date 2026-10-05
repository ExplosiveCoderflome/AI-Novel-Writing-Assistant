/** Provider-reported input accounting. Cache writes are included in cache misses. */
export interface LlmInputCacheUsage {
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  cacheWriteTokens: number | null;
  cacheUsageStatus: "reported" | "unavailable" | "invalid";
}
