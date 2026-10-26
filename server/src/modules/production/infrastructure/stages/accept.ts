import type { StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { executeScoped } from "./execution";
import { preparedChapter, stageWireData } from "./snapshots";
import { projectAcceptance } from "./acceptanceProjection";

export function createAcceptStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => services.describe("accept", run, stageWireData({ prepared: preparedChapter(run), content: run.artifacts.original })),
    execute: (run, invocation) => executeScoped(services, run, invocation, async call => {
      const content = run.artifacts.original!;
      const result = await services.assess({ run, prepared: preparedChapter(run), content, call, persistAssessment: false });
      return { result: { stage: "accept", verdict: projectAcceptance({ content, stage: "accept", assessment: result.assessment,
        replan: services.replanScope?.(result) }) }, artifacts: { stageData: { accept: stageWireData(result) } } };
    }),
  };
}
