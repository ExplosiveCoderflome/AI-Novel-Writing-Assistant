import {readManualChapterSync} from "../../../../services/novel/chapterEditor/synchronization/ManualChapterSyncStore";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { sha256 } from "../domain/source";
export type ManuscriptDb = Prisma.TransactionClient;
export type ManuscriptSnapshot = {sourceHash:string;structureVersion:number;unitId:string|null;unitRevision:number|null;contentHash:string|null;baselineRevisionId:string|null;workingRevisionId:string|null;previous:Array<{id:string;hash:string}>};
export function json<T>(value:string|null,empty:T):T{return value?JSON.parse(value) as T:empty;}
export async function readManuscriptState(db:ManuscriptDb,projectId:string,unitId?:string){
  const project=await db.manuscriptProject.findUnique({where:{id:projectId},include:{novel:true}});
  if(!project?.novelId||!project.novel)throw Error("MANUSCRIPT_NOT_FOUND");
  const source=await db.manuscriptSource.findFirst({where:{id:project.activeSourceId??"",projectId}});
  if(!source)throw Error("MANUSCRIPT_SOURCE_INVALID");
  const units=await db.manuscriptUnit.findMany({where:{projectId},orderBy:{displayOrder:"asc"}});
  const unit=unitId?units.find(item=>item.id===unitId):units.find(item=>item.status==="active");
  if(unitId&&!unit)throw Error("MANUSCRIPT_NOT_FOUND");
  const chapter=unit?.chapterId?await db.chapter.findFirst({where:{id:unit.chapterId,novelId:project.novelId}}):unit?.segmentId?await db.shortStorySegment.findFirst({where:{id:unit.segmentId,novelId:project.novelId},select:{id:true,content:true,updatedAt:true,version:true}}).then(segment=>segment?{...segment,title:unit.originalTitle,order:unit.displayOrder,novelId:project.novelId!,generationState:"drafted" as const}:null):null;
  if(unit&&!chapter)throw Error("MANUSCRIPT_SOURCE_INVALID");
  const working=project.workingOutlineProjectId?await db.outlineProject.findUnique({where:{id:project.workingOutlineProjectId}}):null;
  return {project,source,units,unit,chapter,working};
}
export async function takeManuscriptSnapshot(db:ManuscriptDb,projectId:string,unitId?:string):Promise<ManuscriptSnapshot>{
  const state=await readManuscriptState(db,projectId,unitId);
  const prior=state.unit?state.units.filter(item=>item.status==="active"&&item.displayOrder<state.unit!.displayOrder):[];
  const chapters=prior.length?await db.chapter.findMany({where:{novelId:state.project.novelId!,id:{in:prior.map(item=>item.chapterId!).filter(Boolean)}},select:{id:true,content:true}}):[];
  const segments=prior.length?await db.shortStorySegment.findMany({where:{novelId:state.project.novelId!,id:{in:prior.map(item=>item.segmentId!).filter(Boolean)}},select:{id:true,content:true}}):[];
  return {sourceHash:state.source.sourceHash,structureVersion:state.project.structureVersion,unitId:state.unit?.id??null,unitRevision:state.unit?.workingRevision??null,contentHash:state.chapter?sha256(state.chapter.content??""):null,baselineRevisionId:state.project.baselineOutlineRevisionId,workingRevisionId:state.working?.currentRevisionId??null,previous:prior.map(item=>({id:item.id,hash:sha256(chapters.find(chapter=>chapter.id===item.chapterId)?.content??segments.find(segment=>segment.id===item.segmentId)?.content??"")}))};
}
export async function assertManuscriptSnapshot(db:ManuscriptDb,projectId:string,snapshot:ManuscriptSnapshot){
  const current=await takeManuscriptSnapshot(db,projectId,snapshot.unitId??undefined);
  if(JSON.stringify(current)!==JSON.stringify(snapshot))throw Error("REVISION_BASE_STALE");
  return current;
}
export async function readActiveManuscriptChapters(db:ManuscriptDb,novelId:string){
  const project=await db.manuscriptProject.findUnique({where:{novelId}});
  if(!project)return null;
  const units=(await db.manuscriptUnit.findMany({where:{projectId:project.id,status:"active"},orderBy:{displayOrder:"asc"}})).filter(unit=>unit.status==="active").sort((a,b)=>a.displayOrder-b.displayOrder);
  const chapters=await db.chapter.findMany({where:{novelId,id:{in:units.map(unit=>unit.chapterId!).filter(Boolean)}}});
  const segments=await db.shortStorySegment.findMany({where:{novelId,id:{in:units.map(unit=>unit.segmentId!).filter(Boolean)}}});
  const results:Array<any>=[];
  for(const [index,unit] of units.entries()){const chapter=chapters.find(item=>item.id===unit.chapterId),segment=segments.find(item=>item.id===unit.segmentId);if(chapter)results.push({...chapter,order:index+1});else if(segment)results.push({id:segment.id,novelId,title:unit.originalTitle,order:index+1,content:segment.content,generationState:"drafted",updatedAt:segment.updatedAt,createdAt:segment.createdAt,expectation:null,chapterStatus:"drafted",targetWordCount:segment.targetWordCount,conflictLevel:null,revealLevel:null,mustAvoid:null,taskSheet:null,sceneCards:[],chapterSummary:null});}
  return results;
}
export function originalUnitText(sourceText:string,rangesJson:string):string{return json<Array<{start:number;end:number}>>(rangesJson,[]).map(range=>sourceText.slice(range.start,range.end)).join("");}
export class ManuscriptWorkspaceService {
 async byNovel(novelId:string,unitId?:string){const project=await prisma.manuscriptProject.findUnique({where:{novelId}});if(!project)throw Error("MANUSCRIPT_NOT_FOUND");return this.get(project.id,unitId);}
 async get(projectId:string,unitId?:string){
  const s=await readManuscriptState(prisma,projectId,unitId);
  const rows=await prisma.manuscriptRevisionProposal.findMany({where:{projectId,OR:[{unitId:s.unit?.id??""},{kind:"outline_baseline"},{kind:"structure"}]},orderBy:{createdAt:"desc"},take:40});
  const baselineProposal=await prisma.manuscriptRevisionProposal.findFirst({where:{projectId,kind:"outline_baseline",status:"applied"},orderBy:{createdAt:"desc"}});
  const baselineSourceType=baselineProposal?json<{sourceType?:string}>(baselineProposal.operationsJson,{}).sourceType:undefined;
   const baseline=s.project.baselineOutlineRevisionId?await prisma.outlineRevision.findUnique({where:{id:s.project.baselineOutlineRevisionId}}):null;
   const titles=await prisma.chapter.findMany({where:{novelId:s.project.novelId!},select:{id:true,title:true}});
   const units=s.units.map(unit=>({id:unit.id,chapterId:unit.chapterId??unit.segmentId,title:titles.find(ch=>ch.id===unit.chapterId)?.title??unit.originalTitle,displayOrder:unit.status==="active"?unit.displayOrder:0,status:unit.status,workingRevision:unit.workingRevision,contentHash:unit.contentHash??"",sourceRanges:json(unit.sourceRangesJson,[])}));
  const proposals=await Promise.all(rows.map(row=>this.proposalView(row)));
   const checkpoint=s.chapter&&!s.unit?.segmentId?await readManualChapterSync(s.project.novelId!,s.chapter.id,s.chapter.content??""):null;
   const syncState=!checkpoint?"not_requested":checkpoint.status==="succeeded"?"complete":checkpoint.status==="failed"?"failed":"pending";
   return {project:{id:s.project.id,novelId:s.project.novelId,title:s.project.novel!.title,structureVersion:s.project.structureVersion,baselineOutlineRevisionId:s.project.baselineOutlineRevisionId,baselineOutlineProjectId:baseline?.projectId??null,workingOutlineProjectId:s.project.workingOutlineProjectId,workingOutlineRevisionId:s.working?.currentRevisionId??null,baselineSourceType:baselineSourceType??baseline?.sourceType??null},source:{id:s.source.id,sourceHash:s.source.sourceHash,rawHash:s.source.rawHash,encoding:s.source.encoding,charCount:s.source.charCount,byteCount:s.source.rawBytes.byteLength,version:s.source.version,originalFileName:s.source.originalFileName},units,currentUnit:s.unit&&s.chapter?{...units.find(unit=>unit.id===s.unit!.id)!,chapterId:s.unit.segmentId??s.unit.chapterId,content:s.chapter.content??"",originalText:originalUnitText(s.source.sourceText,s.unit.sourceRangesJson),updatedAt:s.chapter.updatedAt.toISOString()}:null,proposals,syncState:s.unit?.segmentId?"not_requested":syncState};
 }
 async proposalView(row:Awaited<ReturnType<typeof prisma.manuscriptRevisionProposal.findUniqueOrThrow>>){
  const payload=json<Record<string,unknown>>(row.operationsJson,{}),deps=json<{snapshot?:ManuscriptSnapshot;task?:unknown}>(row.dependenciesJson,{});
  let status=row.status;
  if(status==="pending"&&deps.snapshot){try{await assertManuscriptSnapshot(prisma,row.projectId,deps.snapshot);}catch{status="stale";}}
  const {input:_input,extractions:_extractions,mergeLevels:_levels,merged:_merged,...view}=payload;
  return {id:row.id,projectId:row.projectId,unitId:row.unitId,kind:row.kind,status,taskId:row.id,...view,appliedReceipt:json(row.appliedReceiptJson,null),createdAt:row.createdAt.toISOString()};
 }
 async proposal(projectId:string,id:string){const row=await prisma.manuscriptRevisionProposal.findFirst({where:{id,projectId}});if(!row)throw Error("MANUSCRIPT_NOT_FOUND");return this.proposalView(row);}
}
