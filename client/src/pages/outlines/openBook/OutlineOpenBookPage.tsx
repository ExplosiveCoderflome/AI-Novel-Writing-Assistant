import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { outlineOpenBookInputSchema, type OutlineOpenBookInput } from "@ai-novel/shared/types/outlineOpenBook";
import { createOutlineOpenBook, getOutline, getOutlineBookBinding, getOutlineRevision, listOutlineRevisions, previewOutlineOpenBook } from "@/api/outlines";
import { createDirectorCommandKey } from "@/api/directorNext";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { OutlinePreservationDetails } from "@/components/outlines/OutlinePreservationDetails";
import { findOutlineNodeTitle } from "../outlineNodes";
import { suggestedChapterCount, suggestVolumeQuotas } from "./model";

export default function OutlineOpenBookPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobileViewport = useIsMobileViewport();
  const outline = useQuery({ queryKey: ["outline", id], queryFn: () => getOutline(id), enabled: !!id });
  const revisions = useQuery({ queryKey: ["outline-revisions", id], queryFn: () => listOutlineRevisions(id), enabled: !!id });
  const binding = useQuery({ queryKey: ["outline-book-binding", id], queryFn: () => getOutlineBookBinding(id), enabled: !!id });
  const revisionId = searchParams.get("revisionId") ?? revisions.data?.find(item=>item.version===outline.data?.currentVersion)?.id ?? "";
  const revision = revisions.data?.find(item => item.id === revisionId);
  const revisionDetail = useQuery({ queryKey: ["outline-revision", id, revisionId], queryFn: () => getOutlineRevision(id, revisionId), enabled: !!id && !!revisionId && !binding.data });
  const document = revisionDetail.data?.document;
  const currentVersion = outline.data?.currentVersion ?? 0;
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(80);
  const [length, setLength] = useState(3000);
  const [quotas, setQuotas] = useState<Record<string, number>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    if (!document) return;
    const total=suggestedChapterCount(document);
    setTitle(document.story.title || outline.data?.title || ""); setCount(total); setQuotas(suggestVolumeQuotas(document,total));
  }, [revisionDetail.data?.id]);
  const request = useMemo<OutlineOpenBookInput>(()=>({revisionId,expectedProjectVersion:currentVersion,
    bookSettings:{title:title.trim(),estimatedChapterCount:count,defaultChapterLength:length},volumeQuotas:quotas,allowOptimize:[]}),[revisionId,currentVersion,title,count,length,quotas]);
  const requestKey=JSON.stringify(request);
  const creation=useRef<{hash:string;key:string}|null>(null);
  const preview = useMutation({ mutationFn: (input:OutlineOpenBookInput) => previewOutlineOpenBook(id,input) });
  const matches=!!preview.data && JSON.stringify(preview.variables)===requestKey;
  useEffect(()=>{setConfirmed(false);creation.current=null;},[requestKey]);
  const create = useMutation({mutationFn:()=>{
    if (!matches || !confirmed) throw new Error("请先核对本次预览并确认章数与保留内容。");
    const hash=preview.data!.requestHash;
    if (creation.current?.hash!==hash) creation.current={hash,key:createDirectorCommandKey()};
    return createOutlineOpenBook(id,{...preview.variables!,requestHash:hash,idempotencyKey:creation.current!.key});
  },onSuccess:result=>navigate(result.sourceRoute)});
  const back=<Button asChild variant="ghost"><Link to={`/outlines/${id}`}>返回大纲</Link></Button>;
  if (isMobileViewport) return <section className="mx-auto max-w-xl space-y-3 py-8"><h1 className="text-xl font-semibold">请在电脑端确认大纲并开书</h1><p className="text-sm text-muted-foreground">绑定后的小说可从创作工作台继续。</p>{back}</section>;
  if (outline.isLoading || revisions.isLoading || binding.isLoading) return <p className="py-8 text-sm text-muted-foreground">正在读取大纲来源与绑定信息…</p>;
  if (binding.isError || outline.isError || revisions.isError) return <section className="space-y-3"><p role="alert" className="text-sm text-destructive">无法确认大纲来源与绑定信息，请重新读取。</p><Button variant="secondary" onClick={()=>void Promise.all([outline.refetch(),revisions.refetch(),binding.refetch()])}>重新读取</Button>{back}</section>;
  // Resolve an existing binding before validating a revision deep-link: never offer a second book.
  if (binding.data) return <main className="mx-auto max-w-3xl space-y-5 py-8">{back}<h1 className="text-2xl font-semibold">继续这本书</h1><p>{binding.data.title} · 采用大纲修订 v{binding.data.revisionVersion}</p><p className="text-sm text-muted-foreground">一份大纲只绑定一本书。独立大纲的新修订不会自动替换本书来源。</p><Button asChild><Link to={binding.data.sourceRoute}>打开创作工作台</Link></Button></main>;
  if (outline.data?.boundNovelId) return <section className="space-y-3"><p role="alert">大纲绑定信息不完整，请返回来源检查；不会重复创建小说。</p>{back}</section>;
  if (revisionDetail.isLoading) return <p className="py-8 text-sm text-muted-foreground">正在读取所选大纲修订…</p>;
  if (!revision || revisionDetail.isError || !document) return <section className="space-y-3"><p role="alert" className="text-sm text-destructive">找不到这份大纲修订，请重新选择版本。</p>{back}</section>;
  const unsaved=revision.version===currentVersion && !!outline.data?.document && JSON.stringify(outline.data.document)!==JSON.stringify(document);
  const quotaTotal=Object.values(quotas).reduce((sum,value)=>sum+value,0);
  const valid=outlineOpenBookInputSchema.safeParse(request).success && (!document.volumes.length || quotaTotal===count);
  const error=create.error ?? preview.error;
  const checked=matches ? preview.data : undefined;
  return <main className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4" aria-label="按大纲开书预览">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/50 pb-4"><div><p className="text-xs text-muted-foreground">大纲 / {outline.data?.title}</p><h1 className="mt-1 text-2xl font-semibold">把这份大纲带入小说创作</h1><p className="mt-2 text-sm text-muted-foreground">来源：修订 v{revision.version}{revision.version!==currentVersion ? ` · 当前为 v${currentVersion}，本次仍只使用所选版本` : " · 只使用这一版"}；待采纳建议不包含在内。</p></div>{back}</header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-6">
          <section className="space-y-4"><h2 className="text-lg font-semibold">作品设置</h2>
            <label className="block space-y-1.5"><span className="text-sm">书名</span><input className="h-10 w-full rounded-md border border-input bg-background px-3" value={title} onChange={event=>setTitle(event.target.value)}/></label>
            <div className="grid grid-cols-2 gap-4"><label className="space-y-1.5 text-sm"><span className="block">目标章数</span><input aria-label="目标章数" className="h-10 w-full rounded-md border border-input bg-background px-3" type="number" min={1} max={2000} value={count} onChange={event=>{const total=Number(event.target.value);setCount(total);setQuotas(suggestVolumeQuotas(document,total));}}/></label><label className="space-y-1.5 text-sm"><span className="block">每章约多少字</span><input aria-label="每章约多少字" className="h-10 w-full rounded-md border border-input bg-background px-3" type="number" min={500} max={10000} value={length} onChange={event=>setLength(Number(event.target.value))}/></label></div>
          </section>
          {document.volumes.length ? <section className="space-y-3 border-t border-border/50 pt-5"><h2 className="text-lg font-semibold">篇幅分配</h2><p className="text-xs leading-6 text-muted-foreground">这是可调整的章数预算，不会为未展开的位置创建空章节。合计须为 {count} 章。</p>{[...document.volumes].sort((a,b)=>a.order-b.order).map(volume=><label key={volume.nodeId} className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 break-words">{volume.title || "未命名分卷"}<span className="ml-2 text-xs text-muted-foreground">{volume.planningDepth==="rough" ? "粗纲" : "细纲"}</span></span><input aria-label={`${volume.title}预计章数`} className="h-9 w-24 shrink-0 rounded-md border border-input bg-background px-2 text-right tabular-nums" type="number" min={Math.max(1,document.chapters.filter(chapter=>chapter.volumeNodeId===volume.nodeId).length)} max={count} value={quotas[volume.nodeId] ?? 0} onChange={event=>setQuotas(current=>({...current,[volume.nodeId]:Number(event.target.value)}))}/></label>)}{quotaTotal!==count ? <p role="alert" className="text-sm text-destructive">分卷合计 {quotaTotal} 章，请调整为 {count} 章。</p> : null}</section> : null}
          <section className="space-y-3 border-t border-border/50 pt-5"><h2 className="text-lg font-semibold">保留什么</h2><p className="text-sm leading-6 text-muted-foreground">保留大纲中已填写的内容；空白字段可补充，不可违背的固定设定始终约束写作。</p>{document.facts.filter(fact=>fact.immutable).map(fact=><p key={fact.nodeId} className="text-sm leading-6"><strong>{fact.title}：</strong>{fact.content}</p>)}<Button variant="ghost" size="sm" onClick={()=>setShowDetails(value=>!value)} aria-expanded={showDetails}>{showDetails ? "收起保留明细" : "展开保留明细"}</Button>{showDetails ? checked ? <OutlinePreservationDetails policy={checked.policy} document={document}/> : <p className="text-sm text-muted-foreground">先检查开书内容，查看逐字段保留明细。</p> : null}</section>
          <section className="space-y-3 border-t border-border/50 py-5"><h2 className="text-lg font-semibold">补充什么</h2><p className="text-sm leading-6 text-muted-foreground">远期保持卷纲，临近写作时再安排章节。开书后先确认各阶段准备，再明确授权单章正文。</p><p className="text-xs text-muted-foreground">本地未保存的修改和待采纳的 AI 建议不会进入这次开书。</p></section>
        </section>
        <aside className="space-y-4 rounded-lg bg-muted/30 p-5 lg:sticky lg:top-0" aria-label="本次交接"><h2 className="text-lg font-semibold">本次交接</h2>{checked ? <>
          <p className="text-sm leading-7">{checked.counts.volumes} 卷 · {checked.counts.chapters} 份已有章纲<br/>{checked.counts.characters} 位人物草案 · {checked.counts.payoffs} 条伏笔计划</p>
          <div className="space-y-3 border-t border-border/50 pt-4"><h3 className="text-sm font-medium">每卷章数与全书章序</h3>{checked.mapping.volumes.map(volume=><section key={volume.nodeId} className="text-sm"><p className="font-medium">{findOutlineNodeTitle(document,volume.nodeId)}</p><p className="mt-1 tabular-nums text-muted-foreground">预计 {volume.chapterQuota} 章 · 第 {volume.from}–{volume.to} 章</p>{checked.mapping.chapters.filter(chapter=>chapter.volumeId===volume.volumeId).map(chapter=><p key={chapter.nodeId} className="mt-1 text-xs leading-6 text-muted-foreground">第 {chapter.chapterOrder} 章 · {findOutlineNodeTitle(document,chapter.nodeId)}</p>)}</section>)}</div>
          <p className="text-xs leading-6 text-muted-foreground">仅创建上述已有章纲；未展开位置只保留预算。伏笔作为计划显示，有正文证据后才关联实际台账。</p>
          {checked.warnings.map((warning,index)=><p key={index} className="text-sm leading-6 text-warning">{warning}</p>)}
          <label className="flex cursor-pointer items-start gap-2 border-t border-border/50 pt-4 text-sm leading-6"><input type="checkbox" className="mt-1 shrink-0 accent-primary" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>确认每卷章数、章序区间与保留内容，只采用修订 v{checked.revisionVersion}</span></label>
        </> : <p className="text-sm leading-7 text-muted-foreground">核对作品设置与篇幅分配后，检查本次开书内容。</p>}</aside>
      </div>
    </div>
    {unsaved ? <p role="alert" className="shrink-0 text-sm text-warning">工作台有未保存的修改。请返回大纲保存后再开书。</p> : null}
    {error ? <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-destructive"><span>{error.message}</span><Button variant="ghost" size="sm" onClick={()=>void Promise.all([binding.refetch(),outline.refetch(),revisions.refetch()])}>重新检查来源与绑定</Button>{back}</div> : null}
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3"><p className="max-w-md text-xs leading-6 text-muted-foreground">创建后可查看并确认开写准备，不会自动调用模型或生成正文。</p><div className="flex gap-2"><Button variant="secondary" onClick={()=>{setConfirmed(false);preview.mutate(request);}} disabled={!valid || unsaved || preview.isPending || create.isPending}>{preview.isPending ? "正在检查…" : "检查开书内容"}</Button><Button onClick={()=>create.mutate()} disabled={!matches || !confirmed || unsaved || create.isPending}>{create.isPending ? "正在创建…" : "创建小说并查看准备"}</Button></div></footer>
  </main>;
}
