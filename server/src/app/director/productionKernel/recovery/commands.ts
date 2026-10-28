import type { Prisma } from "@prisma/client";
import type { RunContract } from "../../../../modules/director";
import { hashProductionContent, applyUnitAction, parseProductionUnitRun } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
import { directorChapterBudgetGrantSchema, directorChapterTokenLimitSchema, type DirectorChapterBudgetGrant } from "@ai-novel/shared/types/director/chapterBudget";
import { AppError } from "../../../../middleware/errorHandler";
import { readKernelPausedChapterBudget } from "../readModel/budget";
import { BLOCKED, kernelBudgetMode } from "../execution/budgetReader";
import { productionBatchOwnerKey } from "../execution/ownership";
import { resetReplannedUnit } from "./replan";
import { assertKernelCharacterReviewsResolved } from "./characterReviews";
import {assertKernelStartReadiness} from "../readiness";

async function lockSourceCommand(tx: Prisma.TransactionClient, contract: RunContract) {
  const book = await tx.novel.updateMany({where:{id:contract.novelId,directorEpoch:contract.executionEpoch ?? 0,
    narrativeForm:{not:"short_story"},OR:[{directorVersion:"v2"},{directorVersion:null}]},data:{directorEpoch:{increment:0}}});
  if (book.count !== 1) throw new AppError("本书执行归属已变化，请刷新后重试。",409);
  const control = await tx.directorNextRunControl.findUniqueOrThrow({where:{runId:contract.runId}});
  if (control.novelId !== contract.novelId || control.status !== "paused") throw new AppError("暂停状态发生变化，请刷新后重试。",409);
  const locked = await tx.directorNextRunControl.updateMany({where:{runId:contract.runId,novelId:contract.novelId,
    version:control.version,status:control.status},data:{version:{increment:0}}});
  if (locked.count !== 1) throw new AppError("运行状态发生变化，请刷新后重试。",409);
  const saved = await tx.directorNextRun.findUniqueOrThrow({where:{id:contract.runId},select:{novelId:true,contractJson:true}});
  if (saved.novelId !== contract.novelId || canonicalProductionJson(JSON.parse(saved.contractJson)) !== canonicalProductionJson(contract)) {
    throw new AppError("运行授权范围已变化，请刷新后重试。",409);
  }
  return control;
}

/** Called only by the explicit source-page command, within its existing control/command/event transaction. */
export async function resumeKernelProduction(contract: RunContract, tx: Prisma.TransactionClient, grant?: DirectorChapterBudgetGrant) {
  await assertKernelStartReadiness(tx,contract);
  const control = await lockSourceCommand(tx,contract), pause = JSON.parse(control.pauseJson ?? "null");
  await assertKernelCharacterReviewsResolved(tx,contract);
  const budget = await readKernelPausedChapterBudget(tx,contract,{status:"paused",pause});
  if (budget) {
    if (!grant) throw new AppError("请在导演台确认本章新额度，再从保存进度继续。",400);
    const valid = directorChapterBudgetGrantSchema.safeParse(grant);
    if (!valid.success || grant.jobId !== budget.jobId || grant.chapterId !== budget.chapterId) throw new AppError("预算授权与暂停章节不一致。",400);
    if (grant.metric !== budget.metric) throw new AppError("预算计量口径发生变化，请刷新后重试。",400);
    if (grant.tokenLimit <= budget.tokenLimit || grant.tokenLimit <= budget.usedTokens + budget.reserveTokens
      || grant.applyToRemaining && !directorChapterTokenLimitSchema.safeParse(grant.tokenLimit).success) throw new AppError("本章额度须高于已用量、下一步预留及当前上限。",400);
    await tx.chapterArtifactSyncCheckpoint.updateMany({where:{novelId:contract.novelId,chapterId:budget.chapterId,
      syncMode:kernelBudgetMode(contract.runId),artifactType:BLOCKED,status:"blocked"},data:{status:"authorized"}});
    // The command repository appends the immutable chapter_budget_granted event before committing.
  } else if (grant) throw new AppError("本次暂停没有可调整的章节预算。",400);
  const rows = await tx.productionUnitRun.findMany({where:{ownerKey:productionBatchOwnerKey(contract.runId)}});
  const runs=rows.map(parseProductionUnitRun);
  await resetReplannedUnit(tx,contract,control.updatedAt,runs);
  const paused = runs.filter(run=>run.progress.qualityPause && !run.progress.qualityPause.acknowledged);
  if (paused.length > 1) throw new AppError("质量暂停的章节不唯一，请检查运行记录。",409);
  for (const run of paused) {
    const unit = run.progress.unit, range = contract.chapterRange;
    if (!range || unit.novelId !== contract.novelId || unit.order < range.from || unit.order > range.to || run.activeStage) throw new AppError("质量暂停的章节范围无效。",409);
    const chapter = await tx.chapter.findFirst({where:{id:unit.chapterId,novelId:contract.novelId,order:unit.order},select:{content:true,updatedAt:true}});
    if (!chapter?.content || hashProductionContent(chapter.content) !== run.progress.committedContentHash) throw new AppError("正文已被修改，请先从章节页面检查。",409);
    const locked = await tx.chapter.updateMany({where:{id:unit.chapterId,novelId:contract.novelId,content:chapter.content,updatedAt:chapter.updatedAt},data:{updatedAt:chapter.updatedAt}});
    if (locked.count !== 1) throw new AppError("正文在恢复期间发生变化。",409);
    const progress = applyUnitAction(run.progress,{kind:"acknowledge_quality_pause",contentHash:run.progress.committedContentHash!});
    const changed = await tx.productionUnitRun.updateMany({where:{id:run.id,ownerKey:run.ownerKey,novelId:unit.novelId,chapterId:unit.chapterId,
      version:run.version,activeStage:null,activeRequestKey:null},data:{progressJson:canonicalProductionJson(progress),version:{increment:1}}});
    if (changed.count !== 1) throw new AppError("质量暂停状态发生变化。",409);
  }
  // Unknown active requests are retained. Resuming can only recover a durable result, never clear the claim or retry it.
}

export async function cancelKernelProduction(contract: RunContract, tx: Prisma.TransactionClient) {
  const run = await tx.directorNextRun.findUniqueOrThrow({where:{id:contract.runId},select:{novelId:true}});
  if (run.novelId !== contract.novelId) throw new AppError("取消的运行不属于本书。",409);
  // The surrounding command transaction changes control status/version; all captured worker identities then fail.
  // A replaced book epoch cannot prevent cancellation of this old run; the newer run and manuscript remain untouched.
}
