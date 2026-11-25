import { z } from "zod";
import { parseChapterScenePlan, type ChapterSceneCard } from "../../chapterLengthControl.js";
import { reviewedChapterEditSchema, chapterPlanRevisionKey } from "../revision.js";
import type { VolumeChapterPlan } from "../../novel.js";

export const chapterFieldLabels = {
  taskSheet: "章节任务",
  targetWordCount: "目标字数",
  mustAvoid: "需要避免",
} as const;
export const sceneFieldLabels = {
  title: "场景标题",
  purpose: "场景目标",
  entryState: "入场状态",
  exitState: "离场状态",
  resistance: "阻力",
  turn: "转折",
  emotionalShift: "情绪变化",
  readerValue: "读者收获",
  targetWordCount: "场景字数",
} as const;
export type SceneField = keyof typeof sceneFieldLabels;
export const sceneFields = Object.keys(sceneFieldLabels) as SceneField[];
export const sceneFieldKey = (sceneKey: string, field: SceneField) => JSON.stringify([sceneKey, field]);
type Source = Pick<VolumeChapterPlan, "taskSheet" | "sceneCards" | "targetWordCount" | "mustAvoid">;

export function chapterReviewForm(plan: Source) {
  const scenePlan = parseChapterScenePlan(plan.sceneCards, {
    targetWordCount: plan.targetWordCount,
    requireAllScenes: true,
  });
  const fields: Record<string, string> = {
    taskSheet: plan.taskSheet ?? "",
    mustAvoid: plan.mustAvoid ?? "",
    targetWordCount: String(plan.targetWordCount ?? scenePlan?.targetWordCount ?? 2200),
  };
  const labels: Record<string, string> = { ...chapterFieldLabels };
  for (const [index, scene] of (scenePlan?.scenes ?? []).entries()) {
    for (const field of sceneFields) {
      const key = sceneFieldKey(scene.key, field);
      fields[key] = String(scene[field]);
      labels[key] = `场景 ${index + 1} · ${sceneFieldLabels[field]}`;
    }
  }
  return { fields, labels, scenePlan, baseRevision: chapterPlanRevisionKey(plan) };
}

export function changedSceneBudget(form: ReturnType<typeof chapterReviewForm>, fields: Record<string, string>) {
  const keys = form.scenePlan?.scenes.map((scene) => sceneFieldKey(scene.key, "targetWordCount")) ?? [];
  if (!keys.some((key) => fields[key] !== form.fields[key])) return null;
  return keys.reduce((total, key) => total + Number(fields[key]), 0);
}

export function chapterEditFromDraft(form: ReturnType<typeof chapterReviewForm>, fields: Record<string, string>) {
  const scenes = form.scenePlan?.scenes.map((scene) => {
    const updated: ChapterSceneCard = { ...scene };
    for (const field of sceneFields) {
      const value = fields[sceneFieldKey(scene.key, field)];
      if (field === "targetWordCount") updated[field] = Number(value);
      else updated[field] = value;
    }
    return updated;
  });
  const sceneTotal = changedSceneBudget(form, fields);
  const schema = reviewedChapterEditSchema.refine(
    (edit) => sceneTotal === null || edit.targetWordCount === sceneTotal,
    "场景字数有修改，请核对各场景字数之和与章节目标字数。",
  );
  return schema.safeParse({
    baseRevision: form.baseRevision,
    taskSheet: fields.taskSheet,
    sceneCards: JSON.stringify({ ...form.scenePlan, scenes }),
    targetWordCount: Number(fields.targetWordCount),
    mustAvoid: fields.mustAvoid,
  });
}

export const chapterDraftSchema = z.record(z.string(), z.string());
const suggestion = z
  .object({ field: z.string().min(1), value: z.string().trim().max(12000), reason: z.string().trim().min(1).max(1200) })
  .strict();
export const chapterProposalChanges = z
  .array(suggestion.extend({ before: z.string() }))
  .min(1)
  .max(75);
export const chapterReplySchema = z
  .object({ replyText: z.string().trim().min(1).max(8000), changes: z.array(suggestion).max(75) })
  .strict();

const valueAndReason = { value: z.string().trim().max(12000), reason: z.string().trim().min(1).max(1200) };
export const chapterDialogueOutput = z
  .object({
    replyText: z.string().trim().min(1).max(8000),
    changes: z
      .array(
        z.union([
          z
            .object({
              target: z.literal("chapter"),
              field: z.enum(["taskSheet", "mustAvoid", "targetWordCount"]),
              ...valueAndReason,
            })
            .strict(),
          z
            .object({
              target: z.literal("scene"),
              sceneKey: z.string().min(1),
              field: z.enum(sceneFields),
              ...valueAndReason,
            })
            .strict(),
        ]),
      )
      .max(75),
  })
  .strict()
  .superRefine(({ changes }, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of changes.entries()) {
      const key = item.target === "chapter" ? item.field : sceneFieldKey(item.sceneKey, item.field);
      if (
        seen.has(key) ||
        !item.value ||
        (item.field === "mustAvoid" && item.value.length > 4000) ||
        (item.field === "targetWordCount" && !/^[1-9]\d*$/.test(item.value)) ||
        (item.target === "chapter" && item.field === "targetWordCount" && Number(item.value) < 200) ||
        (item.field === "targetWordCount" && Number(item.value) > 20000)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["changes", index],
          message: "每项修改需指向唯一字段，并提供该字段可用的内容或字数。",
        });
      }
      seen.add(key);
    }
  });
