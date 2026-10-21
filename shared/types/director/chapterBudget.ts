import {z} from "zod";

export const DEFAULT_DIRECTOR_CHAPTER_TOKEN_LIMIT = 100_000;
export const MAX_DIRECTOR_CHAPTER_TOKEN_LIMIT = 10_000_000;
/** A new task must cover the conservative 16,000-token next-step reserve. */
export const directorChapterTokenLimitSchema = z.number().int().min(16_001).max(MAX_DIRECTOR_CHAPTER_TOKEN_LIMIT);
export const directorChapterBudgetSettingsSchema = z.object({tokenLimit: directorChapterTokenLimitSchema}).strict();
export type DirectorChapterBudgetSettings = z.infer<typeof directorChapterBudgetSettingsSchema>;

export const directorChapterBudgetMetricSchema = z.enum(["raw_tokens_v1", "uncached_tokens_v1"]);
export type DirectorChapterBudgetMetric = z.infer<typeof directorChapterBudgetMetricSchema>;

/** Explicit authorization for one saved chapter, carried by the idempotent resume command. */
export const directorChapterBudgetGrantSchema = z.object({
  jobId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
  metric: directorChapterBudgetMetricSchema,
  tokenLimit: z.number().int().positive().max(10_000_000),
  applyToRemaining: z.boolean().optional(),
}).strict();
export type DirectorChapterBudgetGrant = z.infer<typeof directorChapterBudgetGrantSchema>;
export type DirectorChapterBudgetStage = "draft" | "review" | "repair" | "artifact_sync";

export interface DirectorChapterBudgetView {
  jobId: string;
  chapterId: string;
  chapterOrder: number;
  metric: DirectorChapterBudgetMetric;
  usedTokens: number;
  rawTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  cacheHitTokens?: number;
  unclassifiedTokens?: number;
  tokenLimit: number;
  reserveTokens: number;
  recommendedLimit: number;
  stage: DirectorChapterBudgetStage | null;
  closed: boolean;
}
