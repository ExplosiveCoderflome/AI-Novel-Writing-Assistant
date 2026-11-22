import {z} from "zod";
import {chapterSceneCardSchema} from "../chapterLengthControl.js";

export const chapterPlanEditSchema = z.object({
  baseRevision: z.string().min(1).max(100000),
  taskSheet: z.string().trim().min(1).max(12000),
  sceneCards: z.string().trim().min(1).max(60000),
  targetWordCount: z.number().int().positive().max(20000),
  mustAvoid: z.string().trim().max(4000),
}).strict().superRefine((edit, context) => {
  let raw: unknown;
  try { raw = JSON.parse(edit.sceneCards); } catch { raw = null; }
  const scenes = z.object({scenes: z.array(chapterSceneCardSchema).min(3).max(8)}).safeParse(raw);
  if (!scenes.success) {
    context.addIssue({code: "custom", path: ["sceneCards"], message: "请填写 3～8 个完整场景，每个场景都需要标题、目标、入场状态、离场状态和有效字数。"});
  } else if (edit.targetWordCount < scenes.data.scenes.length) {
    context.addIssue({code: "custom", path: ["targetWordCount"], message: "章节目标字数不能少于场景数量。"});
  }
});

export type ChapterPlanEdit = z.infer<typeof chapterPlanEditSchema>;
export const reviewedChapterEditSchema = chapterPlanEditSchema.refine(edit => edit.targetWordCount >= 200, "章节目标字数至少为 200 字。")
  .refine(edit => Boolean(edit.mustAvoid), "请写明本章需要避免的内容。");
export const chapterPlanRevisionSchema = z.union([chapterPlanEditSchema, z.object({
  planVersionId: z.string().min(1),
  approveForProse: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  chapters: z.array(z.object({ chapterId: z.string().min(1), edit: reviewedChapterEditSchema }).strict())
    .refine(items => new Set(items.map(item => item.chapterId)).size === items.length, "每章只能提交一次修改。"),
}).strict().refine(review => review.chapters.length > 0 || Boolean(review.approveForProse), "请选择要保存的章节修改。")]);
export type ChapterPlanRevision = z.infer<typeof chapterPlanRevisionSchema>;

/** Stable comparison of the editable fields, independent of workspace timestamps. */
export function chapterPlanRevisionKey(plan: {taskSheet?: string | null; sceneCards?: string | null; targetWordCount?: number | null; mustAvoid?: string | null}): string {
  return JSON.stringify([plan.taskSheet?.trim() ?? "", plan.sceneCards?.trim() ?? "", plan.targetWordCount ?? null, plan.mustAvoid?.trim() ?? ""]);
}

export const castReviewFields = ["personality", "storyFunction", "currentGoal"] as const;
export const volumeReviewFields = ["summary", "mainPromise", "climax", "nextVolumeHook"] as const;

const fieldChange = z.object({
  id: z.string().min(1),
  before: z.string(),
  after: z.string().trim().max(12000),
}).strict();

export const reviewAssetEditSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("character_cast"), changes: z.array(fieldChange.extend({field: z.enum(castReviewFields)})).min(1).max(100)}).strict(),
  z.object({type: z.literal("volume_strategy"), changes: z.array(fieldChange.extend({field: z.enum(volumeReviewFields)})).min(1).max(100)}).strict(),
]).superRefine((edit, context) => {
  const seen = new Set<string>();
  for (const change of edit.changes) {
    const key = JSON.stringify([change.id, change.field]);
    if (seen.has(key) || change.before.trim() === change.after) {
      context.addIssue({code: "custom", message: "请为每个字段提交一次实际修改。"});
    }
    seen.add(key);
  }
});
export type ReviewAssetEdit = z.infer<typeof reviewAssetEditSchema>;

export const batchProseReviewSchema = z
  .object({
    chapters: z
      .array(
        z
          .object({
            chapterId: z.string().min(1),
            baseHash: z.string().regex(/^[a-f0-9]{64}$/),
            content: z
              .string()
              .refine((text) => Boolean(text.trim()), "请保留有效正文。")
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .refine((items) => new Set(items.map((item) => item.chapterId)).size === items.length),
    nextRange: z.object({ from: z.number().int().positive(), to: z.number().int().positive() }).strict().optional(),
  })
  .strict();
export type BatchProseReview = z.infer<typeof batchProseReviewSchema>;
