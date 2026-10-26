import { hashProductionContent, type StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { executeScoped } from "./execution";
import { preparedChapter, savedAssessment, stageWireData } from "./snapshots";

export function createRepairStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => services.describe("repair", run, stageWireData({ prepared: preparedChapter(run), content: run.artifacts.original,
      assessment: savedAssessment(run, "accept") })),
    execute: (run, invocation) => executeScoped(services, run, invocation, async call => {
      let repaired: Awaited<ReturnType<ChapterStageServices["repair"]>>;
      try { repaired = await services.repair({ run, prepared: preparedChapter(run), content: run.artifacts.original!,
        assessment: savedAssessment(run, "accept"), call }); }
      catch (error) {
        const failureCode = services.knownRepairFailure(error);
        if (!failureCode) throw error;
        return { result: { stage: "repair", outcome: "failed", failureCode } };
      }
      const content = repaired.content;
      if (!content.trim() || content === run.artifacts.original) return { result: { stage: "repair", outcome: "unchanged" } };
      return { result: { stage: "repair", outcome: "candidate", contentHash: hashProductionContent(content) },
        artifacts: { candidate: content, stageData: { repair: stageWireData(repaired) } } };
    }),
  };
}
