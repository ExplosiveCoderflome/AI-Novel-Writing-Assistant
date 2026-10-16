import {MANUAL_CHAPTER_SYNC_TYPE} from "../../services/novel/chapterEditor/synchronization";
import {buildChapterArtifactContentHash} from "../../services/novel/runtime/artifactSync/ChapterArtifactContentVersion";
import {directorCharacterCandidates} from "../../services/novel/characters/candidates";
import type {Prisma} from "@prisma/client";
import {artifactContentHash, type RunContract} from "../../modules/director";
import {parsePipelinePayload, stringifyPipelinePayload} from "../../services/novel/pipelineJobState";
import {AppError} from "../../middleware/errorHandler";
import {isCurrentV2ChapterProductionCompleted as isCurrentChapterProductionCompleted} from "../../services/novel/production/completion";
import {CHAPTER_ARTIFACT_BOUNDARY_TYPE} from "../../services/novel/runtime/artifactSync";
import {revalidateSavedPlanning} from "./recovery/missingPlanning";
import {saveChapterPlanEdit} from "./revisions/chapterPlan";
import {authorizeChapterBudget, readPausedChapterBudget, readChapterUsageCounters, observeChapterUsage} from "../../services/novel/production/usage";
import type {DirectorChapterBudgetGrant} from "@ai-novel/shared/types/director/chapterBudget";

/** Reads saved business assets in the same transaction as gate confirmation. */
export async function readEditedArtifact(input: {contract: RunContract; type: string; contentRef: string; chapterPlanEdit?: import("@ai-novel/shared/types/director/revision").ChapterPlanEdit}, tx: Prisma.TransactionClient) {
  if (input.chapterPlanEdit) {
    if (input.type !== "chapter_task_sheet") throw new AppError("只能编辑当前章节任务与场景。", 400);
    await saveChapterPlanEdit(input.contract, input.chapterPlanEdit, tx);
  }
  const novelId = input.contract.novelId;
  let content: unknown;
  let protectedUserContent = false;
  switch (input.type) {
    case "character_cast":
      content = {characters: await tx.character.findMany({where: {novelId}, orderBy: {id: "asc"}}), relations: await tx.characterRelation.findMany({where: {novelId}, orderBy: {id: "asc"}})};
      break;
    case "volume_strategy": {
      const version = await tx.volumePlanVersion.findFirstOrThrow({where: {novelId, status: "active"}, orderBy: {version: "desc"}});
      content = JSON.parse(version.contentJson) as unknown;
      break;
    }
    case "chapter_task_sheet": {
      const from = input.contract.chapterRange?.from;
      if (!from) throw new Error("缺少已授权的章节范围。");
      const chapters = await tx.volumeChapterPlan.findMany({where: {volume: {novelId, status: "active"}, chapterOrder: from}, orderBy: {id: "asc"}});
      if (chapters.length !== 1 || !chapters[0].taskSheet?.trim() || !chapters[0].sceneCards?.trim()) throw new Error("请保存完整的章节任务与场景计划。");
      content = chapters;
      break;
    }
    case "chapter_execution_contract": {
      const from = input.contract.chapterRange?.from;
      if (!from) throw new Error("缺少已授权的章节范围。");
      const chapter = await tx.chapter.findFirstOrThrow({where: {novelId, order: from}, select: {id: true, order: true, taskSheet: true, sceneCards: true, targetWordCount: true, mustAvoid: true}});
      if (!chapter.taskSheet?.trim() || !chapter.sceneCards?.trim()) throw new Error("请保存完整的章节执行计划。");
      content = chapter;
      break;
    }
    case "chapter_batch_closed": {
      const range = input.contract.chapterRange;
      if (!range) throw new Error("缺少正文授权范围。");
      const chapters = await tx.chapter.findMany({where: {novelId, order: {gte: range.from, lte: range.to}}, orderBy: {order: "asc"}, select: {id: true, order: true, content: true, updatedAt: true, generationState: true, chapterStatus: true, riskFlags: true,
        artifactSyncCheckpoints: {where: {OR: [{artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded"}, {artifactType: MANUAL_CHAPTER_SYNC_TYPE}]},
          select: {contentHash: true, metadataJson: true, artifactType: true}, orderBy: {updatedAt: "desc"}}}});
      if (chapters.length !== range.to-range.from+1 || chapters.some(chapter => !chapter.content?.trim())) throw new Error("请先保存本批次的章节正文。");
      if (chapters.some(chapter => !isCurrentChapterProductionCompleted(chapter))) throw new AppError("正文修改尚未完成状态同步，请在章节页面完成收尾后再确认。", 400);
      for (const chapter of chapters) {
        const locked = await tx.chapter.updateMany({where: {id: chapter.id, novelId, content: chapter.content}, data: {updatedAt: chapter.updatedAt}});
        if (!locked.count) throw new AppError("正文在确认期间发生变化，请检查修订后再继续。", 409);
      }
      protectedUserContent = chapters.some(chapter => chapter.artifactSyncCheckpoints.some(row =>
        row.artifactType === MANUAL_CHAPTER_SYNC_TYPE && row.contentHash === buildChapterArtifactContentHash(chapter.content ?? "")));
      content = chapters.map(({id, order, content}) => ({id, order, content}));
      break;
    }
    default: throw new Error("该阶段请使用确认结果，或从对应资产页面查看修改。");
  }
  return {contentRef: input.contentRef, contentHash: artifactContentHash(content), protectedUserContent};
}

export async function resumeBusiness(contract: RunContract, tx: Prisma.TransactionClient, chapterBudget?: DirectorChapterBudgetGrant) {
  const event = await tx.directorNextEvent.findFirst({where: {runId: contract.runId, type: "chapter_batch_job"}, orderBy: {seq: "desc"}});
  if (!event) {
    if (chapterBudget) throw new AppError("本次创作没有可调整的章节预算。",400);
    await revalidateSavedPlanning(contract,tx);return;
  }
  const binding = JSON.parse(event.payloadJson) as {jobId?: unknown};
  if (typeof binding.jobId !== "string") throw new Error("正文恢复绑定无效。");
  const job = await tx.generationJob.findUniqueOrThrow({where: {id: binding.jobId}});
  const payload = parsePipelinePayload(job.payload);
  if (job.novelId !== contract.novelId || payload.directorNext?.runId !== contract.runId) throw new Error("正文作业不属于本次运行。");
  if (chapterBudget && (!job.pendingManualRecovery || !["queued","running"].includes(job.status) || job.cancelRequestedAt)) {
    throw new AppError("暂停状态发生变化，请刷新后重试。",400);
  }
  if (job.pendingManualRecovery) {
    const pausedBudget = readPausedChapterBudget(payload.directorNext, job.id);
    if (chapterBudget) {
      const range = contract.chapterRange;
      const chapter = await tx.chapter.findFirst({where: {id: chapterBudget.chapterId, novelId: contract.novelId},select: {order: true}});
      if (!range || !chapter || chapter.order < range.from || chapter.order > range.to) throw new AppError("预算授权不属于本次章节范围。",400);
      try {
        const usage = await readChapterUsageCounters(job.id,tx);
        observeChapterUsage(payload.directorNext,chapterBudget.chapterId,usage.job,usage.batch);
        authorizeChapterBudget(payload.directorNext, job.id, chapterBudget);
      }
      catch (error) {throw new AppError(error instanceof Error ? error.message : "本章额度无效。",400);}
    } else if (pausedBudget) {
      throw new AppError("请在导演台确认本章新额度，再从保存进度继续。",400);
    }
    if (payload.directorNext.pendingCharacterReviewId) {
      await directorCharacterCandidates.assertResolved(contract.runId, payload.directorNext.pendingCharacterReviewId, tx);
      delete payload.directorNext.pendingCharacterReviewId;
    }
    if (payload.replanAlertDetails?.length || payload.directorNext.decisions.slice(payload.directorNext.resolvedDecisionCount ?? 0).some(decision => decision.issueCode === "quality.replan_required")) {
      const plan = await tx.volumePlanVersion.findFirst({where: {novelId: contract.novelId, status: "active"}, orderBy: {version: "desc"}, select: {updatedAt: true}});
      if (!plan || plan.updatedAt <= job.updatedAt) throw new AppError("请先从本书规划页保存调整后的章节路线，再继续创作。", 400);
    }
    payload.directorNext.resolvedDecisionCount = payload.directorNext.decisions.length;
    payload.replanAlertDetails = [];
    const data = {pendingManualRecovery: false, payload: stringifyPipelinePayload(payload)};
    if (chapterBudget) {
      const changed = await tx.generationJob.updateMany({where: {id: job.id, pendingManualRecovery: true, payload: job.payload},data});
      if (changed.count !== 1) throw new AppError("暂停状态发生变化，请刷新后重试。",409);
    } else await tx.generationJob.update({where: {id: job.id}, data});
  }
}

export async function cancelBusiness(contract: RunContract, tx: Prisma.TransactionClient) {
  const jobs = await tx.generationJob.findMany({where: {novelId: contract.novelId, status: {in: ["queued","running"]}}});
  for (const job of jobs) {
    if (parsePipelinePayload(job.payload).directorNext?.runId !== contract.runId) continue;
    await tx.generationJob.update({where: {id: job.id}, data: {cancelRequestedAt: new Date(), ...(job.status === "queued" ? {status: "cancelled", pendingManualRecovery: false} : {})}});
  }
}
