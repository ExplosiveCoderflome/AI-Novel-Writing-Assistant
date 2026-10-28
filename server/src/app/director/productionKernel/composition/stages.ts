import { createChapterStagePorts, createChapterModelAdapters, type UnitPorts } from "../../../../modules/production";
import { runTextPrompt } from "../../../../prompting/core/promptRunner";
import { resolvePromptContextBlocksForAsset } from "../../../../prompting/context/promptContextResolution";
import { ChapterAcceptanceAssessmentService } from "../../../../services/novel/runtime/ChapterAcceptanceAssessmentService";
import { ChapterPatchRepairService, ChapterPatchRepairFailedError } from "../../../../services/novel/chapterPatchRepairService";
import { buildRuntimePackage } from "../../../../services/novel/runtime/chapterRuntimePackageBuilders";
import { openConflictService } from "../../../../services/state/OpenConflictService";
import { PlannerService } from "../../../../services/planner/PlannerService";
import { createKernelNativeStagePrompts } from "../prompts/stageServices";
import { createKernelReviewBudget } from "../execution/reviewBudget";
import { nativeWriterContext } from "./contexts";
import { nativePreparation, nativeRuntimeRequest } from "./preparation";
import { nativeReconcile } from "./reconciliation";
import type { NativeStageDependencies } from "./types";
import {readManualChapterRequest} from "../manual/contract";

export function createNativeKernelStages(deps: NativeStageDependencies): UnitPorts["stages"] {
  const planner = new PlannerService(), review = createKernelReviewBudget(deps.db, deps.context);
  const native = createKernelNativeStagePrompts({ preflight: deps.preflight, budget: deps.budget,
    fence: deps.fence, requestLimit: () => 32, resolveWriterContext: nativeWriterContext(deps),
    resolveAcceptanceContext: resolvePromptContextBlocksForAsset, invokeWriter: runTextPrompt,
    buildRepairRuntime: async input => buildRuntimePackage({ novelId: input.run.progress.unit.novelId,
      chapterId: input.run.progress.unit.chapterId, request: nativeRuntimeRequest(deps, input.run),
      contextPackage: input.prepared.contextPackage, finalContent: input.content,
      auditResult: { score: input.assessment.score, auditReports: input.assessment.auditReports },
      activeOpenConflicts: await openConflictService.listOpenConflicts(input.run.progress.unit.novelId,
        { beforeChapterOrder: input.run.progress.unit.order, includeCurrentChapter: true, limit: 8 }),
      styleReview: { report: input.assessment.styleReviewReport ?? null, signalScan: input.assessment.styleSignalScan,
        autoRewritten: false, originalContent: null, finalContent: input.content },
      acceptance: input.assessment.assessment, runId: deps.context.runId, plannerService: planner }),
  });
  const adapters = createChapterModelAdapters({ writer: { invoke: native.write }, assessment: new ChapterAcceptanceAssessmentService(),
    patches: new ChapterPatchRepairService(), withReviewBudget: (run, _call, operation) => review(run, operation),
    repairRuntime: native.repairRuntime, isKnownPatchFailure: error => error instanceof ChapterPatchRepairFailedError });
  return { ...createChapterStagePorts({ purpose: readManualChapterRequest(deps.context.contract) ? "user_requested" : "automatic", readBaseline: deps.readBaseline,
    prepare: async () => { throw new Error("Native checkpointed preparation must be installed"); },
    describe: native.describe, scoped: native.scoped, ...adapters }, { reconcile: nativeReconcile(deps) }), prepare: nativePreparation(deps) };
}
