import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ManuscriptEncoding, ManuscriptPartitionUnit, ManuscriptUnitRole } from "@ai-novel/shared/types/manuscript";
import { createManuscriptImport, getManuscriptSession, splitManuscript, saveManuscriptPartition, confirmManuscriptImport, getManuscriptSourceText } from "@/api/manuscripts";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { featureFlags } from "@/config/featureFlags";
import { DesktopManuscriptNotice, ManuscriptDirectory, ManuscriptNotice } from "./ManuscriptUI";
import { manuscriptRoleLabels, moveManuscriptBoundary, mergeManuscriptPrevious, splitManuscriptUnit } from "./partitionModel";
import "./manuscript.css";

export default function ManuscriptImportPage() {
  const mobile=useIsMobileViewport();
  return mobile?<DesktopManuscriptNotice/>:!featureFlags.manuscriptRevisionEnabled?<ManuscriptNotice>原稿修订入口未开启。<Link to="/novels" className="ml-2 underline">返回小说</Link></ManuscriptNotice>:<DesktopManuscriptImport/>;
}
function DesktopManuscriptImport() {
  const navigate=useNavigate(), cache=useQueryClient();
  const [params,setParams]=useSearchParams();
  const sessionId=params.get("sessionId")??"";
  const [title,setTitle]=useState("");
  const [narrativeForm,setNarrativeForm]=useState<"long_novel"|"short_story">("long_novel");
  const [mode,setMode]=useState<"upload"|"paste">("upload");
  const [file,setFile]=useState<File|null>(null),[pastedText,setPastedText]=useState("");
  const [encoding,setEncoding]=useState<ManuscriptEncoding>("utf-8");
  const [draft,setDraft]=useState<ManuscriptPartitionUnit[]>([]),[selectedId,setSelectedId]=useState("");
  const [boundary,setBoundary]=useState(0),[splitPoint,setSplitPoint]=useState(0),[position,setPosition]=useState(0);
  const [confirmed,setConfirmed]=useState(false),[localError,setLocalError]=useState("");
  const readRef=useRef<HTMLTextAreaElement>(null);
  const importKey=useRef(crypto.randomUUID()), confirmKey=useRef(crypto.randomUUID());
  const sessionQuery=useQuery({queryKey:["manuscript-import",sessionId],queryFn:()=>getManuscriptSession(sessionId),enabled:!!sessionId});
  const session=sessionQuery.data;
  useEffect(()=>{if(session){setDraft(session.units);setSelectedId(current=>session.units.some(unit=>unit.draftId===current)?current:session.units[0]?.draftId??"");setConfirmed(false);}},[session]);
  useEffect(()=>{confirmKey.current=crypto.randomUUID();setConfirmed(false);},[title,draft]);
  const selected=draft.find(unit=>unit.draftId===selectedId);
  useEffect(()=>{setBoundary(selected?.range.start??0);setSplitPoint(selected?Math.floor((selected.range.start+selected.range.end)/2):0);setPosition(selected?.range.start??0);},[selectedId]);
  const from=selected?Math.max(selected.range.start,Math.min(position,Math.max(selected.range.start,selected.range.end-1))):0;
  const to=selected?Math.min(selected.range.end,from+12000):0;
  const source=useQuery({queryKey:["manuscript-source",session?.source.sourceHash,from,to],queryFn:()=>getManuscriptSourceText(session!.projectId,session!.sourceId,from,to),enabled:!!session && to>from});
  const changed=!!session && JSON.stringify(draft)!==JSON.stringify(session.units);
  const upload=useMutation({mutationFn:async()=>{
     const created=await createManuscriptImport({title:title.trim(),pastedText:mode==="paste"?pastedText:undefined,encoding,narrativeForm,requestKey:importKey.current},mode==="upload"?file??undefined:undefined);
    setParams({sessionId:created.sessionId});
     const stored=await getManuscriptSession(created.sessionId);
    return splitManuscript(stored);
  },onSuccess:value=>cache.setQueryData(["manuscript-import",value.id],value)});
  const resplit=useMutation({mutationFn:()=>splitManuscript(session!),onSuccess:value=>cache.setQueryData(["manuscript-import",sessionId],value)});
  const save=useMutation({mutationFn:()=>saveManuscriptPartition(sessionId,{expectedSessionVersion:session!.version,sourceHash:session!.source.sourceHash,units:draft}),onSuccess:value=>cache.setQueryData(["manuscript-import",sessionId],value)});
   const create=useMutation({mutationFn:()=>confirmManuscriptImport(sessionId,{expectedSessionVersion:session!.version,sourceHash:session!.source.sourceHash,coverageHash:session!.coverage!.coverageHash,title:title.trim(),requestKey:confirmKey.current}),onSuccess:result=>navigate(`/novels/${result.novelId}/revision`)});
  const error=localError||upload.error?.message||save.error?.message||create.error?.message||resplit.error?.message;
  const busy=upload.isPending||save.isPending||create.isPending||resplit.isPending;
  const updateSelected=(patch:Partial<ManuscriptPartitionUnit>)=>setDraft(items=>items.map(item=>item.draftId===selectedId?{...item,...patch}:item));
  const edit=(fn:()=>ManuscriptPartitionUnit[])=>{try{setDraft(fn());setLocalError("");}catch(error){setLocalError(error instanceof Error?error.message:"无法调整分章边界。");}};
  const coverage=session?.coverage;
  const valid=!!session && !changed && coverage?.complete && !coverage.unresolvedCount && coverage.bodyUnitCount>0;
  const roleOptions=useMemo(()=>Object.entries(manuscriptRoleLabels),[]);
  const reset=()=>{setParams({});setDraft([]);setSelectedId("");importKey.current=crypto.randomUUID();};
  return <section className="manuscript-workspace mx-auto max-w-[1800px]" aria-label="导入原稿修订">
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-4"><div><p className="text-xs text-muted-foreground">小说 / 导入原稿</p><h1 className="mt-1 text-xl font-semibold">建立一份可追溯的修订副本</h1><p className="mt-2 text-sm text-muted-foreground">原文件和原文永久保留；每次修文都先比较，再由你采纳。</p></div><Button asChild variant="ghost"><Link to="/novels">返回小说</Link></Button></header>
    <ol aria-label="导入步骤" className="flex shrink-0 gap-6 text-sm"><li className={!session?"font-medium":"text-muted-foreground"}>1 上传原稿</li><li className={session?"font-medium":"text-muted-foreground"}>2 确认全量分章</li><li className="text-muted-foreground">3 创建修订副本</li></ol>
    {!sessionId?<div className="grid min-h-0 flex-1 gap-8 overflow-auto lg:grid-cols-[minmax(0,1fr)_300px]">
       <div className="max-w-3xl space-y-5 pb-4"><label className="block space-y-2 text-sm"><span>作品名</span><input className="manuscript-field" value={title} onChange={e=>setTitle(e.target.value)} placeholder="为修订副本取个名字" maxLength={200}/></label>
         <label className="block space-y-2 text-sm"><span>作品形式</span><select className="manuscript-field max-w-48" value={narrativeForm} onChange={e=>{setNarrativeForm(e.target.value as "long_novel"|"short_story");importKey.current=crypto.randomUUID();}}><option value="long_novel">长篇小说</option><option value="short_story">短篇小说</option></select></label><p className="text-sm text-muted-foreground">短篇按你确认的分节形成 Segment；没有标题时可将全文确认成一节。</p>
         <div className="flex gap-2" aria-label="原稿输入方式"><Button variant={mode==="upload"?"secondary":"ghost"} onClick={()=>setMode("upload")}>上传 TXT</Button><Button variant={mode==="paste"?"secondary":"ghost"} onClick={()=>setMode("paste")}>粘贴全文</Button></div>
        {mode==="upload"?<label className="flex min-h-52 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-input bg-muted/20 px-6 py-8 text-center"><span className="text-base font-medium">选择 TXT 原稿</span><span className="text-sm text-muted-foreground">完整保留字节与换行，不会覆盖已有作品</span><input type="file" accept=".txt,text/plain" aria-label="选择 TXT 原稿" onChange={e=>{const picked=e.target.files?.[0]??null;setFile(picked);if(picked&&!title)setTitle(picked.name.replace(/\.txt$/i,""));importKey.current=crypto.randomUUID();}} className="sr-only"/><span className="rounded-md bg-secondary px-4 py-2 text-sm text-secondary-foreground">选择 TXT 文件</span>{file?<span className="text-sm tabular-nums">{file.name} · {file.size.toLocaleString()} 字节</span>:null}</label>:<label className="block space-y-2 text-sm"><span>原稿全文</span><textarea aria-label="原稿全文" className="manuscript-field min-h-72 font-sans leading-7" value={pastedText} onChange={e=>{setPastedText(e.target.value);importKey.current=crypto.randomUUID();}} placeholder="粘贴包含目录、前言与结尾的完整稿件"/></label>}
        <label className="flex items-center gap-3 text-sm"><span>文本编码</span><select aria-label="文本编码" className="manuscript-field max-w-48" value={encoding} onChange={e=>{setEncoding(e.target.value as ManuscriptEncoding);importKey.current=crypto.randomUUID();}}><option value="utf-8">UTF-8（默认）</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030</option></select></label>
        <p className="text-xs leading-6 text-muted-foreground">文件上限 20 MiB、300 万字符。解码失败会要求重新选择，不会忽略乱码或截去书尾。</p>
      </div><aside className="space-y-4 rounded-lg bg-muted/30 p-5"><h2 className="text-lg font-semibold">这一步只做什么</h2><p className="text-sm leading-7">保存完整原稿，给出分章候选。目录、前言、后记也有归属，你可以逐项核对和调整。</p><p className="text-sm leading-7 text-muted-foreground">只开放长篇闭环。短篇适配另行开放；不会把原稿自动放进全局知识库，也不会生成或改写正文。</p></aside>
    </div>:sessionQuery.isPending?<ManuscriptNotice>正在恢复原稿与分章会话…</ManuscriptNotice>:sessionQuery.isError?<ManuscriptNotice error>{sessionQuery.error.message}<Button variant="ghost" onClick={()=>void sessionQuery.refetch()}>重试读取</Button></ManuscriptNotice>:session?<>
      <label className="flex shrink-0 items-center gap-3 text-sm"><span className="shrink-0">修订副本书名</span><input className="manuscript-field max-w-md" value={title} onChange={e=>setTitle(e.target.value)} placeholder="填写这次修订副本的书名" maxLength={200}/></label>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm"><p>来源：{session.source.originalFileName||"粘贴全文"} · {session.source.encoding.toUpperCase()} · 完整读取 <strong className="tabular-nums">{session.source.charCount.toLocaleString()}</strong> 字符</p><Button variant="ghost" size="sm" onClick={reset}>换一份原稿</Button></div>
      {!draft.length?<Button variant="outline" disabled={busy} onClick={()=>resplit.mutate()}>重试全量候选识别</Button>:null}
      {session.createdNovelId?<ManuscriptNotice>这份原稿已建立修订副本。<Link className="ml-2 underline" to={`/novels/${session.createdNovelId}/revision`}>进入原书</Link></ManuscriptNotice>:null}
      <div className="grid min-h-0 flex-1 gap-6 grid-cols-[240px_minmax(0,1fr)]">
        <nav className="manuscript-scroll pr-2" aria-label="原稿区域目录"><h2 className="mb-3 text-sm font-semibold">章节与附属区域</h2><ManuscriptDirectory items={draft.map(item=>({...item,id:item.draftId}))} selectedId={selectedId} onSelect={setSelectedId} render={unit=><><span className="block break-words">{unit.title}</span><span className="block text-xs font-normal text-muted-foreground">{manuscriptRoleLabels[unit.role]} · {(unit.range.end-unit.range.start).toLocaleString()} 字{unit.needsReview?" · 待确认":""}</span></>}/></nav>
        <section className="manuscript-scroll space-y-4 pr-2" aria-label="原文定位与边界确认">{selected?<>
          <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-4"><label className="space-y-1 text-sm"><span>区域标题</span><input className="manuscript-field" value={selected.title} onChange={e=>updateSelected({title:e.target.value})}/></label><label className="space-y-1 text-sm"><span>归属</span><select aria-label="归属" className="manuscript-field" value={selected.role} onChange={e=>updateSelected({role:e.target.value as ManuscriptUnitRole})}>{roleOptions.map(([role,label])=><option key={role} value={role}>{label}</option>)}</select></label></div>
          <p className="text-xs tabular-nums text-muted-foreground">原文区间 {selected.range.start.toLocaleString()}–{selected.range.end.toLocaleString()} · 保留原始换行 · 只读</p>
          {source.isPending?<ManuscriptNotice>正在读取此处原文…</ManuscriptNotice>:source.isError?<ManuscriptNotice error>无法读取原文，请重新定位。</ManuscriptNotice>:<textarea ref={readRef} aria-label="原文，只读" readOnly value={source.data??""} className="manuscript-field manuscript-reading min-h-64 resize-y bg-muted/20" onSelect={e=>setSplitPoint(from+e.currentTarget.selectionStart)}/>}
          <div className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-xs"><span>定位字符（从 0 计数）</span><input type="number" min={selected.range.start} max={selected.range.end-1} className="manuscript-field w-40" value={position} onChange={e=>setPosition(Number(e.target.value))}/></label><span className="pb-2 text-xs text-muted-foreground">本次显示 {from.toLocaleString()}–{to.toLocaleString()}，长章可继续定位到尾部。</span></div>
          <details className="space-y-3 border-t border-border/50 pt-3"><summary className="cursor-pointer text-sm font-medium">调整分章边界</summary><p className="text-xs leading-6 text-muted-foreground">在原文中点击切分位置，或输入字符位置；相邻区域会一起调整，不丢失任何原文。</p><div className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-xs"><span>本区域起点</span><input type="number" className="manuscript-field w-36" value={boundary} onChange={e=>setBoundary(Number(e.target.value))}/></label><Button variant="outline" size="sm" disabled={draft[0]?.draftId===selectedId} onClick={()=>edit(()=>moveManuscriptBoundary(draft,selectedId,boundary))}>移动起点</Button><Button variant="outline" size="sm" disabled={draft[0]?.draftId===selectedId} onClick={()=>edit(()=>mergeManuscriptPrevious(draft,selectedId))}>与前一区域合并</Button></div><div className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-xs"><span>在此字符前切分</span><input type="number" className="manuscript-field w-36" value={splitPoint} onChange={e=>setSplitPoint(Number(e.target.value))}/></label><Button variant="outline" size="sm" onClick={()=>edit(()=>splitManuscriptUnit(draft,selectedId,splitPoint,crypto.randomUUID()))}>切为两个区域</Button></div></details>
          <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1 accent-primary" checked={!selected.needsReview} onChange={e=>updateSelected({needsReview:!e.target.checked})}/><span>确认此区域的标题、边界与归属</span></label>
        </>:<ManuscriptNotice>尚未确认章节边界。可以明确将全文作为一章，再按需切分。</ManuscriptNotice>}</section>
      </div>
       <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3"><div><p className="text-sm tabular-nums">服务端覆盖：{coverage?.complete?"100%":"未完整"} · {coverage?.bodyUnitCount??0} {narrativeForm==="short_story"?"节":"章"} / {coverage?.attachmentUnitCount??0} 附属区 · 待确认 {coverage?.unresolvedCount??0}</p><p className="mt-1 text-xs text-muted-foreground">{changed?"边界有未保存修改，请先校验并保存。":"目录与前后文会保留在原稿中，不混进正文。"}</p></div><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" disabled={busy} onClick={()=>setDraft(items=>items.map(item=>({...item,needsReview:false})))}>确认全部区域</Button><Button variant="secondary" disabled={busy||!changed} onClick={()=>save.mutate()}>{save.isPending?"校验中…":"校验并保存分章"}</Button></div></div>
      <label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={!valid} onChange={e=>setConfirmed(e.target.checked)} className="accent-primary"/>确认全量分章，只复制原文建立一本新的修订副本</label>
    </>:null}
    {error?<ManuscriptNotice error>{error}</ManuscriptNotice>:null}
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3"><p className="text-xs text-muted-foreground">不会改动原文件、覆盖已有书或调用正文生成。</p>{!sessionId?<Button disabled={busy||!title.trim()||(mode==="upload"?!file:!pastedText.trim())} onClick={()=>{setLocalError("");upload.mutate();}}>{upload.isPending?"正在保存并识别…":"识别目录与分章"}</Button>:<Button disabled={busy||!valid||!confirmed||!title.trim()||!!session?.createdNovelId} onClick={()=>create.mutate()}>{create.isPending?"正在创建…":"创建修订副本"}</Button>}</footer>
  </section>;
}
