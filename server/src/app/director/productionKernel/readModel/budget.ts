import type { RunContract, RunControl } from "../../../../modules/director";
import type { DirectorChapterBudgetStage, DirectorChapterBudgetView } from "@ai-novel/shared/types/director/chapterBudget";
import { parseProductionUnitRun, type StageId } from "../../../../modules/production";
import { BLOCKED, kernelBudgetMode, readKernelChapterBudget, type KernelBudgetReader, type Reserved } from "../execution/budgetReader";
import { productionBatchOwnerKey } from "../execution/ownership";

const stageNames: Record<StageId,DirectorChapterBudgetStage> = {prepare:"draft",draft:"draft",accept:"review",repair:"repair",
  verify:"review",select:"review",commit:"artifact_sync",reconcile:"artifact_sync"};

/** The legacy field jobId carries the actual ProductionUnitRun id for kernel batches. No GenerationJob is fabricated. */
export async function readKernelPausedChapterBudget(db: KernelBudgetReader, contract: RunContract,
  control: Pick<RunControl,"status" | "pause">): Promise<DirectorChapterBudgetView | null> {
  if (control.status !== "paused" || control.pause?.kind !== "manual_recovery") return null;
  const rows = await db.productionUnitRun.findMany({where:{ownerKey:productionBatchOwnerKey(contract.runId)}});
  const pending = rows.map(parseProductionUnitRun).filter(run=>run.artifacts.deferredDescriptor);
  if (pending.length > 1) throw new Error("预算暂停的章节记录不一致，请检查运行记录。");
  const run = pending[0];
  if (!run || run.activeStage || run.progress.qualityPause && !run.progress.qualityPause.acknowledged) return null;
  const unit = run.progress.unit, stage = run.artifacts.deferredDescriptor!.stage;
  const blocked = await db.chapterArtifactSyncCheckpoint.findMany({where:{novelId:contract.novelId,chapterId:unit.chapterId,
    syncMode:kernelBudgetMode(contract.runId),artifactType:BLOCKED,status:"blocked"},orderBy:{updatedAt:"desc"},select:{contentHash:true,metadataJson:true}});
  if (!blocked.length) return null;
  const record = JSON.parse(blocked[0].metadataJson ?? "null") as Reserved;
  if (!record || record.version !== 1 || record.runId !== contract.runId || record.requestKey !== blocked[0].contentHash
    || !Number.isSafeInteger(record.tokens) || record.tokens < 1) throw new Error("章节预算暂停记录损坏，请检查运行记录。");
  const budget = await readKernelChapterBudget(db,contract,unit);
  const recommendedLimit = Math.min(10_000_000,Math.ceil((Math.max(budget.limit,budget.used + record.tokens)+16_000)/1000)*1000);
  return {jobId:run.id,chapterId:unit.chapterId,chapterOrder:unit.order,metric:budget.metric,
    usedTokens:budget.used,rawTokens:budget.rawTokens,promptTokens:budget.promptTokens,completionTokens:budget.completionTokens,
    cacheHitTokens:budget.cacheHitTokens,unclassifiedTokens:budget.unclassifiedTokens,tokenLimit:budget.limit,
    reserveTokens:record.tokens,recommendedLimit,stage:stageNames[stage],closed:false};
}
