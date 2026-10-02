import type {Prisma} from "@prisma/client";
import {artifactContentHash, type RunContract} from "../../modules/director";
import {parsePipelinePayload, stringifyPipelinePayload} from "../../services/novel/pipelineJobState";

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
      const chapters = await tx.chapter.findMany({where: {novelId, order: {gte: range.from, lte: range.to}}, orderBy: {order: "asc"}, select: {id: true, order: true, content: true}});
      if (chapters.length !== range.to-range.from+1 || chapters.some(chapter => !chapter.content?.trim())) throw new Error("请先保存本批次的章节正文。");
      content = chapters;
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
    payload.directorNext.resolvedDecisionCount = payload.directorNext.decisions.length;
    payload.replanAlertDetails = [];
    await tx.generationJob.update({where: {id: job.id}, data: {pendingManualRecovery: false, payload: stringifyPipelinePayload(payload)}});
  }
}
