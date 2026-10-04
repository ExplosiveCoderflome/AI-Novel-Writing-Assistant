import {prisma} from "../../../db/prisma";
import {FactIntegrityError, PrismaEventLog, type RunContract, type RunControl, type ProductionProjection} from "../../../modules/director";
import {parsePipelinePayload, isPipelineActiveStage} from "../../../services/novel/pipelineJobState";
import {isCurrentChapterProductionCompleted} from "../../../services/novel/production/completion";
import {CHAPTER_ARTIFACT_BOUNDARY_TYPE} from "../../../services/novel/runtime/artifactSync";

/** Read saved production facts only. Never claim a live chapter from a human-readable job label. */
export async function readProductionProjection({contract, control}: {contract: RunContract; control: RunControl}): Promise<ProductionProjection> {
  const range = contract.chapterRange;
  const target = contract.launchInput?.estimatedChapterCount ?? 0;
  const saved = await prisma.chapter.findMany({where:{novelId:contract.novelId},
    select:{order:true,content:true},orderBy:{order:"asc"}});
  const written = new Set(saved.filter(chapter=>chapter.content?.trim()).map(chapter=>chapter.order));
  // Recommend the first unwritten gap, stopping before any saved prose or the frozen book target.
  let from = 1;
  while (from <= target && written.has(from)) from++;
  let to = from;
  while (to < Math.min(target, from+2) && !written.has(to+1)) to++;
  const nextLaunchRange = from <= target ? {from, to} : null;
  if (!range) return {chapterProgress:null, nextLaunchRange};
  if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 1 || range.to < range.from) {
    throw new FactIntegrityError("正文进度缺少有效的授权范围。");
  }
  const chapters = await prisma.chapter.findMany({where:{novelId:contract.novelId,order:{gte:range.from,lte:range.to}},
    select:{id:true,order:true,title:true,content:true,generationState:true,chapterStatus:true,riskFlags:true,
      artifactSyncCheckpoints:{where:{artifactType:CHAPTER_ARTIFACT_BOUNDARY_TYPE,status:"succeeded"},
        select:{contentHash:true,metadataJson:true},orderBy:{updatedAt:"desc"},take:6}}});
  if (new Set(chapters.map(chapter=>chapter.order)).size !== chapters.length) throw new FactIntegrityError("正文进度存在重复章节序号。");
  const chapterProgress: NonNullable<ProductionProjection["chapterProgress"]> = {...range,
    total:range.to-range.from+1, done:chapters.filter(isCurrentChapterProductionCompleted).length, current:null};
  const binding = (await new PrismaEventLog().list(contract.runId)).find(event=>event.type === "chapter_batch_job");
  if (!binding) return {chapterProgress,nextLaunchRange};
  const jobId = (binding.payload as {jobId?:unknown})?.jobId;
  if (typeof jobId !== "string" || !jobId) throw new FactIntegrityError("正文进度的作业绑定损坏。");
  const job = await prisma.generationJob.findUnique({where:{id:jobId},select:{novelId:true,startOrder:true,endOrder:true,payload:true,
    status:true,pendingManualRecovery:true,currentStage:true,currentItemKey:true}});
  if (!job || job.novelId !== contract.novelId || parsePipelinePayload(job.payload).directorNext?.runId !== contract.runId
    || job.startOrder !== range.from || job.endOrder !== range.to) throw new FactIntegrityError("正文进度的作业与本次创作范围不一致。");
  if (control.status === "running" && control.cursorStepId === "chapter_batch" && job.status === "running" && !job.pendingManualRecovery && job.currentItemKey) {
    const chapter = chapters.find(item=>item.id === job.currentItemKey);
    if (!chapter) throw new FactIntegrityError("正在处理的章节不属于本书授权范围。");
    if (isPipelineActiveStage(job.currentStage) && job.currentStage !== "queued") {
      chapterProgress.current = {order:chapter.order,title:chapter.title,phase:job.currentStage};
    }
  }
  return {chapterProgress,nextLaunchRange};
}
