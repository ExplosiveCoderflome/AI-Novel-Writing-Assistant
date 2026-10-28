import type { Prisma } from "@prisma/client";
import type { RunContract } from "../../../../modules/director";
import { hashProductionContent, type UnitArtifacts, type UnitOutcome, type UnitProgress } from "../../../../modules/production";
import { productionBatchOwnerKey } from "../execution/ownership";
import type { KernelBatchChapter } from "../batch/handler";
import {readManualChapterRequest} from "../manual/contract";

type Reader = Pick<Prisma.TransactionClient,"chapter" | "productionUnitRun">;
/** Reads durable closure only. Never starts/resumes a unit, clears a pause or manufactures legacy receipts. */
export async function readKernelUnitOutcome(db: Reader, contract: RunContract, chapter: KernelBatchChapter): Promise<UnitOutcome | undefined> {
  const range = contract.chapterRange;
  if (!range || chapter.novelId !== contract.novelId || chapter.order < range.from || chapter.order > range.to) {
    throw new Error("Kernel completion chapter is outside the authorized scope");
  }
  const current = await db.chapter.findFirst({where:{id:chapter.id,novelId:contract.novelId,order:chapter.order},
    select:{content:true,riskFlags:true,generationState:true,chapterStatus:true}});
  if (!current) throw new Error("Kernel completion chapter identity changed");
  const flags = current.riskFlags ? JSON.parse(current.riskFlags) : null;
  const reference = flags?.productionKernel as {runId?: string; contentHash?: string} | undefined;
  let row = await db.productionUnitRun.findUnique({where:{ownerKey_chapterId:{ownerKey:productionBatchOwnerKey(contract.runId),chapterId:chapter.id}}});
  // A new batch may reuse a prior closed chapter, but only the unit named by that chapter's terminal receipt.
  if (!row && reference?.runId && !readManualChapterRequest(contract)) row = await db.productionUnitRun.findUnique({where:{id:reference.runId}});
  if (!row) return undefined;
  const progress = JSON.parse(row.progressJson) as UnitProgress, artifacts = JSON.parse(row.stageArtifactsJson) as UnitArtifacts;
  if (row.novelId !== contract.novelId || row.chapterId !== chapter.id || progress.unit?.novelId !== contract.novelId
    || progress.unit.chapterId !== chapter.id || progress.unit.order !== chapter.order || !Array.isArray(progress.completed)) {
    throw new Error("Kernel completion unit identity differs from the chapter");
  }
  if (!progress.completed.includes("reconcile") || row.activeStage) return undefined;
  const failed = (): UnitOutcome => ({status:"failed",progress,reason:"data_integrity"});
  const committed = artifacts.receipts?.commit?.result, reconciled = artifacts.receipts?.reconcile?.result;
  if (!progress.selected || !progress.selectedContentHash || !progress.completed.includes("commit") || !current.content?.trim()
    || hashProductionContent(current.content) !== progress.selectedContentHash || progress.committedContentHash !== progress.selectedContentHash
    || committed?.stage !== "commit" || committed.contentHash !== progress.committedContentHash
    || reconciled?.stage !== "reconcile" || reconciled.status !== progress.reconcileStatus
    || !["completed","degraded"].includes(progress.reconcileStatus ?? "")
    || !["approved","reviewed"].includes(current.generationState) || current.chapterStatus !== "completed"
    || reference?.runId !== row.id || reference.contentHash !== progress.selectedContentHash
    || (progress.qualityPause && !progress.qualityPause.acknowledged)) return failed();
  return {status:"completed",progress};
}
