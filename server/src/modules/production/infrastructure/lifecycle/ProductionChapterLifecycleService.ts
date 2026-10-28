import type { Prisma } from "@prisma/client";
import { ProductionVersionConflictError } from "../../common";
import { hashProductionContent, InvalidProductionRequestError, type ChapterWrite, type UnitRun, type UnitRunUpdate } from "../../application";
import { publishSelectedAssessment } from "./selectedAssessment";
import {projectSelectedQualityLoop} from "./selectedQualityDebt";

/**
 * Approved G1 isolation: owns selected prose and its eventual chapter lifecycle closure.
 * The progress repository calls this inside the same transaction as its claim CAS/receipt.
 * No model calls, timeline writes or background work belong here. Final reports share the reconcile receipt transaction.
 */
export class ProductionChapterLifecycleService {
  async finalizeSelected(tx: Prisma.TransactionClient, expected: UnitRun, next: UnitRunUpdate): Promise<void> {
    const progress = next.progress;
    const content = progress.selected === "candidate" ? next.artifacts.candidate : next.artifacts.original;
    if (expected.activeStage !== "reconcile" || !expected.activeRequestKey || next.activeStage || next.activeRequestKey
      || !progress.completed.includes("commit") || !progress.completed.includes("reconcile")
      || !["completed","degraded"].includes(progress.reconcileStatus ?? "") || !progress.selected || !content?.trim()
      || hashProductionContent(content) !== progress.selectedContentHash || progress.committedContentHash !== progress.selectedContentHash
      || (progress.qualityPause && !progress.qualityPause.acknowledged)) {
      throw new InvalidProductionRequestError("Only a saved, reconciled manuscript may publish chapter completion");
    }
    const {novelId,chapterId} = progress.unit;
    const current = await tx.chapter.findFirst({where:{id:chapterId,novelId},select:{content:true,riskFlags:true,updatedAt:true}});
    if (!current || current.content !== content) throw new ProductionVersionConflictError();
    const locked = await tx.chapter.updateMany({where:{id:chapterId,novelId,content,updatedAt:current.updatedAt},data:{updatedAt:current.updatedAt}});
    if (locked.count !== 1) throw new ProductionVersionConflictError();
    const reviewed = await publishSelectedAssessment(tx,{...expected,...next});
    let flags: Record<string,unknown> = {};
    if (current.riskFlags) {
      try { flags = JSON.parse(current.riskFlags); } catch { throw new InvalidProductionRequestError("Invalid chapter risk metadata"); }
      if (!flags || typeof flags !== "object" || Array.isArray(flags)) throw new InvalidProductionRequestError("Invalid chapter risk metadata");
    }
    flags.productionKernel = {runId:expected.id,contentHash:progress.selectedContentHash,selection:progress.selected,
      reason:progress.selectionReasonCode ?? null};
    const qualityLoop = projectSelectedQualityLoop({...expected,...next}, new Date().toISOString());
    if (qualityLoop) flags.qualityLoop = qualityLoop;
    await tx.chapter.update({where:{id:chapterId},data:{generationState:reviewed ? "approved" : "reviewed",
      chapterStatus:"completed",riskFlags:JSON.stringify(flags)}});
  }

  async commit(tx: Prisma.TransactionClient, run: UnitRun, write: ChapterWrite): Promise<void> {
    if (run.activeStage !== "commit" || !run.activeRequestKey || !run.progress.selectedContentHash
      || !write.content.trim() || hashProductionContent(write.content) !== run.progress.selectedContentHash) {
      throw new InvalidProductionRequestError("Only the selected non-empty manuscript may be committed");
    }
    const timestamp = new Date(write.expected.updatedAt);
    if (!Number.isFinite(timestamp.getTime())) throw new InvalidProductionRequestError("Invalid chapter version timestamp");
    const saved = await tx.chapter.updateMany({
      where: { id: run.progress.unit.chapterId, novelId: run.progress.unit.novelId,
        content: write.expected.content, updatedAt: timestamp },
      data: { content: write.content, generationState: write.generationState, chapterStatus: write.chapterStatus },
    });
    if (saved.count !== 1) throw new ProductionVersionConflictError();
  }
}
