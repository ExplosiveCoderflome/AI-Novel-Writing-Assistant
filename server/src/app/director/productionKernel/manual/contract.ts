import {z} from "zod";
import type {RunContract, RunLaunchInput} from "../../../../modules/director";
import type {ProductionProfile} from "../../../../modules/production";
import {chapterRuntimeRequestSchema} from "../../../../services/novel/runtime/chapterRuntimeSchema";

export const MANUAL_CHAPTER_PLAN_VERSION = "production-kernel-manual@1";
export const manualChapterRequestSchema = z.object({
  operation: z.enum(["write", "repair", "audit"]),
  chapterId: z.string().min(1),
  baseline: z.object({content: z.string().nullable(), updatedAt: z.string().datetime()}),
  options: chapterRuntimeRequestSchema,
});
export type ManualChapterRequest = z.infer<typeof manualChapterRequestSchema>;
export type ManualChapterOperation = ManualChapterRequest["operation"];
export type ManualChapterLaunchInput = RunLaunchInput & {manualChapter: ManualChapterRequest};

/** App-owned metadata. An operation authorizes one saved chapter, never an automatic batch. */
export function readManualChapterRequest(contract: RunContract): ManualChapterRequest | undefined {
  const input = contract.launchInput as ManualChapterLaunchInput | undefined;
  if (!input?.manualChapter && contract.planVersion !== MANUAL_CHAPTER_PLAN_VERSION) return undefined;
  if (contract.planVersion !== MANUAL_CHAPTER_PLAN_VERSION || !contract.chapterRange
    || contract.chapterRange.from !== contract.chapterRange.to
    || contract.stepIdsInScope?.length !== 1 || contract.stepIdsInScope[0] !== "chapter_batch") {
    throw new Error("手动章节任务的执行范围无效。");
  }
  return manualChapterRequestSchema.parse(input?.manualChapter);
}

export function configureManualChapterProfile(profile: ProductionProfile, operation?: ManualChapterOperation): ProductionProfile {
  const result = structuredClone(profile);
  if (operation === "audit") {
    result.id = `${profile.id}/manual_audit`;
    result.repair = {maxAttempts: 0, mode: "detect_only"};
  }
  return result;
}
