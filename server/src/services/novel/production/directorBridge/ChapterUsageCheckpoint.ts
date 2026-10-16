import {z} from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const chapterUsageCheckpointSchema = z.object({
  chapterId: z.string().trim().min(1), chapterOrder: z.number().int().positive(),
  startJobTokens: count, startChapterBatchTokens: count.optional(), totalTokens: count,
  endJobTokens: count.optional(), endChapterBatchTokens: count.optional(),
  metric: z.literal("uncached_tokens_v1").optional(),
  startPromptTokens: count.optional(), startCompletionTokens: count.optional(), startCacheHitTokens: count.optional(),
  startBatchPromptTokens: count.optional(), startBatchCompletionTokens: count.optional(), startBatchCacheHitTokens: count.optional(),
  promptTokens: count.optional(), completionTokens: count.optional(), cacheHitTokens: count.optional(), effectiveTokens: count.optional(),
  unclassifiedTokens: count.optional(),
  tokenLimit: z.number().int().positive().max(10_000_000).optional(),
  budgetPause: z.object({reserveTokens: count, stage: z.enum(["draft", "review", "repair", "artifact_sync"]).nullable()}).optional(),
}).refine(row => {
  if (row.endJobTokens !== undefined) {
    const planning = row.startChapterBatchTokens !== undefined && row.endChapterBatchTokens !== undefined
      ? row.endChapterBatchTokens - row.startChapterBatchTokens : 0;
    if (planning < 0 || row.endJobTokens < row.startJobTokens
      || row.endJobTokens - row.startJobTokens - planning !== row.totalTokens) return false;
  }
  if (row.metric === "uncached_tokens_v1") {
    if (row.startPromptTokens === undefined || row.startCompletionTokens === undefined || row.startCacheHitTokens === undefined
      || row.promptTokens === undefined || row.completionTokens === undefined || row.cacheHitTokens === undefined
      || row.effectiveTokens === undefined || row.cacheHitTokens > row.promptTokens) return false;
    if ((row.unclassifiedTokens ?? 0) !== Math.max(0, row.totalTokens - row.promptTokens - row.completionTokens)) return false;
    if (row.promptTokens - row.cacheHitTokens + row.completionTokens + (row.unclassifiedTokens ?? 0) !== row.effectiveTokens) return false;
    if (row.startChapterBatchTokens !== undefined
      && (row.startBatchPromptTokens === undefined || row.startBatchCompletionTokens === undefined || row.startBatchCacheHitTokens === undefined)) return false;
  } else if ([row.startPromptTokens, row.startCompletionTokens, row.startCacheHitTokens,
    row.promptTokens, row.completionTokens, row.cacheHitTokens, row.effectiveTokens].some(value => value !== undefined)) return false;
  return true;
});
