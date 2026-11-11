import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ChapterEditorOperation, ChapterEditorTargetRange } from "@ai-novel/shared/types/novel";
import { getManuscriptWorkspace, getManuscriptProposal, diagnoseManuscriptUnit, previewManuscriptRevision, applyManuscriptProposal, saveManuscriptUnit, rejectManuscriptProposal, restoreManuscriptOriginal, undoManuscriptChange, cancelManuscriptTask, retryManuscriptTask, retryManuscriptSync, type ManuscriptProposalView, type ManuscriptWorkspace } from "@/api/manuscripts";
import type { ApiHttpError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { useLLMStore } from "@/store/llmStore";
import ChapterTextEditor from "../components/chapterEditor/ChapterTextEditor";
import { DesktopManuscriptNotice, ManuscriptDirectory, ManuscriptDiff, ManuscriptNotice } from "./ManuscriptUI";
import { ManuscriptBaselinePanel } from "./ManuscriptBaselinePanel";
import { ManuscriptStructurePanel } from "./ManuscriptStructurePanel";
import "./manuscript.css";

export default function ManuscriptRevisionPage() {
  const mobile=useIsMobileViewport();
  return mobile?<DesktopManuscriptNotice/>:<DesktopManuscriptRevision/>;
}
function DesktopManuscriptRevision() {
  const {id=""}=useParams(), [params,setParams]=useSearchParams(), cache=useQueryClient();
  const requestedUnit=params.get("unitId")??"";
  const query=useQuery({queryKey:["manuscript-workspace",id,requestedUnit],queryFn:()=>getManuscriptWorkspace(id,requestedUnit||undefined),enabled:!!id});
  if(query.isPending)return <ManuscriptNotice>正在打开原稿与工作稿…</ManuscriptNotice>;
  if(query.isError||!query.data)return <section className="space-y-4"><ManuscriptNotice error>{query.error?.message??"无法读取这本书的原稿项目。"}</ManuscriptNotice><Button variant="outline" onClick={()=>void query.refetch()}>重新读取</Button><Button asChild variant="ghost"><Link to="/novels">返回小说</Link></Button></section>;
  const refresh=async()=>{await cache.invalidateQueries({queryKey:["manuscript-workspace",id]});};
  return <RevisionWorkspace key={query.data.currentUnit?.id??query.data.project.id} workspace={query.data} onRefresh={refresh} onSelect={unitId=>setParams(current=>{const next=new URLSearchParams(current);next.set("unitId",unitId);return next;})}/>;
}
function RevisionWorkspace({workspace,onRefresh,onSelect}:{workspace:ManuscriptWorkspace;onRefresh:()=>Promise<void>;onSelect:(id:string)=>void}) {
  const {project,source,currentUnit:unit,units}=workspace;
  const llm=useLLMStore();
  const model={provider:llm.provider,model:llm.model,temperature:llm.temperature};
  const [draft,setDraft]=useState(unit?.content??"");
  const [selection,setSelection]=useState<ChapterEditorTargetRange|null>(null);
  const [instruction,setInstruction]=useState(""),[operation,setOperation]=useState<ChapterEditorOperation>("polish");
  const [compare,setCompare]=useState<"current"|"original"|"candidate">("current");
  const [showBaseline,setShowBaseline]=useState(false),[showStructure,setShowStructure]=useState(false),[showInactive,setShowInactive]=useState(false);
  const [proposal,setProposal]=useState<ManuscriptProposalView|null>(workspace.proposals.find(item=>item.unitId===unit?.id&&(item.status==="generating"||item.status==="failed"||((item.status==="pending"||item.status==="stale")&&!!item.candidates?.length)))??null);
  const [candidateId,setCandidateId]=useState(proposal?.candidates?.[0]?.id??""),[message,setMessage]=useState("");
  const commandKey=useRef(crypto.randomUUID());
  const lastSavedText=useRef(unit?.content??"");
  const dirty=draft!==(unit?.content??"");
  useEffect(()=>{const listener=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",listener);return()=>window.removeEventListener("beforeunload",listener);},[dirty]);
  useEffect(()=>{if(draft===lastSavedText.current)setDraft(unit?.content??"");lastSavedText.current=unit?.content??"";commandKey.current=crypto.randomUUID();},[unit?.contentHash]);
  const pending=useQuery({queryKey:["manuscript-proposal",project.id,proposal?.id],queryFn:()=>getManuscriptProposal(project.id,proposal!.id),enabled:!!proposal&&proposal.status==="generating",refetchInterval:query=>query.state.data?.status==="generating"?2000:false});
  const shown=pending.data??proposal;
  const candidate=shown?.candidates?.find(item=>item.id===candidateId)??shown?.candidates?.[0];
  const active=units.filter(item=>item.status==="active"),inactive=units.filter(item=>item.status==="inactive");
  const lastChange=workspace.proposals.find(item=>item.unitId===unit?.id&&item.status==="applied"&&item.appliedReceipt?.afterHash===unit?.contentHash);
  const base=()=>({expectedStructureVersion:project.structureVersion,baseUnitRevision:unit!.workingRevision,expectedUnitRevision:unit!.workingRevision,baseContentHash:unit!.contentHash,baselineOutlineRevisionId:project.baselineOutlineRevisionId,baseWorkingOutlineRevisionId:project.workingOutlineRevisionId,requestKey:commandKey.current});
  const receive=(value:ManuscriptProposalView)=>{setProposal(value);setCandidateId(value.candidates?.[0]?.id??"");if(value.candidates?.length)setCompare("candidate");commandKey.current=crypto.randomUUID();};
  const diagnose=useMutation({mutationFn:()=>diagnoseManuscriptUnit(project.id,unit!.id,{...base(),...model}),onSuccess:receive});
  const preview=useMutation({mutationFn:()=>previewManuscriptRevision(project.id,unit!.id,{...base(),...model,operation,instruction,selection:selection??undefined}),onSuccess:receive});
  const save=useMutation({mutationFn:()=>saveManuscriptUnit(project.id,unit!.id,{...base(),content:draft}),onSuccess:async()=>{setMessage("本章手动修改已保存；留在本章，不会自动生成下一章。");setProposal(null);await onRefresh();}});
  const apply=useMutation({mutationFn:()=>applyManuscriptProposal(project.id,shown!.id,{...base(),candidateId:candidate!.id}),onSuccess:async()=>{setMessage("候选已采纳并保存，仅改动本章。可撤回最新采纳。");setProposal(null);setCompare("current");await onRefresh();},onError:error=>{if((error as ApiHttpError).status===409)setProposal(current=>current?{...current,status:"stale"}:current);}});
  const restore=useMutation({mutationFn:()=>restoreManuscriptOriginal(project.id,unit!.id,base()),onSuccess:receive});
  const undo=useMutation({mutationFn:()=>undoManuscriptChange(project.id,lastChange!.id,{expectedStructureVersion:project.structureVersion,expectedAfterHash:unit!.contentHash,requestKey:crypto.randomUUID()}),onSuccess:async()=>{setMessage("最新采纳已撤回，原稿与历史仍保留。");setProposal(null);await onRefresh();}});
  const reject=useMutation({mutationFn:()=>rejectManuscriptProposal(project.id,shown!.id),onSuccess:()=>{setProposal(null);setCompare("current");}});
  const cancel=useMutation({mutationFn:()=>cancelManuscriptTask(project.id,shown!.taskId??shown!.id),onSuccess:()=>{setProposal(null);setMessage("本次生成已取消；原稿和正文保持不变。");}});
  const retry=useMutation({mutationFn:()=>retryManuscriptTask(project.id,shown!.id),onSuccess:receive});
  const sync=useMutation({mutationFn:()=>retryManuscriptSync(project.id,unit!.id,base()),onSuccess:()=>{setMessage("已登记本章资料对账，不会重写正文。");void onRefresh();}});
  const busy=diagnose.isPending||preview.isPending||save.isPending||apply.isPending||restore.isPending||undo.isPending||reject.isPending;
  const generating=shown?.status==="generating";
  const error=diagnose.error??preview.error??save.error??apply.error??restore.error??undo.error??reject.error??cancel.error??retry.error??sync.error;
  const stale=shown?.status==="stale";
  const selectUnit=(next:string)=>{if(!dirty||window.confirm("本章有未保存修改。放弃修改并切换章节吗？"))onSelect(next);};
  const next=unit?active[active.findIndex(item=>item.id===unit.id)+1]:null;
   const aiAllowed=!!unit&&unit.status==="active"&&!!project.baselineOutlineRevisionId&&!dirty&&!busy&&!generating;
  return <section className="manuscript-workspace mx-auto max-w-[1800px]" aria-label="原稿逐章修订工作区">
     <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-3"><div><p className="text-xs text-muted-foreground">小说 / 原稿修订</p><h1 className="mt-1 text-xl font-semibold">{project.title}</h1><p className="mt-2 text-xs leading-6 text-muted-foreground">原稿 v{source.version} · 只读　{units.some(item=>item.chapterId===null)?"导入短篇上下文：无确认生成意图":"原纲："+ (project.baselineOutlineRevisionId?"已确认，固定修订":"待确认")}　工作稿：第 {unit?.workingRevision??0} 次保存</p></div><div className="flex flex-wrap gap-2">{units.some(item=>item.chapterId===null)?null:<Button variant="outline" size="sm" onClick={()=>setShowBaseline(true)}>原纲与工作大纲</Button>}<Button asChild variant="ghost" size="sm"><Link to="/novels">返回小说</Link></Button></div></header>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>{active.length} 个有效章 · {inactive.length} 个停用章 · 原稿完整保留 {source.charCount.toLocaleString()} 字符</p><p>每次只修订当前章；其他章不会自动生成或采纳。</p></div>
   {!project.baselineOutlineRevisionId?<ManuscriptNotice>原稿大纲尚未确认。可以阅读和手动修改；<button className="underline" onClick={()=>setShowBaseline(true)}>确认原纲后启用 AI 修文</button>。</ManuscriptNotice>:null}
    <div className="manuscript-grid">
      <nav className="manuscript-scroll flex flex-col gap-3 pr-1" aria-label="修订章节目录"><h2 className="text-sm font-semibold">{showInactive?"已停用章":"工作目录"}</h2><ManuscriptDirectory items={showInactive?inactive:active} selectedId={unit?.id??""} onSelect={selectUnit} render={item=><><span className="block break-words">{item.status==="active"?`${item.displayOrder}. `:""}{item.title}</span><span className="block text-xs font-normal text-muted-foreground">{item.status==="inactive"?"已停用 · 原文保留":!item.sourceRanges.length?"新增章 · 无原稿":item.workingRevision>1?"已修改":"原稿导入"}</span></>}/><div className="mt-auto space-y-1 border-t border-border/50 pt-3"><Button size="sm" variant="ghost" onClick={()=>setShowInactive(value=>!value)}>{showInactive?"返回有效目录":`已停用章（${inactive.length}）`}</Button><Button size="sm" variant="outline" disabled={dirty||busy} onClick={()=>setShowStructure(true)}>调整章节结构</Button></div></nav>
      <div className="manuscript-body flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{unit?.title??"选择一个章节"}</h2><div className="flex flex-wrap gap-1"><Button size="sm" variant={compare==="current"?"secondary":"ghost"} onClick={()=>setCompare("current")}>当前稿</Button><Button size="sm" variant={compare==="original"?"secondary":"ghost"} onClick={()=>setCompare("original")}>与原稿对照</Button>{candidate?<Button size="sm" variant={compare==="candidate"?"secondary":"ghost"} onClick={()=>setCompare("candidate")}>候选差异</Button>:null}</div></div>
        <div className="manuscript-scroll flex-1 rounded-lg bg-muted/10 p-4">{!unit?<ManuscriptNotice>从左侧选择一章，或新增章节开始修订。</ManuscriptNotice>:compare==="current"?<ChapterTextEditor value={draft} onChange={setDraft} onSelectionChange={setSelection} onCursorChange={()=>{}} documentKey={unit.id} readOnly={unit.status!=="active"||busy||generating} ghostSuspended layoutMode="wide"/>:<div className="manuscript-compare"><section><h3 className="mb-4 text-sm font-semibold">{compare==="original"?"原稿，只读":"当前工作稿，只读"}</h3><div className="manuscript-reading">{compare==="original"?(unit.sourceRanges.length?unit.originalText:"新增章，无原稿"):unit.content}</div></section><section><h3 className="mb-4 text-sm font-semibold">{compare==="original"?"当前工作稿":"未采纳候选 · ＋新增 / −删除"}</h3>{compare==="original"?<div className="manuscript-reading">{draft}</div>:candidate?<ManuscriptDiff chunks={candidate.diffChunks}/>:null}</section></div>}</div>
        {dirty?<p role="status" className="shrink-0 text-xs text-muted-foreground">有未保存手改。先保存或放弃，再生成候选或采纳。</p>:null}
      </div>
      <aside className="manuscript-inspector manuscript-scroll space-y-5 rounded-lg bg-muted/30 p-4" aria-label="本章建议与候选">
        <h2 className="text-lg font-semibold">{candidate?"审阅本次候选":"本章建议"}</h2>
        {generating||diagnose.isPending||preview.isPending?<><ManuscriptNotice>正在读取本章工作稿与约束，只生成待确认建议或候选。</ManuscriptNotice>{shown?<Button size="sm" variant="outline" onClick={()=>cancel.mutate()} disabled={cancel.isPending}>取消本次生成</Button>:null}</>:null}
        {shown?.status==="failed"?<><ManuscriptNotice error>{shown.error??"生成未完成，正文与原稿保持不变。"}</ManuscriptNotice><Button variant="outline" size="sm" disabled={dirty||retry.isPending} onClick={()=>retry.mutate()}>基于已保存进度重试</Button></>:null}
        {stale?<ManuscriptNotice error>本章、前文或工作大纲有更新，候选仅供对照，不能直接覆盖。请基于最新工作稿重新生成。</ManuscriptNotice>:null}
        {shown?.diagnosticCards?.length?<div className="space-y-4">{shown.diagnosticCards.map(card=><section key={card.id} className="space-y-2 border-b border-border/50 pb-4"><h3 className="text-sm font-semibold">{card.title}</h3><p className="text-sm leading-7">{card.problemSummary}</p><p className="text-xs leading-6 text-muted-foreground">影响：{card.whyItMatters}</p>{card.mustPreserve?.length?<p className="text-xs leading-6">保留：{card.mustPreserve.join("、")}</p>:null}<Button variant="ghost" size="sm" disabled={!aiAllowed} onClick={()=>{setInstruction(card.repairGoal??card.problemSummary);setOperation(card.recommendedAction);}}>使用这个修改目标</Button></section>)}</div>:null}
        {candidate?<><div className="flex flex-wrap gap-2">{shown?.candidates?.map(item=><Button key={item.id} variant={candidate.id===item.id?"secondary":"ghost"} size="sm" onClick={()=>{setCandidateId(item.id);setCompare("candidate");}}>{item.label}</Button>)}</div><p className="text-sm leading-7">{candidate.summary||"请比较候选与当前稿的差异，再决定是否采纳。"}</p>{candidate.rationale?<p className="text-xs leading-6 text-muted-foreground">修改理由：{candidate.rationale}</p>:null}{candidate.riskNotes?.map((risk,i)=><ManuscriptNotice key={i}>{risk}</ManuscriptNotice>)}<Button variant="outline" size="sm" disabled={dirty||stale||busy} onClick={()=>{setDraft(candidate.content);setCompare("current");setMessage("候选仅载入编辑区，尚未保存。手改后使用保存当前手改。");}}>载入编辑区，不保存</Button><Button variant="ghost" size="sm" disabled={busy||generating} onClick={()=>{if(stale){setProposal(null);setCompare("current");}else reject.mutate();}}>放弃候选</Button></>:null}
        <section className="space-y-3 border-t border-border/50 pt-4"><p className="text-xs leading-6 text-muted-foreground">默认保留人物身份、核心事实、主线因果、视角与结局。调整核心情节请先编辑工作大纲并确认影响。</p><Button variant="outline" className="w-full" disabled={!aiAllowed} onClick={()=>diagnose.mutate()}>{diagnose.isPending?"诊断中…":"查看本章建议"}</Button><label className="block space-y-1 text-sm"><span>修订方式</span><select className="manuscript-field" value={operation} onChange={e=>setOperation(e.target.value as ChapterEditorOperation)}><option value="polish">润色</option><option value="expand">丰富内容</option><option value="compress">删减压缩</option><option value="emotion">增强情绪</option><option value="conflict">加强冲突</option><option value="custom">自定义目标</option></select></label><label className="block space-y-1 text-sm"><span>这一次希望怎么改</span><textarea className="manuscript-field min-h-24 leading-6" value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="例如：补充逃离过程，不改凶手身份"/></label><p className="text-xs text-muted-foreground">范围：{selection?`已选片段 ${selection.text.length} 字`:"仅当前整章"}。超长章请先选段。</p><Button variant="secondary" className="w-full" disabled={!aiAllowed} onClick={()=>preview.mutate()}>{preview.isPending?"生成候选中…":"生成修文候选"}</Button></section>
        <details className="border-t border-border/50 pt-4"><summary className="cursor-pointer text-xs text-muted-foreground">原稿与历史操作</summary><div className="mt-3 space-y-2"><Button variant="outline" size="sm" disabled={!unit?.sourceRanges.length||dirty||busy} onClick={()=>restore.mutate()}>预览恢复本章原稿</Button><Button variant="outline" size="sm" disabled={!lastChange||dirty||busy} onClick={()=>undo.mutate()}>撤回最新采纳</Button></div></details>
      </aside>
    </div>
    {message?<ManuscriptNotice>{message}</ManuscriptNotice>:null}
    {(workspace.syncState==="pending"||workspace.syncState==="failed")?<ManuscriptNotice>正文已保存；事实同步{workspace.syncState==="failed"?"失败，需重试对账":"待完成"}。不需要重新生成或采纳正文。{workspace.syncState==="failed"?<Button variant="ghost" size="sm" disabled={dirty||sync.isPending} onClick={()=>sync.mutate()}>重试资料对账</Button>:null}</ManuscriptNotice>:null}
    {error?<ManuscriptNotice error>{error.message}<Button variant="ghost" size="sm" onClick={()=>{if(!dirty||window.confirm("重新读取会放弃未保存手改，是否继续？")){setDraft(unit?.content??"");void onRefresh();}}}>读取最新工作稿</Button></ManuscriptNotice>:null}
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3"><p className="text-xs leading-6 text-muted-foreground">本次：仅“{unit?.title??"当前章"}”；不会改动原稿、原纲或其他章。</p><div className="flex flex-wrap gap-2">{dirty?<><Button variant="ghost" disabled={busy} onClick={()=>setDraft(unit?.content??"")}>放弃手改</Button><Button disabled={busy||unit?.status!=="active"} onClick={()=>save.mutate()}>{save.isPending?"保存中…":"保存当前手改"}</Button></>:<><Button variant="outline" disabled={!lastChange||busy} onClick={()=>undo.mutate()}>撤回最新采纳</Button><Button disabled={!candidate||shown?.status!=="pending"||busy||stale||unit?.status!=="active"} onClick={()=>apply.mutate()}>{apply.isPending?"保存中…":"采纳并保存本章"}</Button></>}{next?<Button variant="ghost" disabled={busy} onClick={()=>selectUnit(next.id)}>下一章</Button>:null}</div></footer>
     <Dialog open={showBaseline} onOpenChange={setShowBaseline}><AppDialogContent title="原稿大纲与独立工作大纲" description="核对全书证据并冻结基线；后续仅编辑工作大纲。" className="max-h-[90dvh] max-w-3xl overflow-auto"><ManuscriptBaselinePanel workspace={workspace} model={model} onChanged={()=>{void onRefresh();setShowBaseline(false);}}/></AppDialogContent></Dialog>
     {!units.some(item=>item.chapterId===null)?<Dialog open={showStructure} onOpenChange={setShowStructure}><AppDialogContent title="调整工作稿章节结构" description="先预览引用、承接与重算范围，再确认本次变化。" className="max-h-[90dvh] max-w-2xl overflow-auto"><ManuscriptStructurePanel workspace={workspace} onChanged={()=>void onRefresh()} onClose={()=>setShowStructure(false)}/></AppDialogContent></Dialog>:null}
  </section>;
}
