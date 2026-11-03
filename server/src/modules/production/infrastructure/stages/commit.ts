import { ProtectedProductionContentError } from "../../common";
import { hashProductionContent, InvalidProductionRequestError, PostGenerationStyleReviewRejectedError, type StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { preparedChapter, stageWireData } from "./snapshots";

function continuationConstraints(contextPackage: ReturnType<typeof preparedChapter>["contextPackage"]): string[] {
  return [...(contextPackage.chapterWriteContext?.continuationConstraints ?? []),
    ...(contextPackage.chapterReviewContext?.continuationConstraints ?? [])];
}

export function createCommitStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => services.describe("commit", run, stageWireData({ baseline: preparedChapter(run).baseline,
      selection: run.progress.selected, contentHash: run.progress.selectedContentHash })),
    execute: async run => {
      const prepared = preparedChapter(run);
      if (services.purpose === "automatic" && prepared.baseline.protectedUserContent) throw new ProtectedProductionContentError();
      const content = run.progress.selected === "candidate" ? run.artifacts.candidate : run.artifacts.original;
      if (!content || !run.progress.selectedContentHash) throw new InvalidProductionRequestError("No selected manuscript to commit");
      // Optional post-generation review. The port must be explicitly installed and the
      // book switch explicitly true; a rejection blocks commit instead of succeeding quietly.
      // TODO(P1-3): a real runner adapter must reserve its model budget and reuse the
      // kernel fence/CAS contract before runtime composition installs it.
      const review = services.postGenerationStyleReview;
      const acknowledged = run.progress.styleReviewPause?.acknowledged === true
        && run.progress.styleReviewPause.contentHash === run.progress.selectedContentHash;
      if (review && !acknowledged && prepared.contextPackage.postGenerationStyleReviewEnabled === true) {
        const verdict = await review.review({
          enabled: true, novelId: run.progress.unit.novelId, chapterId: run.progress.unit.chapterId,
          order: run.progress.unit.order, content, continuationConstraints: continuationConstraints(prepared.contextPackage),
          provider: run.snapshots.model.provider, model: run.snapshots.model.model,
        });
        if (verdict.status === "fail") {
          throw new PostGenerationStyleReviewRejectedError(verdict.code, verdict.reason, hashProductionContent(content));
        }
      }
      return { result: { stage: "commit", contentHash: run.progress.selectedContentHash }, chapterWrite: {
        expected: { content: prepared.baseline.content, updatedAt: prepared.baseline.updatedAt }, content,
        generationState: run.progress.selected === "candidate" ? "repaired" : "drafted",
        chapterStatus: run.progress.debts?.length ? "needs_repair" : "pending_review",
      } };
    },
  };
}
