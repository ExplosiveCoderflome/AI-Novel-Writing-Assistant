import {getEncoding} from "js-tiktoken";
import {randomUUID} from "node:crypto";
import {createEmptyOutlineDocument,validateOutlineDocument,type OutlineDocument} from "@ai-novel/shared/types/outline";
import {prisma} from "../../../../db/prisma";
import {taskDispatcher} from "../../../../workers/TaskDispatcher";
import {manuscriptExtractPrompt,manuscriptMergePrompt,manuscriptVerifyPrompt,type ManuscriptExtraction} from "../../../../prompting/prompts/manuscript/manuscript.prompts";
import {sha256} from "../domain/source";
import {registerManuscriptTask,type ManuscriptTaskExecution} from "./ManuscriptTasks";
import {json,readManuscriptState,takeManuscriptSnapshot,assertManuscriptSnapshot,ManuscriptWorkspaceService,type ManuscriptDb} from "./ManuscriptWorkspaceService";
export type ModelInput={provider?:any;model?:string;temperature?:number;maxRequests?:number};
export type BaselineInput=ModelInput&{requestKey:string;sourceHash:string;expectedStructureVersion:number;sourceType?:"author_provided"|"inferred_from_manuscript";outlineProjectId?:string;outlineRevisionId?:string};
export async function createManuscriptOutline(tx:ManuscriptDb,title:string,document:OutlineDocument,sourceType:string,withProposal=false){
 document=validateOutlineDocument(document);
 const id=randomUUID(),revisionId=randomUUID();await tx.outlineProject.create({data:{id,title,status:"active",currentVersion:1}});
 await tx.outlineRevision.create({data:{id:revisionId,projectId:id,version:1,documentJson:JSON.stringify(document),sourceType}});
 await tx.outlineProject.update({where:{id},data:{currentRevisionId:revisionId}});
 if(withProposal)await tx.outlineProposal.create({data:{projectId:id,kind:"import_parse",status:"pending",baseVersion:1,proposalJson:JSON.stringify({document,candidateRevisionId:revisionId,sourceType})}});
 return {projectId:id,revisionId};
}
/** UTF-16 source ranges stay exact, including CRLF and supplementary characters. No TOC prefix limit. */
const manuscriptTokenizer=getEncoding("cl100k_base");
export function manuscriptExtractionChunks(units:Array<{id:string;sourceRangesJson:string}>,sourceText:string){
 const result:Array<{unitId:string;range:{start:number;end:number};text:string}>=[];
 for(const unit of units)for(const range of json<Array<{start:number;end:number}>>(unit.sourceRangesJson,[])){
  for(let start=range.start;start<range.end;){let end=Math.min(start+6000,range.end);if(end<range.end&&/[\uD800-\uDBFF]/u.test(sourceText.charAt(end-1)))end--;
   let tokens=manuscriptTokenizer.encode(sourceText.slice(start,end)).length;while(tokens>3500){end=start+Math.max(1,Math.floor((end-start)*3500/tokens*.95));if(end<range.end&&/[\uD800-\uDBFF]/u.test(sourceText.charAt(end-1)))end--;tokens=manuscriptTokenizer.encode(sourceText.slice(start,end)).length;}result.push({unitId:unit.id,range:{start,end},text:sourceText.slice(start,end)});start=end;}
 }return result;
}
export class ManuscriptBaselineService {
 async preview(projectId:string,input:BaselineInput){
  const s=await readManuscriptState(prisma,projectId);if(s.project.baselineOutlineRevisionId)throw Error("BASELINE_ALREADY_CONFIRMED");
  if(s.source.sourceHash!==input.sourceHash||s.project.structureVersion!==input.expectedStructureVersion)throw Error("REVISION_BASE_STALE");
  const payloadHash=sha256(JSON.stringify(input)),old=await prisma.manuscriptRevisionProposal.findUnique({where:{requestKey:input.requestKey}});
  if(old){if(old.projectId!==projectId||old.payloadHash!==payloadHash)throw Error("REQUEST_KEY_CONFLICT");return new ManuscriptWorkspaceService().proposalView(old);}
  const snapshot=await takeManuscriptSnapshot(prisma,projectId);
  const author=input.sourceType==="author_provided";
  let document:OutlineDocument|undefined;
  if(author){const revision=await prisma.outlineRevision.findFirst({where:{id:input.outlineRevisionId,projectId:input.outlineProjectId}});if(!revision)throw Error("MANUSCRIPT_NOT_FOUND");document=validateOutlineDocument(JSON.parse(revision.documentJson));}
  const row=await prisma.$transaction(async tx=>{
   await assertManuscriptSnapshot(tx,projectId,snapshot);
   const outline=document?await createManuscriptOutline(tx,`${s.project.novel!.title} · 原稿基线待确认`,document,"author_provided",true):null;
   return tx.manuscriptRevisionProposal.create({data:{projectId,kind:"outline_baseline",status:author?"pending":"generating",baseStructureVersion:snapshot.structureVersion,dependenciesJson:JSON.stringify({snapshot}),requestKey:input.requestKey,payloadHash,promptId:author?null:manuscriptExtractPrompt.id,promptVersion:author?null:"v1",operationsJson:JSON.stringify({input,sourceType:author?"author_provided":"inferred_from_manuscript",...(outline?{document,outlineProjectId:outline.projectId,candidateRevisionId:outline.revisionId,coverageHash:sha256(JSON.stringify({source:s.source.sourceHash,document,structure:snapshot.structureVersion}))}:{coverage:{totalUnits:s.units.length,coveredUnitIds:[],totalChunks:manuscriptExtractionChunks(s.units,s.source.sourceText).length,completedChunks:0},extractions:[]})})}});
  });
  if(!author)taskDispatcher.notify({commandType:"manuscript",taskId:row.id});return new ManuscriptWorkspaceService().proposalView(row);
 }
 async confirm(projectId:string,input:{proposalId:string;candidateRevisionId:string;sourceHash:string;coverageHash:string;expectedStructureVersion:number;requestKey:string}){
  await prisma.$transaction(async tx=>{
   const row=await tx.manuscriptRevisionProposal.findFirst({where:{id:input.proposalId,projectId,kind:"outline_baseline"}});if(!row)throw Error("MANUSCRIPT_NOT_FOUND");
   const requestHash=sha256(JSON.stringify(input));
   if(row.status==="applied"){const receipt=json<any>(row.appliedReceiptJson,{});if(receipt.requestHash!==requestHash)throw Error("REQUEST_KEY_CONFLICT");return;}
   if(row.status!=="pending")throw Error("REVISION_BASE_STALE");const payload=json<any>(row.operationsJson,{}),deps=json<any>(row.dependenciesJson,{});await assertManuscriptSnapshot(tx,projectId,deps.snapshot);
   const s=await readManuscriptState(tx,projectId);if(s.project.baselineOutlineRevisionId)throw Error("BASELINE_ALREADY_CONFIRMED");
   if(s.source.sourceHash!==input.sourceHash||s.project.structureVersion!==input.expectedStructureVersion||payload.coverageHash!==input.coverageHash)throw Error("REVISION_BASE_STALE");
   const revision=await tx.outlineRevision.findFirst({where:{id:input.candidateRevisionId,projectId:payload.outlineProjectId}});if(!revision)throw Error("MANUSCRIPT_NOT_FOUND");
   const document=validateOutlineDocument(JSON.parse(revision.documentJson));
   const working=await createManuscriptOutline(tx,`${s.project.novel!.title} · 工作大纲`,document,"manuscript_working_copy");
   const changed=await tx.manuscriptProject.updateMany({where:{id:projectId,baselineOutlineRevisionId:null,structureVersion:input.expectedStructureVersion},data:{baselineOutlineRevisionId:revision.id,workingOutlineProjectId:working.projectId,status:"revision_ready"}});if(!changed.count)throw Error("REVISION_BASE_STALE");
   await tx.outlineProposal.updateMany({where:{projectId:payload.outlineProjectId,kind:"import_parse",status:"pending"},data:{status:"applied"}});
   await tx.manuscriptRevisionProposal.update({where:{id:row.id},data:{status:"applied",appliedReceiptJson:JSON.stringify({requestHash,requestKey:input.requestKey,baselineOutlineRevisionId:revision.id,workingOutlineProjectId:working.projectId,workingOutlineRevisionId:working.revisionId})}});
  });return new ManuscriptWorkspaceService().get(projectId);
 }
}
export function registerManuscriptBaselineTask(){registerManuscriptTask("outline_baseline",generateBaseline);}
async function generateBaseline(task:ManuscriptTaskExecution){
 const s=await readManuscriptState(prisma,task.row.projectId),input=task.payload.input as ModelInput;
 const chunks=manuscriptExtractionChunks(s.units,s.source.sourceText);
 type Extract={unitId:string;range:{start:number;end:number};output:ManuscriptExtraction;evidence:Array<{unitId:string;quote:string;range:{start:number;end:number}}>};
 const extracts=(task.payload.extractions??[]) as Extract[];
 for(let i=extracts.length;i<chunks.length;i++){
  const chunk=chunks[i]!,unit=s.units.find(unit=>unit.id===chunk.unitId)!;
  const output=await task.call(manuscriptExtractPrompt,{unitId:unit.id,title:unit.originalTitle,chunkIndex:i,chunkCount:chunks.length,sourceRange:chunk.range,sourceText:chunk.text},input);
  const evidence=output.evidence.map(item=>{const index=chunk.text.indexOf(item.quote);if(index<0)throw Error("MANUSCRIPT_EVIDENCE_INVALID");return {unitId:unit.id,quote:item.quote,range:{start:chunk.range.start+index,end:chunk.range.start+index+item.quote.length}};});
  extracts.push({unitId:unit.id,range:chunk.range,output,evidence});task.payload.extractions=extracts;task.payload.tokenBudget={tokenizer:"cl100k_base_proxy",sourceTokensPerChunk:3500,notice:"跨模型代理估算，非 DeepSeek 原生精确计费；保留上下文余量。"};
  task.payload.coverage={totalUnits:s.units.length,coveredUnitIds:s.units.filter(unit=>chunks.filter(c=>c.unitId===unit.id).every(c=>extracts.some(e=>e.unitId===unit.id&&e.range.start===c.range.start&&e.range.end===c.range.end))).map(unit=>unit.id),totalChunks:chunks.length,completedChunks:extracts.length};await task.write();
 }
 let summaries=extracts.map(item=>({unitId:item.unitId,summary:item.output.summary}));
 // Persist each bounded reduction level; a restart never rereads a completed original-text chunk.
 const levels=(task.payload.mergeLevels??[]) as typeof summaries[];let level=0;
 while(summaries.length>12||JSON.stringify(summaries).length>18000){
  let next=levels[level]??[];
  for(let i=next.length*8;i<summaries.length;i+=8){const group=summaries.slice(i,i+8);const merged=await task.call(manuscriptMergePrompt,{scope:`摘要归并第${level+1}层`,summaries:group,containsEnding:i+8>=summaries.length},input);next.push({unitId:group.at(-1)!.unitId,summary:merged.summary});levels[level]=next;task.payload.mergeLevels=levels;await task.write();}summaries=next;level++;
 }
 const merged=task.payload.merged as {summary:string;theme:string;tone:string;endingDirection:string}|undefined??await task.call(manuscriptMergePrompt,{scope:"完整原稿大纲",summaries,containsEnding:true},input);task.payload.merged=merged;await task.write();
 const doc=createEmptyOutlineDocument(s.project.novel!.title);Object.assign(doc.story,{synopsis:merged.summary,theme:merged.theme,tone:merged.tone,endingDirection:merged.endingDirection});
 const volumeId=randomUUID();doc.volumes.push({nodeId:volumeId,title:"原稿未分卷",order:1,planningDepth:"detailed",summary:"仅用于展示原稿章节，不代表作者原有分卷。",chapterNodeIds:s.units.map(unit=>unit.id)});
 for(const unit of s.units){const items=extracts.filter(e=>e.unitId===unit.id);doc.chapters.push({nodeId:unit.id,volumeNodeId:volumeId,title:unit.originalTitle,order:unit.displayOrder,planningDepth:"detailed",summary:items.map(e=>e.output.summary).join("\n"),characterNodeIds:[],payoffNodeIds:[]});for(const item of items){for(const character of item.output.characters){const id=randomUUID();doc.characters.push({nodeId:id,name:character.name,role:character.description,appearanceNodeIds:[unit.id]});doc.chapters.at(-1)!.characterNodeIds.push(id);}for(const fact of item.output.facts)doc.facts.push({nodeId:randomUUID(),title:fact.title,content:fact.content,scope:{type:"chapter",nodeId:unit.id},relatedNodeIds:[unit.id],immutable:true});}}
 const warnings=await task.call(manuscriptVerifyPrompt,{synopsis:doc.story.synopsis,endingDirection:doc.story.endingDirection,coverage:{totalUnits:s.units.length,coveredUnits:(task.payload.coverage as any).coveredUnitIds.length,totalChunks:chunks.length,completedChunks:extracts.length},lastChapterEvidence:extracts.filter(e=>e.unitId===s.units.at(-1)?.id).flatMap(e=>e.evidence.map(e=>e.quote))},input);
 await prisma.$transaction(async tx=>{await assertManuscriptSnapshot(tx,task.row.projectId,task.snapshot);const row=await tx.manuscriptRevisionProposal.findUnique({where:{id:task.row.id}});if(row?.status!=="generating")throw Error("TASK_CANCELLED");if(!task.payload.candidateRevisionId){const outline=await createManuscriptOutline(tx,`${s.project.novel!.title} · AI反推原稿基线待确认`,doc,"inferred_from_manuscript",true);task.payload.document=doc;task.payload.outlineProjectId=outline.projectId;task.payload.candidateRevisionId=outline.revisionId;}task.payload.evidence=extracts.flatMap(e=>e.evidence);task.payload.warnings=warnings.warnings;task.payload.coverageHash=sha256(JSON.stringify({sourceHash:s.source.sourceHash,structure:s.project.structureVersion,ranges:extracts.map(e=>e.range)}));await task.write("generating",tx);});
}
