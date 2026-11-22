import {useState, type ReactNode} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {createDirectorCommandKey, submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";
import {AppDialogContent, Dialog} from "@/components/ui/dialog";

export type PlanEditorRenderer = (input: {runId:string; expectedVersion:number; onClose:()=>void}) => ReactNode;

export interface ChapterProseApproval {planVersionId: string; approveForProse: string}

export default function DirectorGate({runId, novelId, expectedVersion, reviewType, canConfirm = true, renderPlanEditor, proseApproval}: {runId:string; novelId:string; expectedVersion:number; reviewType?:string; canConfirm?:boolean; renderPlanEditor?:PlanEditorRenderer; proseApproval?:ChapterProseApproval}) {
  const queries=useQueryClient();
  const [regenerating, setRegenerating]=useState(false);
  const [guidance, setGuidance]=useState("");
  const [editing, setEditing]=useState(false);
  const editLabel = reviewType === "chapter_task_sheet" ? "与 AI 讨论或编辑任务与场景"
    : reviewType === "character_cast" ? "与 AI 讨论或编辑角色阵容" : reviewType === "volume_strategy" ? "与 AI 讨论或编辑卷纲" : undefined;
  const batchReview = reviewType === "chapter_batch_closed" && Boolean(renderPlanEditor);
  const confirmSaved = reviewType === "chapter_execution_contract" || reviewType === "chapter_batch_closed";
  const canGenerate=reviewType==="chapter_task_sheet" || reviewType==="volume_strategy";
  const chapterApproval = reviewType === "chapter_task_sheet" ? proseApproval : undefined;
  const mutation=useMutation({
    mutationFn:(decision:"confirm"|"confirm_after_edit"|"regenerate")=>submitDirectorCommand({type:"resolve_gate",runId,decision,expectedVersion,idempotencyKey:createDirectorCommandKey(),
      ...(decision === "confirm" && chapterApproval ? {chapterPlanEdit: {...chapterApproval, chapters: []}} : {}),
      ...(decision==="regenerate" && canGenerate && guidance.trim() ? {guidance:guidance.trim()} : {})}),
    onSuccess:async()=>{
      setRegenerating(false);setGuidance("");
      await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)}),queries.invalidateQueries({queryKey:["directorBookWorkspace",novelId]})]);
    },
  });
  return <section className="space-y-3 border-t border-border/50 py-4">
    {canConfirm ? <>
      {batchReview ? <Button onClick={()=>setEditing(true)}>与 AI 讨论并确认本批正文</Button> : <>
      <p className="text-xs leading-5 text-muted-foreground">核对左侧结果后，可以确认并继续{editLabel && renderPlanEditor ? "，也可以先编辑内容" : ""}{canGenerate ? "，或请 AI 按你的建议重写" : ""}。</p>
      <Button disabled={mutation.isPending} onClick={()=>mutation.mutate("confirm")}>{chapterApproval ? "确认本批章节并继续写正文" : "确认结果并继续"}</Button></>}
    </> : null}
    <div className="flex flex-wrap gap-2">
      {canConfirm && editLabel && renderPlanEditor ? <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>setEditing(true)}>{editLabel}</Button> : null}
      {canConfirm && !batchReview && confirmSaved ? <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>mutation.mutate("confirm_after_edit")}>确认已保存的修改</Button> : null}
      {canGenerate ? <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>{mutation.reset();setRegenerating(true);}}>重新生成本阶段</Button>
        : reviewType==="chapter_execution_contract" ? <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>mutation.mutate("regenerate")}>重新同步执行计划</Button> : null}
    </div>
    {mutation.isError && !regenerating ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>:null}
    <Dialog open={regenerating} onOpenChange={open=>{if(!mutation.isPending)setRegenerating(open);}}>
      <AppDialogContent title="重新生成本阶段" description="说明希望保留或调整的内容，AI 会据此重新生成。建议可以留空。"
        footer={<><Button variant="ghost" disabled={mutation.isPending} onClick={()=>setRegenerating(false)}>返回查看</Button><Button disabled={mutation.isPending} onClick={()=>mutation.mutate("regenerate")}>{mutation.isPending ? "正在提交…" : guidance.trim() ? "按建议重新生成" : "重新生成"}</Button></>}>
        <label className="space-y-2 text-sm"><span>人工修正建议（选填）</span><textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" value={guidance} onChange={event=>setGuidance(event.target.value)} maxLength={6000} disabled={mutation.isPending} rows={6} placeholder="例如：保留残符的设定，让主角主动试探能力，结尾增加悬念。"/></label>
        {mutation.isError ? <p role="alert" className="mt-3 text-sm text-destructive">{mutation.error.message}</p>:null}
      </AppDialogContent>
    </Dialog>
    {canConfirm && editing ? renderPlanEditor?.({runId,expectedVersion,onClose:()=>setEditing(false)}) : null}
  </section>;
}
