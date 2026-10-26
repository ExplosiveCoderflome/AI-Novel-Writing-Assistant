import type { Prisma } from "@prisma/client";
import type { RunContract } from "../../../../modules/director";
import type { UnitRun, PreparedChapter } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
import { AppError } from "../../../../middleware/errorHandler";

/** An explicit resume may invalidate an uncommitted decision only after the user saves a newer book route. */
export async function resetReplannedUnit(tx: Prisma.TransactionClient, contract: RunContract,
  pausedAt: Date, runs: UnitRun[]): Promise<void> {
  const replans=runs.filter(run=>run.progress.original?.verdict?.replan==="global_book");
  if(!replans.length)return;
  if(replans.length!==1)throw new AppError("存在多个待重规划章节，请检查运行记录。",409);
  const run=replans[0],unit=run.progress.unit,range=contract.chapterRange;
  if(!range||unit.novelId!==contract.novelId||unit.order<range.from||unit.order>range.to||run.activeStage
    ||run.progress.completed.includes("commit")||run.progress.committedContentHash)throw new AppError("已保存正文或未确认的请求不能重新规划，请检查章节。",409);
  const route=await tx.volumePlanVersion.findFirst({where:{novelId:contract.novelId,status:"active"},orderBy:{version:"desc"}});
  if(!route||route.updatedAt<=pausedAt)throw new AppError("请先从本书规划页保存调整后的章节路线，再继续创作。",400);
  const lockedRoute=await tx.volumePlanVersion.updateMany({where:{id:route.id,novelId:contract.novelId,
    updatedAt:route.updatedAt,contentJson:route.contentJson},data:{updatedAt:route.updatedAt}});
  if(lockedRoute.count!==1)throw new AppError("规划在恢复期间发生变化，请刷新后重试。",409);
  const baseline=(run.artifacts.prepared as unknown as PreparedChapter | undefined)?.baseline;
  if(!baseline)throw new AppError("章节缺少可核对的原始正文，请检查运行记录。",409);
  const chapter=await tx.chapter.findFirst({where:{id:unit.chapterId,novelId:unit.novelId,order:unit.order}});
  if(!chapter||chapter.content!==baseline.content)throw new AppError("正文已被修改，请先从章节页面检查。",409);
  const lockedChapter=await tx.chapter.updateMany({where:{id:unit.chapterId,novelId:unit.novelId,
    content:chapter.content,updatedAt:chapter.updatedAt},data:{updatedAt:chapter.updatedAt}});
  if(lockedChapter.count!==1)throw new AppError("正文在恢复期间发生变化。",409);
  const changed=await tx.productionUnitRun.updateMany({where:{id:run.id,ownerKey:run.ownerKey,novelId:unit.novelId,
    chapterId:unit.chapterId,version:run.version,activeStage:null,activeRequestKey:null},data:{
    progressJson:canonicalProductionJson({unit,completed:[],repairAttemptsUsed:0}),stageArtifactsJson:canonicalProductionJson({receipts:{}}),version:{increment:1}}});
  if(changed.count!==1)throw new AppError("重规划状态发生变化，请刷新后重试。",409);
  const latest=await tx.directorNextEvent.findFirst({where:{runId:contract.runId},orderBy:{seq:"desc"},select:{seq:true}});
  await tx.directorNextEvent.create({data:{id:`${contract.runId}:kernel-replan:${run.id}:${run.version}`,runId:contract.runId,
    seq:(latest?.seq??0)+1,type:"production_kernel_replan_reset",payloadJson:canonicalProductionJson({version:1,unitRunId:run.id,
      route:{id:route.id,updatedAt:route.updatedAt.toISOString()},previous:{version:run.version,progress:run.progress,artifacts:run.artifacts}})}});
}
