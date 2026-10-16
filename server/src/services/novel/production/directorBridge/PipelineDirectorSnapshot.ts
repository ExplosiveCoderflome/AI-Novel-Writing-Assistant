import { z } from "zod";
import { directorIssueDecisionSchema } from "@ai-novel/shared/types/directorIssue";
import { DIRECTOR_CHAPTER_OUTPUT_TOKEN_WEIGHT } from "../usage/DirectorChapterUsageBudget";

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const pipelineDirectorSnapshotSchema = z.object({
  runId: z.string().trim().min(1),
  decisions: z.array(directorIssueDecisionSchema.extend({chapterOrder: z.number().int().positive().optional()})),
  pendingCharacterReviewId: z.string().trim().min(1).optional(),
  resolvedDecisionCount: z.number().int().nonnegative().optional(),
  chapterUsage: z.array(z.object({
    chapterId:z.string().trim().min(1), chapterOrder:z.number().int().positive(),
    startJobTokens:tokenCount,
    // Per-component baselines for the effective chapter budget. Rows recorded
    // before per-component tracking omit them and fall back to the legacy
    // blended accounting.
    startPromptTokens:tokenCount.optional(),
    startCompletionTokens:tokenCount.optional(),
    startCacheHitTokens:tokenCount.optional(),
    // Future chapter-window planning shares the generation job counter but is
    // outside the current chapter budget. Keep its boundary in the snapshot
    // so recovery can reproduce the same logical chapter total.
    startChapterBatchTokens:tokenCount.optional(),
    startChapterBatchPromptTokens:tokenCount.optional(),
    startChapterBatchCompletionTokens:tokenCount.optional(),
    startChapterBatchCacheHitTokens:tokenCount.optional(),
    totalTokens:tokenCount,
    // Chapter usage split, excluding planning. Input/output are tracked
    // separately; cached input tokens are excluded from the budget comparison.
    promptTokens:tokenCount.optional(),
    completionTokens:tokenCount.optional(),
    cacheHitTokens:tokenCount.optional(),
    effectiveTokens:tokenCount.optional(),
    endJobTokens:tokenCount.optional(),
    endChapterBatchTokens:tokenCount.optional(),
  }).refine(row => {
    if (row.effectiveTokens !== undefined
      && row.promptTokens !== undefined
      && row.completionTokens !== undefined
      && row.cacheHitTokens !== undefined) {
      const billableInput = Math.max(0, row.promptTokens - row.cacheHitTokens);
      if (row.effectiveTokens !== billableInput + row.completionTokens * DIRECTOR_CHAPTER_OUTPUT_TOKEN_WEIGHT) return false;
    }
    if (row.endJobTokens === undefined) return true;
    if (row.startChapterBatchTokens === undefined || row.endChapterBatchTokens === undefined) {
      return row.endJobTokens - row.startJobTokens === row.totalTokens;
    }
    return row.endJobTokens >= row.startJobTokens
      && row.endChapterBatchTokens >= row.startChapterBatchTokens
      && (row.endJobTokens - row.startJobTokens)
        - (row.endChapterBatchTokens - row.startChapterBatchTokens) === row.totalTokens;
  }))
    .refine(rows=>new Set(rows.map(row=>row.chapterId)).size === rows.length && new Set(rows.map(row=>row.chapterOrder)).size === rows.length).optional(),
}).refine(value => (value.resolvedDecisionCount ?? 0) <= value.decisions.length);
export type PipelineDirectorSnapshot = z.infer<typeof pipelineDirectorSnapshotSchema>;
export class InvalidPipelineDirectorSnapshotError extends Error {
  constructor() {super("invalid director pipeline snapshot"); this.name = "InvalidPipelineDirectorSnapshotError";}
}
export function parsePipelineDirectorSnapshot(value: unknown): PipelineDirectorSnapshot | undefined {
  if (value === undefined) return undefined;
  const parsed = pipelineDirectorSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new InvalidPipelineDirectorSnapshotError();
  return parsed.data;
}
