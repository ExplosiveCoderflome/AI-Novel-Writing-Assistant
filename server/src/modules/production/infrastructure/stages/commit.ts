import { ProtectedProductionContentError } from "../../common";
import { InvalidProductionRequestError, type StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { preparedChapter, stageWireData } from "./snapshots";

export function createCommitStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => services.describe("commit", run, stageWireData({ baseline: preparedChapter(run).baseline,
      selection: run.progress.selected, contentHash: run.progress.selectedContentHash })),
    execute: async run => {
      const prepared = preparedChapter(run);
      if (services.purpose === "automatic" && prepared.baseline.protectedUserContent) throw new ProtectedProductionContentError();
      const content = run.progress.selected === "candidate" ? run.artifacts.candidate : run.artifacts.original;
      if (!content || !run.progress.selectedContentHash) throw new InvalidProductionRequestError("No selected manuscript to commit");
      return { result: { stage: "commit", contentHash: run.progress.selectedContentHash }, chapterWrite: {
        expected: { content: prepared.baseline.content, updatedAt: prepared.baseline.updatedAt }, content,
        generationState: run.progress.selected === "candidate" ? "repaired" : "drafted",
        chapterStatus: run.progress.debts?.length ? "needs_repair" : "pending_review",
      } };
    },
  };
}
