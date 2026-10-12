import {useRef, useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {VolumeChapterPlan} from "@ai-novel/shared/types/novel";
import {normalizeChapterScenePlan, parseChapterScenePlan, serializeChapterScenePlan, type ChapterSceneCard} from "@ai-novel/shared/types/chapterLengthControl";
import {chapterPlanEditSchema, chapterPlanRevisionKey} from "@ai-novel/shared/types/director/revision";
import {createDirectorCommandKey, submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";
import {AppDialogContent, Dialog} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";

export function DirectorChapterPlanEditor({novelId, runId, expectedVersion, plan, onClose}: {novelId:string; runId:string; expectedVersion:number; plan:VolumeChapterPlan; onClose:()=>void}) {
  const queries=useQueryClient();
  const [baseRevision]=useState(()=>chapterPlanRevisionKey(plan));
  const [sourceScenePlan]=useState(()=>parseChapterScenePlan(plan.sceneCards,{targetWordCount:plan.targetWordCount}));
  const [taskSheet,setTaskSheet]=useState(plan.taskSheet ?? "");
  const [targetWordCount,setTargetWordCount]=useState(plan.targetWordCount ?? 2200);
  const [mustAvoid,setMustAvoid]=useState(plan.mustAvoid ?? "");
  const [scenes,setScenes]=useState<ChapterSceneCard[]>(()=>sourceScenePlan?.scenes ?? []);
  const initialForm=useRef(JSON.stringify([taskSheet,targetWordCount,mustAvoid,scenes]));
  const dirty=JSON.stringify([taskSheet,targetWordCount,mustAvoid,scenes])!==initialForm.current;
  const [discarding,setDiscarding]=useState(false);
  const mutation=useMutation({mutationFn:async()=>{
    const input=chapterPlanEditSchema.safeParse({baseRevision,taskSheet,targetWordCount,mustAvoid,sceneCards:JSON.stringify({...sourceScenePlan,scenes})});
    if (!input.success) throw new Error(input.error.issues[0]?.message ?? "请检查章节任务和场景内容。");
    const scenePlan=normalizeChapterScenePlan({...sourceScenePlan,scenes},targetWordCount);
    const chapterPlanEdit={...input.data,sceneCards:serializeChapterScenePlan(scenePlan)};
    return submitDirectorCommand({type:"resolve_gate",runId,decision:"confirm_after_edit",chapterPlanEdit,expectedVersion,idempotencyKey:createDirectorCommandKey()});
  },onSuccess:async()=>{
    await Promise.all([queries.invalidateQueries({queryKey:["directorBookWorkspace",novelId]}),queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)})]);
    onClose();
  }});
  function requestClose() {if(mutation.isPending)return;if(dirty)setDiscarding(true);else onClose();}
  function editScene(index:number,key:keyof ChapterSceneCard,value:string|number) {
    setScenes(previous=>previous.map((scene,i)=>i===index ? {...scene,[key]:value} : scene));
  }
  const disabled=mutation.isPending;
  return <Dialog open onOpenChange={open=>{if(!open)requestClose();}}>
    <AppDialogContent title={`编辑第 ${plan.chapterOrder} 章 · 任务与场景`} description="调整任务和场景安排，保存后 AI 会按你的修改继续本次创作。"
      footer={discarding ? <><p className="mr-auto text-sm text-muted-foreground">关闭会放弃未保存的修改。</p><Button variant="ghost" onClick={()=>setDiscarding(false)}>继续编辑</Button><Button variant="outline" onClick={onClose}>放弃修改并关闭</Button></>
        : <><Button variant="ghost" disabled={disabled} onClick={requestClose}>取消</Button><Button disabled={disabled || !taskSheet.trim() || scenes.length<3 || !Number.isSafeInteger(targetWordCount) || targetWordCount<1} onClick={()=>mutation.mutate()}>{disabled ? "正在保存…" : "保存修改并继续"}</Button></>}>
      <div className="space-y-5">
        <label className="block space-y-2 text-sm"><span>章节任务</span><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" rows={6} maxLength={12000} value={taskSheet} disabled={disabled} onChange={event=>setTaskSheet(event.target.value)}/></label>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]"><label className="space-y-2 text-sm"><span>目标字数</span><Input type="number" min={1} max={20000} value={targetWordCount} disabled={disabled} onChange={event=>setTargetWordCount(Number(event.target.value))}/></label><label className="space-y-2 text-sm"><span>需要避免</span><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" rows={2} maxLength={4000} value={mustAvoid} disabled={disabled} onChange={event=>setMustAvoid(event.target.value)}/></label></div>
        {!sourceScenePlan ? <p role="alert" className="text-sm text-destructive">场景内容不完整，请返回并输入修正建议，让 AI 重新安排场景。</p> : null}
        {scenes.map((scene,index)=><section key={scene.key} className="space-y-3 border-t border-border/40 pt-4">
          <h3 className="font-medium">场景 {index+1}</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]"><label className="space-y-2 text-sm"><span>场景标题</span><Input value={scene.title} disabled={disabled} onChange={event=>editScene(index,"title",event.target.value)}/></label><label className="space-y-2 text-sm"><span>场景字数</span><Input type="number" min={1} value={scene.targetWordCount} disabled={disabled} onChange={event=>editScene(index,"targetWordCount",Number(event.target.value))}/></label></div>
          <label className="block space-y-2 text-sm"><span>场景目标</span><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" rows={2} value={scene.purpose} disabled={disabled} onChange={event=>editScene(index,"purpose",event.target.value)}/></label>
          <div className="grid gap-3 sm:grid-cols-2">{([['entryState','入场状态'],['exitState','离场状态'],['resistance','阻力'],['turn','转折']] as const).map(([key,label])=><label key={key} className="space-y-2 text-sm"><span>{label}</span><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" rows={2} value={scene[key]} disabled={disabled} onChange={event=>editScene(index,key,event.target.value)}/></label>)}</div>
        </section>)}
        {mutation.isError ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>:null}
      </div>
    </AppDialogContent>
  </Dialog>;
}
