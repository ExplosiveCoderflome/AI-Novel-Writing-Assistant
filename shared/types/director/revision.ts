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

/** Stable comparison of the editable fields, independent of workspace timestamps. */
export function chapterPlanRevisionKey(plan: {taskSheet?: string | null; sceneCards?: string | null; targetWordCount?: number | null; mustAvoid?: string | null}): string {
  return JSON.stringify([plan.taskSheet?.trim() ?? "", plan.sceneCards?.trim() ?? "", plan.targetWordCount ?? null, plan.mustAvoid?.trim() ?? ""]);
}
