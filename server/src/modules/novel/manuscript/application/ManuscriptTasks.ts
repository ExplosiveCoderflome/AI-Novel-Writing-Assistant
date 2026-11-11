import {randomUUID} from "node:crypto";
import {prisma} from "../../../../db/prisma";
import {taskDispatcher} from "../../../../workers/TaskDispatcher";
import type {PromptAsset,PromptExecutionOptions} from "../../../../prompting/core/promptTypes";
import {runStructuredPrompt} from "../../../../prompting/core/promptRunner";
import {json,type ManuscriptSnapshot,assertManuscriptSnapshot} from "./ManuscriptWorkspaceService";
export interface ManuscriptTaskPayload {input:Record<string,unknown>;callCount?:number;error?:string;[key:string]:unknown}
type Dependencies={snapshot:ManuscriptSnapshot;task?:{generation:string;owner:string;leaseUntil:number}};
type TaskRow=Awaited<ReturnType<typeof prisma.manuscriptRevisionProposal.findUniqueOrThrow>>;
const handlers=new Map<string,(task:ManuscriptTaskExecution)=>Promise<void>>();
const controllers=new Map<string,AbortController>();
export function registerManuscriptTask(kind:string,handler:(task:ManuscriptTaskExecution)=>Promise<void>){handlers.set(kind,handler);}
/** Existing dispatcher is only a wake hint. Lease, checkpoints, cancellation and results live in Prisma. */
export class ManuscriptTaskExecution {
 payload:ManuscriptTaskPayload;readonly snapshot:ManuscriptSnapshot;readonly controller=new AbortController();private dependencies:Dependencies;private expected:string;
 constructor(readonly row:TaskRow){this.payload=json(row.operationsJson,{input:{}});this.dependencies=json(row.dependenciesJson,{} as Dependencies);this.snapshot=this.dependencies.snapshot;this.expected=row.dependenciesJson;controllers.set(row.id,this.controller);}
 async write(status="generating",db:import("./ManuscriptWorkspaceService").ManuscriptDb=prisma){
  if(this.controller.signal.aborted)throw Error("TASK_CANCELLED");
  this.dependencies.task!.leaseUntil=Date.now()+15*60_000;
  const next=JSON.stringify(this.dependencies);
  const update=await db.manuscriptRevisionProposal.updateMany({where:{id:this.row.id,status:"generating",dependenciesJson:this.expected},data:{status,dependenciesJson:next,operationsJson:JSON.stringify(this.payload)}});
  if(!update.count){this.controller.abort();throw Error("TASK_CANCELLED");}this.expected=next;
 }
 async call<I,O>(asset:PromptAsset<I,O>,promptInput:I,options:PromptExecutionOptions={}){
  const limit=Number(this.payload.input.maxRequests??500);
  if((this.payload.callCount??0)>=limit)throw Error("MANUSCRIPT_REQUEST_BUDGET_EXHAUSTED");
  this.payload.callCount=(this.payload.callCount??0)+1;await this.write();
  const result=await runStructuredPrompt({asset,promptInput,options:{...options,taskId:this.row.id,signal:this.controller.signal,timeoutMs:120000,entrypoint:"manuscript_revision"}});
  const current=await prisma.manuscriptRevisionProposal.findUnique({where:{id:this.row.id},select:{status:true,dependenciesJson:true}});
  if(current?.status!=="generating"||current.dependenciesJson!==this.expected)throw Error("TASK_CANCELLED");
  return result.output;
 }
}
export class ManuscriptTaskService {
 async execute(id:string){
  const row=await prisma.manuscriptRevisionProposal.findUnique({where:{id}});if(!row||row.status!=="generating"||!handlers.has(row.kind))return;
  const deps=json<Dependencies>(row.dependenciesJson,{} as Dependencies);
  if(deps.task&&deps.task.leaseUntil>Date.now())return;
  const claimed={...deps,task:{generation:randomUUID(),owner:`manuscript-${process.pid}`,leaseUntil:Date.now()+15*60_000}};
  const taken=await prisma.manuscriptRevisionProposal.updateMany({where:{id,status:"generating",updatedAt:row.updatedAt},data:{dependenciesJson:JSON.stringify(claimed)}});
  if(!taken.count)return;
  const task=new ManuscriptTaskExecution({...row,dependenciesJson:JSON.stringify(claimed)});
  try{await assertManuscriptSnapshot(prisma,row.projectId,task.snapshot);await handlers.get(row.kind)!(task);await assertManuscriptSnapshot(prisma,row.projectId,task.snapshot);await task.write("pending");}
  catch(error){if(error instanceof Error&&error.message==="TASK_CANCELLED")return;task.payload.error=error instanceof Error&&error.message==="MANUSCRIPT_REQUEST_BUDGET_EXHAUSTED"?"本次分析达到结构化请求上限，已完成片段保留；请提高上限后继续。":"本次分析未完成，已读取的片段保留；请核对版本后继续。";await task.write(error instanceof Error&&error.message==="REVISION_BASE_STALE"?"stale":"failed").catch(()=>{});}
  finally{controllers.delete(id);}
 }
 async cancel(projectId:string,id:string){const row=await prisma.manuscriptRevisionProposal.findFirst({where:{id,projectId}});if(!row)throw Error("MANUSCRIPT_NOT_FOUND");if(row.status==="applied")throw Error("REVISION_BASE_STALE");await prisma.manuscriptRevisionProposal.updateMany({where:{id,projectId,status:{in:["generating","failed","pending"]}},data:{status:"rejected"}});controllers.get(id)?.abort();return {cancelled:true};}
 async retry(projectId:string,id:string,maxRequests?:number){const row=await prisma.manuscriptRevisionProposal.findFirst({where:{id,projectId}});if(!row||row.status!=="failed")throw Error("REVISION_BASE_STALE");const deps=json<Dependencies>(row.dependenciesJson,{} as Dependencies);await assertManuscriptSnapshot(prisma,projectId,deps.snapshot);const payload=json<ManuscriptTaskPayload>(row.operationsJson,{input:{}});if(maxRequests)payload.input.maxRequests=maxRequests;delete payload.error;await prisma.manuscriptRevisionProposal.updateMany({where:{id,status:"failed"},data:{status:"generating",dependenciesJson:JSON.stringify({snapshot:deps.snapshot}),operationsJson:JSON.stringify(payload)}});taskDispatcher.notify({commandType:"manuscript",taskId:id});return {taskId:id,status:"generating"};}
}
let stopWorker:(()=>void)|undefined;
export function startManuscriptWorker(){
 if(stopWorker)return stopWorker;
 require("./ManuscriptBaselineService").registerManuscriptBaselineTask();
 require("./ManuscriptRevisionService").registerManuscriptRevisionTasks();
 const tasks=new ManuscriptTaskService();let busy=false;
 const drain=async()=>{if(busy)return;busy=true;try{const rows=await prisma.manuscriptRevisionProposal.findMany({where:{status:"generating",kind:{in:[...handlers.keys()]}},orderBy:{createdAt:"asc"},take:20});for(const row of rows)await tasks.execute(row.id);}catch{ /* Next durable poll retries; no manuscript or provider details in logs. */ }finally{busy=false;}};
 const timer=setInterval(()=>void drain(),2000);timer.unref();const unsubscribe=taskDispatcher.onTaskAvailable(hint=>{if(hint?.commandType==="manuscript")void drain();});void drain();stopWorker=()=>{clearInterval(timer);unsubscribe();stopWorker=undefined;};return stopWorker;
}
