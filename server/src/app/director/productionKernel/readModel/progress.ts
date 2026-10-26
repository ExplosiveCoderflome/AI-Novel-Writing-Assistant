import type { Prisma } from "@prisma/client";
import { FactIntegrityError, type RunContract, type RunControl, type ProductionProjection } from "../../../../modules/director";
import { STAGES, type StageId } from "../../../../modules/production";
import { productionBatchOwnerKey } from "../execution/ownership";
import { readKernelUnitOutcome } from "./completion";

type Reader=Pick<Prisma.TransactionClient,"chapter"|"productionUnitRun">;
type ChapterProgress=NonNullable<ProductionProjection["chapterProgress"]>;
const phases:Record<StageId,NonNullable<ChapterProgress["current"]>["phase"]>={prepare:"generating_chapters",draft:"generating_chapters",
  accept:"reviewing",repair:"repairing",verify:"reviewing",select:"finalizing",commit:"finalizing",reconcile:"finalizing"};

/** Source-page and run-record projection. Only saved claims identify the current chapter; labels never authorize work. */
export async function readKernelChapterProgress(db: Reader,contract: RunContract,control: RunControl):Promise<ChapterProgress> {
  const range=contract.chapterRange;
  if(!range || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from<1 || range.to<range.from)throw new FactIntegrityError("正文进度缺少有效的授权范围。");
  const chapters=await db.chapter.findMany({where:{novelId:contract.novelId,order:{gte:range.from,lte:range.to}},
    select:{id:true,novelId:true,order:true,title:true,content:true},orderBy:{order:"asc"}});
  if(new Set(chapters.map(chapter=>chapter.order)).size !== chapters.length)throw new FactIntegrityError("正文进度存在重复章节序号。");
  const outcomes=await Promise.all(chapters.map(chapter=>readKernelUnitOutcome(db,contract,chapter)));
  const progress:ChapterProgress={...range,total:range.to-range.from+1,done:outcomes.filter(outcome=>outcome?.status === "completed").length,current:null};
  const active=await db.productionUnitRun.findMany({where:{ownerKey:productionBatchOwnerKey(contract.runId),activeStage:{not:null}},
    select:{novelId:true,chapterId:true,progressJson:true,activeStage:true,activeRequestKey:true}});
  if(active.length>1)throw new FactIntegrityError("正文进度存在多个同时领取的章节。");
  for(const row of active){
    const chapter=chapters.find(value=>value.id === row.chapterId),unit=JSON.parse(row.progressJson).unit;
    if(!chapter || row.novelId !== contract.novelId || unit?.novelId !== chapter.novelId || unit.chapterId !== chapter.id || unit.order !== chapter.order)throw new FactIntegrityError("正文进度的章节身份与授权范围不一致。");
    if(!row.activeRequestKey || !STAGES.includes(row.activeStage as StageId))throw new FactIntegrityError("正文进度的阶段领取记录无效。");
    if(control.status === "running" && control.cursorStepId === "chapter_batch")progress.current={order:chapter.order,title:chapter.title,phase:phases[row.activeStage as StageId]};
  }
  return progress;
}
