import type { StyleRewriteBaseline } from "@ai-novel/shared/types/styleEngine";
import type { StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { executeScoped } from "./execution";
import { preparedChapter, savedAssessment, stageWireData } from "./snapshots";
import { projectAcceptance } from "./acceptanceProjection";

export function createVerifyStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => services.describe("verify", run, stageWireData({ prepared: preparedChapter(run), content: run.artifacts.candidate,
      baseline: savedAssessment(run, "accept"), repair: run.artifacts.stageData?.repair ?? null })),
    execute: (run, invocation) => executeScoped(services, run, invocation, async call => {
      const repair = run.artifacts.stageData?.repair as { styleRewriteBaseline?: StyleRewriteBaseline } | undefined;
      const styleRewriteBaseline = repair?.styleRewriteBaseline;
      const content = run.artifacts.candidate!;
      const result = await services.assess({ run, prepared: preparedChapter(run), content, call, persistAssessment: false,
        repairReviewBaseline: savedAssessment(run, "accept").assessment, ...(styleRewriteBaseline ? { styleRewriteBaseline } : {}) });
      return { result: { stage: "verify", verdict: projectAcceptance({ content, stage: "verify", assessment: result.assessment,
        originalContentHash: run.progress.original!.contentHash, allowedCorrectionIssueIds: styleRewriteBaseline?.allowedCorrectionIssueIds,
        replan: services.replanScope?.(result) }) }, artifacts: { stageData: { verify: stageWireData(result) } } };
    }),
  };
}
