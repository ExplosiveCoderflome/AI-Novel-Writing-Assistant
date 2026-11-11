import type { ManuscriptConfirmRequest, ManuscriptCoverage, ManuscriptEncoding, ManuscriptImportRequest, ManuscriptImportResponse, ManuscriptPartitionRequest, ManuscriptPartitionUnit, ManuscriptWorkspaceUnit } from "@ai-novel/shared/types/manuscript";
import type { ChapterEditorCandidate, ChapterEditorDiagnosticCard, ChapterEditorOperation, ChapterEditorTargetRange } from "@ai-novel/shared/types/novel";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";

export interface ManuscriptSourceView {id:string;sourceHash:string;rawHash:string;charCount:number;byteCount:number;encoding:ManuscriptEncoding;originalFileName:string|null;version:number}
export interface ManuscriptSessionView {id:string;projectId:string;sourceId:string;version:number;status:string;source:ManuscriptSourceView;units:ManuscriptPartitionUnit[];coverage:ManuscriptCoverage;createdNovelId:string|null;text?:string}
export interface ManuscriptUnitDetail extends ManuscriptWorkspaceUnit {content:string;originalText:string;updatedAt:string}
export type ManuscriptStructureOperation = {kind:"insert_unit";afterUnitId:string|null;beforeUnitId:string|null;title:string;purpose:string} | {kind:"deactivate_unit";unitId:string;expectedUnitRevision:number} | {kind:"restore_unit";unitId:string;afterUnitId:string|null} | {kind:"merge_units";unitIds:string[];title:string};
export interface ManuscriptProposalView {
  id:string; kind:string; status:string; unitId:string|null; taskId?:string; error?:string|null; staleReasons?:string[];
  candidates?:ChapterEditorCandidate[]; diagnosticCards?:ChapterEditorDiagnosticCard[];
  document?:OutlineDocument; candidateRevisionId?:string; outlineProjectId?:string; coverageHash?:string;
  evidence?:Array<{unitId:string;quote:string;range:{start:number;end:number}}>;
  coverage?:{totalUnits:number;coveredUnitIds:string[];totalChunks:number;completedChunks:number};
  impact?:{before:string[];after:string[];affectedUnitIds:string[];references:string[];warnings:string[];invalidateFrom:number};
  appliedReceipt?:{beforeContent?:string;afterHash?:string;synchronization?:string};
  createdAt?:string;
}
export interface ManuscriptWorkspace {
  project:{id:string;novelId:string;title:string;structureVersion:number;baselineOutlineRevisionId:string|null;baselineOutlineProjectId:string|null;workingOutlineProjectId:string|null;workingOutlineRevisionId:string|null;baselineSourceType?:string};
  source:ManuscriptSourceView; units:ManuscriptWorkspaceUnit[]; currentUnit:ManuscriptUnitDetail|null; proposals:ManuscriptProposalView[];
  syncState?:string;
}
export interface ManuscriptModelConfig {provider:LLMProvider;model:string;temperature:number;maxRequests?:number}
export interface ManuscriptRevisionBase {expectedStructureVersion:number;baseUnitRevision:number;baseContentHash:string;baselineOutlineRevisionId:string|null;baseWorkingOutlineRevisionId:string|null;requestKey:string}
const options={errorPresentation:"inline" as const};
async function post<T>(path:string,body:unknown):Promise<T> {return (await apiClient.post(`/manuscripts${path}`,body,options)).data.data as T;}
export async function createManuscriptImport(input:ManuscriptImportRequest,file?:File):Promise<ManuscriptImportResponse> {
  if(!file)return post("/imports",input);
  const fileBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error("无法读取原稿文件，请重新选择。"));reader.onload=()=>resolve(String(reader.result).split(",",2)[1]);reader.readAsDataURL(file);});
  return post("/imports",{...input,fileBase64,fileName:file.name});
}
export async function getManuscriptSession(id:string):Promise<ManuscriptSessionView> {return (await apiClient.get(`/manuscripts/imports/${id}`,options)).data.data;}
export const splitManuscript=(session:ManuscriptSessionView,mode:"rules"|"manual"="rules")=>post<ManuscriptSessionView>(`/imports/${session.id}/split`,{expectedSessionVersion:session.version,sourceHash:session.source.sourceHash,mode});
export const saveManuscriptPartition=(id:string,input:ManuscriptPartitionRequest)=>apiClient.put(`/manuscripts/imports/${id}/partition`,input,options).then(response=>response.data.data as ManuscriptSessionView);
export const confirmManuscriptImport=(id:string,input:ManuscriptConfirmRequest)=>post<{projectId:string;novelId:string;replayed:boolean}>(`/imports/${id}/confirm`,input);
export async function getManuscriptWorkspace(novelId:string,unitId?:string):Promise<ManuscriptWorkspace> {return (await apiClient.get(`/manuscripts/by-novel/${novelId}/workspace`,{...options,params:{unitId}})).data.data;}
export async function getManuscriptSourceText(projectId:string,sourceId:string,from:number,to:number):Promise<string> {return (await apiClient.get(`/manuscripts/${projectId}/sources/${sourceId}/text`,{...options,params:{from,to}})).data.data.text;}
export const previewManuscriptBaseline=(projectId:string,input:unknown)=>post<ManuscriptProposalView>(`/${projectId}/outline-baseline/preview`,input);
export const confirmManuscriptBaseline=(projectId:string,input:unknown)=>post<ManuscriptWorkspace>(`/${projectId}/outline-baseline/confirm`,input);
export const getManuscriptProposal=(projectId:string,id:string)=>apiClient.get(`/manuscripts/${projectId}/proposals/${id}`,options).then(response=>response.data.data as ManuscriptProposalView);
export const diagnoseManuscriptUnit=(projectId:string,unitId:string,input:ManuscriptRevisionBase & ManuscriptModelConfig)=>post<ManuscriptProposalView>(`/${projectId}/units/${unitId}/diagnoses`,input);
export const previewManuscriptRevision=(projectId:string,unitId:string,input:ManuscriptRevisionBase & ManuscriptModelConfig & {operation:ChapterEditorOperation;instruction:string;selection?:ChapterEditorTargetRange})=>post<ManuscriptProposalView>(`/${projectId}/units/${unitId}/revision-previews`,input);
export const saveManuscriptUnit=(projectId:string,unitId:string,input:ManuscriptRevisionBase & {content:string})=>post<unknown>(`/${projectId}/units/${unitId}/manual-save`,input);
export const applyManuscriptProposal=(projectId:string,id:string,input:unknown)=>post<unknown>(`/${projectId}/proposals/${id}/apply`,input);
export const rejectManuscriptProposal=(projectId:string,id:string)=>post<unknown>(`/${projectId}/proposals/${id}/reject`,{expectedStatus:"pending"});
export const previewManuscriptStructure=(projectId:string,input:unknown)=>post<ManuscriptProposalView>(`/${projectId}/structure-previews`,input);
export const restoreManuscriptOriginal=(projectId:string,unitId:string,input:ManuscriptRevisionBase)=>post<ManuscriptProposalView>(`/${projectId}/units/${unitId}/restore-original-preview`,input);
export const undoManuscriptChange=(projectId:string,id:string,input:unknown)=>post<unknown>(`/${projectId}/changes/${id}/undo`,input);
export const cancelManuscriptTask=(projectId:string,id:string)=>post<unknown>(`/${projectId}/tasks/${id}/cancel`,{});

export const retryManuscriptTask=(projectId:string,id:string,maxRequests?:number)=>post<ManuscriptProposalView>(`/${projectId}/tasks/${id}/retry`,{maxRequests});
export const retryManuscriptSync=(projectId:string,unitId:string,input:ManuscriptRevisionBase)=>post<unknown>(`/${projectId}/units/${unitId}/sync/retry`,input);
