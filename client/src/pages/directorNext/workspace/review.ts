import type {VolumeChapterPlan} from "@ai-novel/shared/types/novel";
import type {WorkspaceBook, WorkspaceChapter} from "./model";

const labels: Record<string,string> = {character_cast:"角色阵容",volume_strategy:"卷纲",chapter_task_sheet:"章节任务与场景",chapter_execution_contract:"正文执行计划",chapter_batch_closed:"本批次正文"};
export interface SavedReview {
  type:string; label:string; ready:boolean; error?:string;
  runId?:string; controlVersion?:number;
  plan?:VolumeChapterPlan;
  execution?:NonNullable<WorkspaceBook["executionPlans"]>[number];
  chapters?:WorkspaceChapter[];
}

/** Navigation selects saved book assets, never derives a director state or authorization. */
export function resolveSavedReview(book:WorkspaceBook, params:URLSearchParams): SavedReview | null {
  const type=params.get("review");
  if (!type) return null;
  const result:SavedReview={type,label:labels[type] ?? "创作结果",ready:false};
  const missing=()=>({...result,error:"无法定位完整的本阶段结果，请重新读取本书或返回导演台查看确认入口。"});
  const contexts=book.reviewContexts?.filter(row=>row.type===type) ?? [];
  if (contexts.length!==1 || contexts[0].novelId!==book.novel.id) return {...result,error:book.reviewContextError ?? "本阶段没有待确认的结果，请返回本书查看下一步或暂停原因。"};
  const context=contexts[0];
  result.runId=context.runId;result.controlVersion=context.controlVersion;
  if (type === "character_cast") return book.materials.characters.length ? {...result,ready:true} : missing();
  if (type === "volume_strategy") return book.planning?.volumes.length ? {...result,ready:true} : missing();
  if (!labels[type]) return missing();
  const {from,to,chapterId:id,volumeId}=context;
  if (typeof from!=="number" || typeof to!=="number" || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from<1 || to<from) return missing();
  if (type === "chapter_batch_closed") {
    const chapters=book.chapters.filter(row=>row.order>=from && row.order<=to).sort((a,b)=>a.order-b.order);
    if (chapters.length!==to-from+1 || chapters.some((row,index)=>row.order!==from+index || !hasText(row.content)) || chapters[0]?.id!==id) return missing();
    return {...result,ready:true,chapters};
  }
  const plans=book.planning?.volumes.filter(volume=>volume.id===volumeId).flatMap(volume=>volume.chapters.filter(plan=>plan.chapterOrder===from)) ?? [];
  if (plans.length!==1) return missing();
  if (type === "chapter_task_sheet") {
    const plan=plans[0];
    if (plan.id!==id || !hasText(plan.taskSheet) || !hasText(plan.sceneCards)) return missing();
    return {...result,ready:true,plan};
  }
  const rows=book.executionPlans?.filter(row=>row.id===id && row.order===from) ?? [];
  if (rows.length!==1 || !hasText(rows[0].taskSheet) || !hasText(rows[0].sceneCards)) return missing();
  return {...result,ready:true,execution:rows[0]};
}

function hasText(value:unknown):value is string {return typeof value==="string" && Boolean(value.trim());}
