import type { ManuscriptConfirmRequest, ManuscriptCoverage, ManuscriptEncoding, ManuscriptImportRequest, ManuscriptImportResponse, ManuscriptPartitionRequest, ManuscriptPartitionUnit, ManuscriptWorkspaceUnit, ManuscriptSourceView, ManuscriptSessionView, ManuscriptUnitDetail, ManuscriptStructureOperation, ManuscriptProposalView, ManuscriptWorkspace, ManuscriptModelConfig, ManuscriptRevisionBase } from "@ai-novel/shared/types/manuscript";
import type { ChapterEditorOperation, ChapterEditorTargetRange } from "@ai-novel/shared/types/novel";
import { apiClient } from "./client";

export type {ManuscriptSourceView, ManuscriptSessionView, ManuscriptUnitDetail, ManuscriptStructureOperation, ManuscriptProposalView, ManuscriptWorkspace, ManuscriptModelConfig, ManuscriptRevisionBase} from "@ai-novel/shared/types/manuscript";
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
