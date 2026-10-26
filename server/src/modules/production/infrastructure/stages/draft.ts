import { hashProductionContent, type StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { executeScoped } from "./execution";
import { preparedChapter, stageWireData } from "./snapshots";

export function createDraftStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => {
      const prepared = preparedChapter(run);
      if (prepared.baseline.content?.trim()) return Promise.resolve({ callsModel: false,
        inputFingerprint: hashProductionContent(prepared.baseline.content), promptVersion: "existing_manuscript@1",
        configVersion: run.snapshots.model.configVersion, input: stageWireData({ baseline: prepared.baseline }) });
      return services.describe("draft", run, stageWireData({ prepared }));
    },
    execute: async (run, invocation) => {
      const prepared = preparedChapter(run);
      if (prepared.baseline.content?.trim()) return {
        result: { stage: "draft", contentHash: hashProductionContent(prepared.baseline.content) },
        artifacts: { original: prepared.baseline.content } };
      return executeScoped(services, run, invocation, async call => {
        // Match the legacy writer boundary: a single empty result is not a license to generate again.
        const content = (await services.write(run, prepared, call)).trim();
        if (content) return { result: { stage: "draft", contentHash: hashProductionContent(content) }, artifacts: { original: content } };
        return { result: { stage: "draft", contentHash: null } };
      });
    },
  };
}
