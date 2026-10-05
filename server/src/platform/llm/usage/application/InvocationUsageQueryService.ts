import type {LlmInvocationUsagePage} from "@ai-novel/shared/types/llmUsage";
import type {UsageDelegate} from "../infrastructure/PrismaInvocationUsageRepository";
import {unknownCache} from "../domain/types";
export function decodeUsageCursor(cursor:string):{at:string;id:string;runId:string}{
 try{const c=JSON.parse(Buffer.from(cursor,"base64url").toString("utf8"));
 if(typeof c.at!=="string"||!Number.isFinite(Date.parse(c.at))||typeof c.id!=="string"||!c.id||typeof c.runId!=="string"||!c.runId)throw new Error();return c;
 }catch{throw Object.assign(new Error("invalid usage cursor"),{statusCode:400});}
}
export class InvocationUsageQueryService {
 constructor(private readonly rows:Pick<UsageDelegate,"findMany">){}
 async getRunUsage(runId:string,query:{limit?:number;cursor?:string|null}):Promise<LlmInvocationUsagePage>{
 const limit=query.limit ?? 30;if(!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(new Error("invalid usage limit"),{statusCode:400});
 const cursor=query.cursor?decodeUsageCursor(query.cursor):null;if(cursor&&cursor.runId!==runId)throw Object.assign(new Error("invalid usage cursor scope"),{statusCode:400});
 const all=await this.rows.findMany({where:{runId},orderBy:[{startedAt:"asc"},{id:"asc"}]});
 const after=all.filter(r=>!cursor||r.startedAt.toISOString()>cursor.at||(r.startedAt.toISOString()===cursor.at&&r.id>cursor.id));
 const page=after.slice(0,limit),last=page.at(-1);const complete=all.length>0&&all.every(r=>r.cacheUsageStatus==="reported"&&r.status==="completed");
 const inputCache=complete?{cacheHitTokens:all.reduce((n,r)=>n+(r.cacheHitTokens??0),0),cacheMissTokens:all.reduce((n,r)=>n+(r.cacheMissTokens??0),0),
 cacheWriteTokens:all.every(r=>r.cacheWriteTokens!==null)?all.reduce((n,r)=>n+r.cacheWriteTokens!,0):null,cacheUsageStatus:"reported" as const}:unknownCache(all.some(r=>r.cacheUsageStatus==="invalid")?"invalid":"unavailable");
 return {items:page.map(({id,cacheDiagnostic,cacheHitTokens,cacheMissTokens,cacheWriteTokens,cacheUsageStatus,...r})=>({...r,invocationId:id,startedAt:r.startedAt.toISOString(),finishedAt:r.finishedAt.toISOString(),
 inputCache:{cacheHitTokens,cacheMissTokens,cacheWriteTokens,cacheUsageStatus:cacheUsageStatus as "reported"|"unavailable"|"invalid"}})),
 nextCursor:after.length>limit&&last?Buffer.from(JSON.stringify({at:last.startedAt.toISOString(),id:last.id,runId})).toString("base64url"):null,
 recordedSummary:{inputCache,recordedCallCount:all.length,unknownCallCount:all.filter(r=>r.cacheUsageStatus==="unavailable").length,invalidCallCount:all.filter(r=>r.cacheUsageStatus==="invalid").length,partialCallCount:all.filter(r=>r.status==="partial").length}};
 }
}
