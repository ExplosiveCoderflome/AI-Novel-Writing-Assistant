import {randomUUID} from "node:crypto";
import type {ChapterEditorCandidate,ChapterEditorOperation,ChapterEditorTargetRange,ManuscriptChapterRevisionContext} from "@ai-novel/shared";
import {prisma} from "../../../../db/prisma";
import {taskDispatcher} from "../../../../workers/TaskDispatcher";
import {runStructuredPrompt} from "../../../../prompting/core/promptRunner";
import {manuscriptDiagnosePrompt} from "../../../../prompting/prompts/manuscript/manuscript.prompts";
import {NovelChapterEditorService} from "../../../../services/novel/chapterEditor/NovelChapterEditorService";
import {ChapterEditorWorkspaceService} from "../../../../services/novel/chapterEditor/ChapterEditorWorkspaceService";
import {buildChapterEditorDiffChunks} from "../../../../services/novel/chapterEditor/chapterEditorDiff";
import {saveManualChapterContent} from "../../../../services/novel/chapterEditor/persistence/ManualChapterStore";
import {sha256} from "../domain/source";
import {supersedeChapterTimeline} from "../../../timeline/persistence/chapterVersion";
import {registerManuscriptTask,type ManuscriptTaskExecution} from "./ManuscriptTasks";
import {json,readManuscriptState,takeManuscriptSnapshot,assertManuscriptSnapshot,originalUnitText,ManuscriptWorkspaceService,type ManuscriptDb,type ManuscriptSnapshot} from "./ManuscriptWorkspaceService";
import type {ModelInput} from "./ManuscriptBaselineService";
export type RevisionBase=import("@ai-novel/shared/types/manuscript").ManuscriptRevisionBase;
export function validateManuscriptRevisionBase(snapshot:ManuscriptSnapshot,input:RevisionBase){if(snapshot.structureVersion!==input.expectedStructureVersion||snapshot.unitRevision!==input.baseUnitRevision||snapshot.contentHash!==input.baseContentHash||snapshot.baselineRevisionId!==input.baselineOutlineRevisionId||snapshot.workingRevisionId!==input.baseWorkingOutlineRevisionId)throw Error("REVISION_BASE_STALE");}
async function persistContent(tx:ManuscriptDb,projectId:string,unitId:string,snapshot:ManuscriptSnapshot,content:string){
  const lock=await tx.manuscriptProject.updateMany({where:{id:projectId,structureVersion:snapshot.structureVersion},data:{structureVersion:snapshot.structureVersion}});if(!lock.count)throw Error("REVISION_BASE_STALE");
 await assertManuscriptSnapshot(tx,projectId,snapshot);const s=await readManuscriptState(tx,projectId,unitId);if(s.unit!.status!=="active")throw Error("UNIT_INACTIVE");
  const changed=await tx.manuscriptUnit.updateMany({where:{id:unitId,status:"active",workingRevision:snapshot.unitRevision!,contentHash:snapshot.contentHash},data:{workingRevision:{increment:1},contentHash:sha256(content)}});if(!changed.count)throw Error("REVISION_BASE_STALE");
  if(s.unit!.segmentId){
   const previousVersion=(s.chapter as {version:number}).version;
   const prior=await tx.shortStorySegment.findUniqueOrThrow({where:{id:s.unit!.segmentId}});
   const history=prior.humanSnapshotJson?JSON.parse(prior.humanSnapshotJson) as unknown[]:[];
   const changedSegment=await tx.shortStorySegment.updateMany({where:{id:s.unit!.segmentId,novelId:s.project.novelId!,version:previousVersion},data:{content,version:{increment:1},status:"completed",userEditedAt:new Date(),humanSnapshotJson:JSON.stringify([...history.slice(-9),{content:s.chapter!.content??"",version:previousVersion,createdAt:new Date().toISOString()}])}});
   if(!changedSegment.count)throw Error("REVISION_BASE_STALE");
  }else await saveManualChapterContent(tx,s.chapter!,content);
  const laterChapterIds=s.units.filter(unit=>unit.status==="active"&&unit.displayOrder>s.unit!.displayOrder).map(unit=>unit.chapterId!).filter(Boolean);
 await tx.chapterArtifactSyncCheckpoint.updateMany({where:{novelId:s.project.novelId!,chapterId:{in:laterChapterIds},status:{in:["pending","running","succeeded","failed"]}},data:{status:"superseded"}});
  for(const chapterId of laterChapterIds)await supersedeChapterTimeline(tx,{novelId:s.project.novelId!,chapterId});
  const laterSegmentIds=s.units.filter(unit=>unit.status==="active"&&unit.displayOrder>s.unit!.displayOrder&&unit.segmentId).map(unit=>unit.segmentId!);
  if(laterSegmentIds.length)await tx.shortStorySegment.updateMany({where:{id:{in:laterSegmentIds},novelId:s.project.novelId!},data:{qualityResultJson:null}});
 await tx.manuscriptRevisionProposal.updateMany({where:{projectId,status:{in:["pending","generating"]},unitId:{in:s.units.filter(unit=>unit.status==="active"&&unit.displayOrder>=s.unit!.displayOrder).map(unit=>unit.id)}},data:{status:"stale"}});
  return {unitId,beforeContent:s.chapter!.content??"",afterContent:content,beforeHash:snapshot.contentHash,afterHash:sha256(content),beforeUnitRevision:snapshot.unitRevision,afterUnitRevision:snapshot.unitRevision!+1,structureVersion:snapshot.structureVersion,synchronization:s.unit!.segmentId?"not_requested":"pending"};
}
export class ManuscriptRevisionService {
 private async preview(projectId:string,unitId:string,kind:string,input:RevisionBase&ModelInput&{operation?:ChapterEditorOperation;instruction?:string;selection?:ChapterEditorTargetRange},original=false){
  const payloadHash=sha256(JSON.stringify({unitId,kind,...input})),old=await prisma.manuscriptRevisionProposal.findUnique({where:{requestKey:input.requestKey}});
  if(old){if(old.projectId!==projectId||old.payloadHash!==payloadHash)throw Error("REQUEST_KEY_CONFLICT");return new ManuscriptWorkspaceService().proposalView(old);}
  const s=await readManuscriptState(prisma,projectId,unitId),snapshot=await takeManuscriptSnapshot(prisma,projectId,unitId);validateManuscriptRevisionBase(snapshot,input);
   if(s.unit!.status!=="active")throw Error("UNIT_INACTIVE");if(!original&&!snapshot.baselineRevisionId)throw Error("BASELINE_REQUIRED");
  if(!original&&(s.chapter!.content??"").length>12000&&!input.selection)throw Error("MANUSCRIPT_CHAPTER_TOO_LONG");
  if(input.selection){const {from,to,text}=input.selection,body=s.chapter!.content??"";if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<=from||to>body.length||text!==body.slice(from,to)||/[\uD800-\uDBFF]/u.test(body.charAt(from-1))||/[\uD800-\uDBFF]/u.test(body.charAt(to-1)))throw Error("MANUSCRIPT_RANGE_INVALID");}
  let candidates:ChapterEditorCandidate[]|undefined;
  if(original){if(!s.unit!.sourceId)throw Error("MANUSCRIPT_SOURCE_INVALID");const content=originalUnitText(s.source.sourceText,s.unit!.sourceRangesJson);candidates=[{id:randomUUID(),label:"恢复导入时原稿",content,summary:"仅恢复当前章的原稿内容，尚未保存。",rationale:"原始文件及大纲基线不变。",riskNotes:[],semanticTags:["恢复原稿"],diffChunks:buildChapterEditorDiffChunks(s.chapter!.content??"",content)}];}
  const row=await prisma.manuscriptRevisionProposal.create({data:{projectId,unitId,kind,status:original?"pending":"generating",baseStructureVersion:snapshot.structureVersion,baseUnitRevision:snapshot.unitRevision,baseContentHash:snapshot.contentHash,baselineOutlineRevisionId:snapshot.baselineRevisionId,baseWorkingOutlineRevisionId:snapshot.workingRevisionId,dependenciesJson:JSON.stringify({snapshot}),operationsJson:JSON.stringify({input,candidates}),requestKey:input.requestKey,payloadHash,promptId:original?null:kind==="diagnosis"?"manuscript.chapter.diagnose":"novel.chapter_editor.rewrite_candidates",promptVersion:original?null:kind==="diagnosis"?manuscriptDiagnosePrompt.version:"v3"}});
  if(!original)taskDispatcher.notify({commandType:"manuscript",taskId:row.id});return new ManuscriptWorkspaceService().proposalView(row);
 }
 diagnose(projectId:string,unitId:string,input:RevisionBase&ModelInput){return this.preview(projectId,unitId,"diagnosis",input);}
 rewrite(projectId:string,unitId:string,input:RevisionBase&ModelInput&{operation:ChapterEditorOperation;instruction:string;selection?:ChapterEditorTargetRange}){return this.preview(projectId,unitId,"rewrite",input);}
 restore(projectId:string,unitId:string,input:RevisionBase){return this.preview(projectId,unitId,"restore_original",input,true);}
 async apply(projectId:string,id:string,input:RevisionBase&{candidateId:string}){
  return prisma.$transaction(async tx=>{
   const row=await tx.manuscriptRevisionProposal.findFirst({where:{id,projectId}});if(!row?.unitId)throw Error("MANUSCRIPT_NOT_FOUND");const requestHash=sha256(JSON.stringify(input));
   if(row.status==="applied"){const receipt=json<any>(row.appliedReceiptJson,{});if(receipt.requestHash!==requestHash)throw Error("REQUEST_KEY_CONFLICT");return {...receipt,replayed:true};}
   if(row.status!=="pending"||!["rewrite","restore_original"].includes(row.kind))throw Error("REVISION_BASE_STALE");
   const snapshot=json<any>(row.dependenciesJson,{}).snapshot as ManuscriptSnapshot;validateManuscriptRevisionBase(snapshot,input);await assertManuscriptSnapshot(tx,projectId,snapshot);
   const candidate=json<{candidates:ChapterEditorCandidate[]}>(row.operationsJson,{candidates:[]}).candidates.find(candidate=>candidate.id===input.candidateId);if(!candidate)throw Error("MANUSCRIPT_CANDIDATE_INVALID");
   const receipt={...await persistContent(tx,projectId,row.unitId,snapshot,candidate.content),requestKey:input.requestKey,requestHash,candidateId:candidate.id};
   await tx.manuscriptRevisionProposal.update({where:{id},data:{status:"applied",appliedReceiptJson:JSON.stringify(receipt)}});return receipt;
  });
 }
 async manualSave(projectId:string,unitId:string,input:RevisionBase&{content:string}){
  const payloadHash=sha256(JSON.stringify({unitId,...input}));
  return prisma.$transaction(async tx=>{
   const old=await tx.manuscriptRevisionProposal.findUnique({where:{requestKey:input.requestKey}});if(old){if(old.projectId!==projectId||old.payloadHash!==payloadHash)throw Error("REQUEST_KEY_CONFLICT");return {...json<any>(old.appliedReceiptJson,{}),replayed:true};}
   const snapshot=await takeManuscriptSnapshot(tx,projectId,unitId);validateManuscriptRevisionBase(snapshot,input);
   const receipt=await persistContent(tx,projectId,unitId,snapshot,input.content);
   const row=await tx.manuscriptRevisionProposal.create({data:{projectId,unitId,kind:"manual_save",status:"applied",baseStructureVersion:snapshot.structureVersion,baseUnitRevision:snapshot.unitRevision,baseContentHash:snapshot.contentHash,dependenciesJson:JSON.stringify({snapshot}),operationsJson:"{}",requestKey:input.requestKey,payloadHash,appliedReceiptJson:JSON.stringify(receipt)}});return {...receipt,id:row.id};
  });
 }
 async reject(projectId:string,id:string){const result=await prisma.manuscriptRevisionProposal.updateMany({where:{id,projectId,status:{in:["pending","stale","failed"]}},data:{status:"rejected"}});if(!result.count)throw Error("REVISION_BASE_STALE");return {rejected:true};}
 async undo(projectId:string,id:string,input:{expectedStructureVersion:number;expectedAfterHash:string;requestKey:string}){
  const payloadHash=sha256(JSON.stringify({id,...input}));return prisma.$transaction(async tx=>{
   const old=await tx.manuscriptRevisionProposal.findUnique({where:{requestKey:input.requestKey}});if(old){if(old.projectId!==projectId||old.payloadHash!==payloadHash)throw Error("REQUEST_KEY_CONFLICT");return {...json<any>(old.appliedReceiptJson,{}),replayed:true};}
   const row=await tx.manuscriptRevisionProposal.findFirst({where:{id,projectId,status:"applied"}});if(!row?.unitId)throw Error("MANUSCRIPT_NOT_FOUND");const receipt=json<any>(row.appliedReceiptJson,{});
   const snapshot=await takeManuscriptSnapshot(tx,projectId,row.unitId);
   if(typeof receipt.beforeContent!=="string"||receipt.undoProposalId||receipt.structureVersion!==snapshot.structureVersion||input.expectedStructureVersion!==snapshot.structureVersion||receipt.afterHash!==snapshot.contentHash||input.expectedAfterHash!==snapshot.contentHash||receipt.afterUnitRevision!==snapshot.unitRevision)throw Error("REVISION_BASE_STALE");
   const undoReceipt=await persistContent(tx,projectId,row.unitId,snapshot,receipt.beforeContent);
   const undo=await tx.manuscriptRevisionProposal.create({data:{projectId,unitId:row.unitId,kind:"undo",status:"applied",baseStructureVersion:snapshot.structureVersion,baseUnitRevision:snapshot.unitRevision,baseContentHash:snapshot.contentHash,dependenciesJson:JSON.stringify({snapshot}),requestKey:input.requestKey,payloadHash,operationsJson:JSON.stringify({undoes:id}),appliedReceiptJson:JSON.stringify(undoReceipt)}});
   await tx.manuscriptRevisionProposal.update({where:{id},data:{appliedReceiptJson:JSON.stringify({...receipt,undoProposalId:undo.id})}});return {...undoReceipt,id:undo.id};
  });
 }
}
export async function buildManuscriptRevisionContext(projectId:string,unitId:string):Promise<ManuscriptChapterRevisionContext>{
  const s=await readManuscriptState(prisma,projectId,unitId);
  if(!s.project.baselineOutlineRevisionId||!s.working?.currentRevisionId)throw Error("BASELINE_REQUIRED");
  const baseline=await prisma.outlineRevision.findUniqueOrThrow({where:{id:s.project.baselineOutlineRevisionId}}),working=await prisma.outlineRevision.findUniqueOrThrow({where:{id:s.working.currentRevisionId}});
  const original=json<any>(baseline.documentJson,{}),document=json<any>(working.documentJson,{});
  const prior=s.units.filter(unit=>unit.status==="active"&&unit.displayOrder<s.unit!.displayOrder).slice(-3),chapters=await prisma.chapter.findMany({where:{id:{in:prior.map(unit=>unit.chapterId!).filter(Boolean)}}}),segments=await prisma.shortStorySegment.findMany({where:{id:{in:prior.map(unit=>unit.segmentId!).filter(Boolean)}}});
 const sourceText=originalUnitText(s.source.sourceText,s.unit!.sourceRangesJson);
   return {source:{sourceHash:s.source.sourceHash,unitId,ranges:json(s.unit!.sourceRangesJson,[]),originalText:sourceText.slice(0,8000),excerpted:sourceText.length>8000},previousWorkingChapters:prior.map(unit=>{const content=chapters.find(ch=>ch.id===unit.chapterId)?.content??segments.find(segment=>segment.id===unit.segmentId)?.content??"";return {unitId:unit.id,chapterId:unit.chapterId??unit.segmentId!,contentHash:sha256(content),content:content.slice(-3000),omittedPrefixCharCount:Math.max(0,content.length-3000)};}),wholeBookPlanningConstraints:{label:"全书约束，不代表本章已经发生",baselineRevisionId:baseline.id,workingRevisionId:working.id,endingDirection:document.story?.endingDirection||original.story?.endingDirection||"",immutableFacts:(original.facts??[]).filter((fact:any)=>fact.immutable&&(fact.scope.type==="story"||fact.relatedNodeIds.includes(unitId))).map((fact:any)=>({title:fact.title,content:fact.content})),currentChapterPlan:document.chapters?.find((chapter:any)=>chapter.nodeId===unitId)??null},preserve:{coreFacts:true,identity:true,causality:true,pov:true,ending:true}};
}
export function registerManuscriptRevisionTasks(){registerManuscriptTask("diagnosis",generateDiagnosis);registerManuscriptTask("rewrite",generateRewrite);}
async function generateDiagnosis(task:ManuscriptTaskExecution){const s=await readManuscriptState(prisma,task.row.projectId,task.row.unitId!);const output=await task.call(manuscriptDiagnosePrompt,{currentContent:s.chapter!.content??"",revisionContext:await buildManuscriptRevisionContext(task.row.projectId,task.row.unitId!)},task.payload.input as ModelInput);for(const card of output.diagnosticCards)if(card.quote&&!(s.chapter!.content??"").includes(card.quote))throw Error("MANUSCRIPT_EVIDENCE_INVALID");task.payload.diagnosticCards=output.diagnosticCards;}
async function generateRewrite(task:ManuscriptTaskExecution){
 const s=await readManuscriptState(prisma,task.row.projectId,task.row.unitId!),input=task.payload.input as unknown as RevisionBase&ModelInput&{operation:ChapterEditorOperation;instruction:string;selection?:ChapterEditorTargetRange};
 const promptRunner=(async(args:any)=>({output:await task.call(args.asset,args.promptInput,args.options)})) as typeof runStructuredPrompt;
 const editor=new NovelChapterEditorService(new ChapterEditorWorkspaceService(),promptRunner);
 const result=await editor.previewAiRevision(s.project.novelId!,s.chapter!.id,{source:"preset",scope:input.selection?"selection":"chapter",presetOperation:input.operation,contentSnapshot:s.chapter!.content??"",selection:input.selection,constraints:{keepFacts:true,keepPov:true,noUnauthorizedSetting:true,preserveCoreInfo:true},...input},await buildManuscriptRevisionContext(task.row.projectId,task.row.unitId!));
 const body=s.chapter!.content??"";
 task.payload.candidates=result.candidates.map(candidate=>{const content=input.selection?body.slice(0,input.selection.from)+candidate.content+body.slice(input.selection.to):candidate.content;return {...candidate,content,diffChunks:buildChapterEditorDiffChunks(body,content)};});task.payload.scope=result.scope;task.payload.targetRange=result.targetRange;
}
