import type {Prisma} from "@prisma/client";
import {artifactContentHash, type RunContract} from "../../modules/director";
import {parsePipelinePayload, stringifyPipelinePayload} from "../../services/novel/pipelineJobState";
import {AppError} from "../../middleware/errorHandler";
import {isCurrentChapterProductionCompleted} from "../../services/novel/production/completion";
import {CHAPTER_ARTIFACT_BOUNDARY_TYPE} from "../../services/novel/runtime/artifactSync";

/** Reads saved business assets in the same transaction as gate confirmation. */
export async function readEditedArtifact(input: {contract: RunContract; type: string; contentRef: string}, tx: Prisma.TransactionClient) {
  const novelId = input.contract.novelId;
  let content: unknown;
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
      const chapters = await tx.volumeChapterPlan.findMany({where: {volume: {novelId}, chapterOrder: from}, orderBy: {id: "asc"}});
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
      const chapters = await tx.chapter.findMany({where: {novelId, order: {gte: range.from, lte: range.to}}, orderBy: {order: "asc"}, select: {id: true, order: true, content: true, generationState: true, chapterStatus: true, riskFlags: true,
        artifactSyncCheckpoints: {where: {artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded"},
          select: {contentHash: true, metadataJson: true}, orderBy: {updatedAt: "desc"}, take: 6}}});
      if (chapters.length !== range.to-range.from+1 || chapters.some(chapter => !chapter.content?.trim())) throw new Error("请先保存本批次的章节正文。");
      if (chapters.some(chapter => !isCurrentChapterProductionCompleted(chapter))) throw new AppError("正文修改尚未完成状态同步，请在章节页面完成收尾后再确认。", 400);
      content = chapters.map(({id, order, content}) => ({id, order, content}));
      break;
    }
    default: throw new Error("该阶段请使用确认结果，或从对应资产页面查看修改。");
  }
  return {contentRef: input.contentRef, contentHash: artifactContentHash(content)};
}

export async function resumeBusiness(contract: RunContract, tx: Prisma.TransactionClient) {
  const event = await tx.directorNextEvent.findFirst({where: {runId: contract.runId, type: "chapter_batch_job"}, orderBy: {seq: "desc"}});
  if (!event) return;
  const binding = JSON.parse(event.payloadJson) as {jobId?: unknown};
  if (typeof binding.jobId !== "string") throw new Error("正文恢复绑定无效。");
  const job = await tx.generationJob.findUniqueOrThrow({where: {id: binding.jobId}});
  const payload = parsePipelinePayload(job.payload);
  if (job.novelId !== contract.novelId || payload.directorNext?.runId !== contract.runId) throw new Error("正文作业不属于本次运行。");
  if (job.pendingManualRecovery) {
    if (payload.replanAlertDetails?.length || payload.directorNext.decisions.slice(payload.directorNext.resolvedDecisionCount ?? 0).some(decision => decision.issueCode === "quality.replan_required")) {
      const plan = await tx.volumePlanVersion.findFirst({where: {novelId: contract.novelId, status: "active"}, orderBy: {version: "desc"}, select: {updatedAt: true}});
      if (!plan || plan.updatedAt <= job.updatedAt) throw new AppError("请先从本书规划页保存调整后的章节路线，再继续创作。", 400);
    }
    payload.directorNext.resolvedDecisionCount = payload.directorNext.decisions.length;
    payload.replanAlertDetails = [];
    await tx.generationJob.update({where: {id: job.id}, data: {pendingManualRecovery: false, payload: stringifyPipelinePayload(payload)}});
  }
}

export async function cancelBusiness(contract: RunContract, tx: Prisma.TransactionClient) {
  const jobs = await tx.generationJob.findMany({where: {novelId: contract.novelId, status: {in: ["queued","running"]}}});
  for (const job of jobs) {
    if (parsePipelinePayload(job.payload).directorNext?.runId !== contract.runId) continue;
    await tx.generationJob.update({where: {id: job.id}, data: {cancelRequestedAt: new Date(), ...(job.status === "queued" ? {status: "cancelled", pendingManualRecovery: false} : {})}});
  }
}
