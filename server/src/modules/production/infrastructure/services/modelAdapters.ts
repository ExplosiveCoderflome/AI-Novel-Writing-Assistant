import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ChapterAcceptanceAssessmentService } from "../../../../services/novel/runtime/ChapterAcceptanceAssessmentService";
import type { ChapterPatchRepairService } from "../../../../services/novel/chapterPatchRepairService";
import { hashProductionContent, type UnitRun } from "../../application";
import type { ChapterStageServices, PreparedChapter, PreparedStageCall } from "../stages";

type AssessInput = Parameters<ChapterStageServices["assess"]>[0];
type RepairInput = Parameters<ChapterStageServices["repair"]>[0];
export interface ChapterModelAdapterDependencies {
  writer: { invoke(run: UnitRun, prepared: PreparedChapter, call: PreparedStageCall): Promise<string> };
  assessment: Pick<ChapterAcceptanceAssessmentService, "assess">;
  patches: Pick<ChapterPatchRepairService, "repair">;
  /** Binds the existing shared check budget, its persisted frozen policy and physical request fence. No live-policy fallback. */
  withReviewBudget<T>(run: UnitRun, call: PreparedStageCall, operation: () => Promise<T>): Promise<T>;
  /** Pure projection of this run's saved assessment/context, including style permissions and original issue identities. */
  repairRuntime(input: RepairInput): Promise<ChapterRuntimePackage>;
  isKnownPatchFailure(error: unknown): boolean;
}

/** Calls existing lower services without their producer, saves, finalizers or director routing. */
export function createChapterModelAdapters(deps: ChapterModelAdapterDependencies): Pick<ChapterStageServices,
  "write" | "assess" | "repair" | "knownRepairFailure"> {
  return {
    write: (run, prepared, call) => deps.writer.invoke(run, prepared, call),
    assess: (input: AssessInput) => deps.withReviewBudget(input.run, input.call, () => deps.assessment.assess({
      novelId: input.run.progress.unit.novelId, chapterId: input.run.progress.unit.chapterId,
      novelTitle: input.prepared.novelTitle, chapterTitle: input.prepared.chapterTitle, chapterOrder: input.run.progress.unit.order,
      targetWordCount: input.prepared.contextPackage.chapterWriteContext?.chapterMission.targetWordCount
        ?? input.prepared.contextPackage.chapter.targetWordCount ?? null,
      content: input.content, contextPackage: input.prepared.contextPackage,
      provider: input.run.snapshots.model.provider as LLMProvider, model: input.run.snapshots.model.model,
      repairReviewBaseline: input.repairReviewBaseline, styleRewriteBaseline: input.styleRewriteBaseline, persist: false,
    })),
    async repair(input) {
      const runtimePackage = await deps.repairRuntime(input);
      const result = await deps.patches.repair({
        novelId: input.run.progress.unit.novelId, chapterId: input.run.progress.unit.chapterId,
        novelTitle: input.prepared.novelTitle, chapterTitle: input.prepared.chapterTitle,
        content: input.content, issues: input.assessment.issues, issuesJson: JSON.stringify(input.assessment.assessment),
        repairContext: runtimePackage.context.chapterRepairContext, runtimePackage,
        provider: input.run.snapshots.model.provider as LLMProvider, model: input.run.snapshots.model.model,
        repairMode: input.run.snapshots.profile.repair.mode,
      });
      const applied = new Set(result.appliedPatchIds);
      // Every candidate needs fact verification, including non-style patches. Only the existing guard can authorize corrections.
      const styleRewriteBaseline = result.styleRewriteBaseline ?? {
        sourceContentHash: hashProductionContent(input.content), allowedCorrectionIssueIds: [],
        changes: result.plan.patches.filter(patch => applied.has(patch.id))
          .map(patch => ({ original: patch.targetExcerpt, replacement: patch.replacement })),
      };
      return { content: result.content, styleRewriteBaseline };
    },
    knownRepairFailure(error) {
      // The legacy service also wraps transport/schema failures in its patch error. An applied/generated plan is required.
      return deps.isKnownPatchFailure(error) && error !== null && typeof error === "object" && "plan" in error && error.plan
        ? "patch_plan_not_applicable" : null;
    },
  };
}
