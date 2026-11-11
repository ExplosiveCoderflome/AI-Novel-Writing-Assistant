import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createOutlineOpenBook, getOutline, getOutlineBookBinding, getOutlineRevision, listOutlineRevisions, previewOutlineOpenBook, type OutlineOpenBookPreviewRequest } from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { toast } from "@/components/ui/toast";

export default function OutlineOpenBookPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobileViewport = useIsMobileViewport();
  const outline = useQuery({ queryKey: ["outline", id], queryFn: () => getOutline(id), enabled: !!id });
  const revisions = useQuery({ queryKey: ["outline-revisions", id], queryFn: () => listOutlineRevisions(id), enabled: !!id });
  const binding = useQuery({ queryKey: ["outline-book-binding", id], queryFn: () => getOutlineBookBinding(id), enabled: !!id });
  const revisionId = searchParams.get("revisionId") ?? "";
  const revision = revisions.data?.find(item => item.id === revisionId);
  const revisionDetail = useQuery({ queryKey: ["outline-revision", id, revisionId], queryFn: () => getOutlineRevision(id, revisionId), enabled: !!id && !!revisionId });
  const revisionDocument = revisionDetail.data?.document;
  const currentVersion = outline.data?.currentVersion ?? 0;
  const [title, setTitle] = useState("");
  const [targetChapterCount, setTargetChapterCount] = useState(80);
  const [chapterWordCount, setChapterWordCount] = useState(3000);
  const [volumeQuotas, setVolumeQuotas] = useState<Record<string, number>>({});
  const [quotaEdited, setQuotaEdited] = useState(false);
  const [showFixedFacts, setShowFixedFacts] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!revision || !revisionDocument) return;
    setQuotaEdited(false);
    setTargetChapterCount(Math.max(80, revisionDocument.chapters.length));
    setTitle(revisionDocument.story.title || outline.data?.title || "");
    const chaptersByVolume = new Map<string, number>();
    for (const chapter of revisionDocument.chapters) {
      chaptersByVolume.set(chapter.volumeNodeId, (chaptersByVolume.get(chapter.volumeNodeId) ?? 0) + 1);
    }
    let remainder = revisionDocument.volumes.length ? 80 % revisionDocument.volumes.length : 0;
    const perVolumeBudget = revisionDocument.volumes.length ? Math.floor(80 / revisionDocument.volumes.length) : 0;
    setVolumeQuotas(Object.fromEntries(revisionDocument.volumes.map(volume => {
      const existingCount = chaptersByVolume.get(volume.nodeId) ?? 0;
      return [volume.nodeId, Math.max(existingCount, perVolumeBudget + (remainder-- > 0 ? 1 : 0))];
    })));
  }, [revisionDetail.data?.id, outline.data?.title]);

  useEffect(() => {
    if (quotaEdited || !revisionDocument?.volumes.length) return;
    let remainder = targetChapterCount % revisionDocument.volumes.length;
    const base = Math.floor(targetChapterCount / revisionDocument.volumes.length);
    setVolumeQuotas(Object.fromEntries(revisionDocument.volumes.map(volume => [volume.nodeId, base + (remainder-- > 0 ? 1 : 0)])));
  }, [targetChapterCount, revisionDocument?.volumes, quotaEdited]);

  const unsaved = !!outline.data?.document && revision?.version === currentVersion && !!revisionDocument && JSON.stringify(outline.data.document) !== JSON.stringify(revisionDocument);

  const request = useMemo<OutlineOpenBookPreviewRequest | null>(() => revision && revisionDocument ? ({
    revisionId: revision.id,
    expectedProjectVersion: currentVersion,
    bookSettings: { title: title.trim(), estimatedChapterCount: targetChapterCount, defaultChapterLength: chapterWordCount },
    volumeQuotas: Object.entries(volumeQuotas).filter(([, chapterCount]) => chapterCount > 0).map(([nodeId, chapterCount]) => ({ nodeId, chapterCount })),
    allowOptimize: [],
  }) : null, [revision, revisionDocument, currentVersion, title, targetChapterCount, chapterWordCount, volumeQuotas]);
  const preview = useMutation({ mutationFn: () => previewOutlineOpenBook(id, request!), onError: error => toast.error(error instanceof Error ? error.message : "开书预览失败，请重试。") });
  const idempotencyKey = useRef("");
  const create = useMutation({
    mutationFn: () => {
      if (!idempotencyKey.current) idempotencyKey.current = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `${id}:${revisionId}:${Date.now()}`;
      return createOutlineOpenBook(id, { ...request!, requestHash: preview.data!.requestHash, idempotencyKey: idempotencyKey.current });
    },
    onSuccess: result => navigate(result.sourceRoute || `/lab/director/${result.novelId}`),
    onError: error => toast.error(error instanceof Error ? error.message : "创建小说失败，保留设置后可重试。"),
  });
  const resetPreview = preview.reset;
  useEffect(() => { resetPreview(); idempotencyKey.current = ""; }, [request, resetPreview]);
  const runPreview = () => { if (request) preview.mutate(); };

  if (isMobileViewport) return <section className="mx-auto max-w-xl space-y-3 py-8"><h1 className="text-xl font-semibold">请在电脑端确认大纲并开书</h1><p className="text-sm text-muted-foreground">你可以返回大纲查看内容；绑定后的小说仍可从创作工作台继续。</p><Button asChild variant="secondary"><Link to={`/outlines/${id}`}>返回大纲</Link></Button></section>;
  if (outline.isLoading || revisions.isLoading || binding.isLoading || revisionDetail.isLoading) return <p className="text-sm text-muted-foreground">正在读取所选大纲修订…</p>;
  if (outline.isError || revisions.isError || !revision) return <section className="space-y-3"><p role="alert" className="text-sm text-destructive">找不到这份大纲修订，请重新选择版本。</p><Button asChild variant="secondary"><Link to={`/outlines/${id}`}>返回大纲</Link></Button></section>;
  if (revisionDetail.isError || !revisionDocument) return <section className="space-y-3"><p role="alert" className="text-sm text-destructive">无法读取所选大纲内容，请返回工作台重试。</p><Button asChild variant="secondary"><Link to={`/outlines/${id}`}>返回大纲</Link></Button></section>;
  if (binding.isError) return <section className="space-y-3"><p role="alert" className="text-sm text-destructive">无法确认这份大纲是否已绑定小说，请返回工作台重试。</p><Button asChild variant="secondary"><Link to={`/outlines/${id}`}>返回大纲</Link></Button></section>;
  if (binding.data || outline.data?.boundNovelId) {
    const sourceRoute = binding.data?.sourceRoute ?? `/lab/director/${outline.data?.boundNovelId}`;
    return <main className="mx-auto max-w-3xl space-y-5"><Button asChild variant="ghost"><Link to={`/outlines/${id}`}>返回大纲</Link></Button><h1 className="text-2xl font-semibold">继续这本书</h1><p>{binding.data?.title ?? outline.data?.title} · 采用大纲修订 v{binding.data?.revisionVersion ?? "—"}</p><Button asChild><Link to={sourceRoute}>打开创作工作台</Link></Button></main>;
  }

  const canPreview = !!title.trim() && targetChapterCount > 0 && chapterWordCount > 0 && !!request;
  const previewMatches = preview.data?.revisionId === revision.id && preview.data?.currentVersion === currentVersion;
  const quotaTotal = Object.values(volumeQuotas).reduce((total, quota) => total + quota, 0);
  const chapterSettingsValid = targetChapterCount >= revisionDocument.chapters.length && targetChapterCount <= 2000 && chapterWordCount >= 500 && chapterWordCount <= 10000 && (!revisionDocument.volumes.length || (quotaTotal >= revisionDocument.chapters.length && quotaTotal <= targetChapterCount && (!quotaEdited || quotaTotal === targetChapterCount)));
  return <main className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">大纲 / {outline.data?.title} / 按大纲开书</p><h1 className="mt-1 text-2xl font-semibold">把这份大纲带入小说创作</h1><p className="mt-1 text-sm text-muted-foreground">来源：修订 v{revision.version}{revision.version !== currentVersion ? ` · 当前为 v${currentVersion}，本次仍只使用所选版本` : " · 只使用这一版"}；待采纳建议不包含在内。</p></div><Button asChild variant="ghost"><Link to={`/outlines/${id}`}>返回大纲</Link></Button></header>
    {revision.version !== currentVersion ? <p role="status" className="text-sm text-muted-foreground">当前已有新修订；确认后仍按 v{revision.version} 开书。</p> : null}
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="space-y-6">
        <div className="space-y-4"><h2 className="text-lg font-semibold">作品设置</h2><label className="block space-y-1.5"><span className="text-sm text-muted-foreground">书名</span><input className="h-10 w-full rounded-md border border-input bg-background px-3" value={title} onChange={event => setTitle(event.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5"><span className="block text-sm text-muted-foreground">目标章数</span><input aria-label="目标章数" className="h-10 w-full rounded-md border border-input bg-background px-3" type="number" min="1" max="2000" value={targetChapterCount} onChange={event => setTargetChapterCount(Number(event.target.value))} /></label><label className="space-y-1.5"><span className="block text-sm text-muted-foreground">每章约多少字</span><input aria-label="每章约多少字" className="h-10 w-full rounded-md border border-input bg-background px-3" type="number" min="500" max="10000" value={chapterWordCount} onChange={event => setChapterWordCount(Number(event.target.value))} /></label></div>{revisionDocument.volumes.length ? <section className="space-y-3 border-t border-border/50 pt-5"><h2 className="text-lg font-semibold">篇幅分配</h2>{revisionDocument.volumes.map(volume => <label key={volume.nodeId} className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 truncate">{volume.title || "未命名分卷"}</span><input aria-label={`${volume.title}预计章数`} className="h-9 w-24 rounded-md border border-input bg-background px-2 text-right" type="number" min={revisionDocument.chapters.filter(chapter => chapter.volumeNodeId === volume.nodeId).length} max={targetChapterCount} value={volumeQuotas[volume.nodeId] ?? 0} onChange={event => { setQuotaEdited(true); setVolumeQuotas(current => ({ ...current, [volume.nodeId]: Number(event.target.value) })); }} /></label>)}</section> : null}</div>
        <section className="space-y-3 border-t border-border/50 pt-5"><h2 className="text-lg font-semibold">保留什么</h2><p className="text-sm text-muted-foreground">默认保留已填写的大纲内容，并遵守不可违背的固定设定。</p><div><Button variant="ghost" onClick={() => setShowFixedFacts(value => !value)}>{showFixedFacts ? "收起固定设定明细" : "查看固定设定明细"}</Button>{showFixedFacts ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{revisionDocument.facts.filter(fact => fact.immutable).map(fact => <li key={fact.nodeId}>{fact.title}：{fact.content}</li>)}{!revisionDocument.facts.some(fact => fact.immutable) ? <li>这份大纲没有标记为不可违背的固定设定。</li> : null}</ul> : null}</div><Button variant="ghost" onClick={() => setShowDetails(value => !value)}>{showDetails ? "收起保留明细" : "展开保留明细"}</Button>{showDetails ? <div className="space-y-2 text-sm"><p>故事方向、已有卷章纲、人物草案与伏笔计划按所选修订保留。</p><p className="text-muted-foreground">本地未保存的修改和待采纳的 AI 建议不会进入这次开书。</p></div> : null}</section>
        <section className="space-y-3 border-t border-border/50 pt-5"><h2 className="text-lg font-semibold">补充什么</h2><p className="text-sm text-muted-foreground">远期保持卷纲，临近写作时再安排章节；不会在这一步生成正文。</p>{unsaved ? <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">工作台有未保存的修改。请先返回大纲保存，再按新修订开书。</p> : null}</section>
      </section>
      <aside className="space-y-4 border-t border-border/50 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><h2 className="text-lg font-semibold">本次交接</h2>{preview.data ? <><p>{preview.data.counts.volumes} 卷 · {preview.data.counts.chapters} 份已有章纲 · {preview.data.counts.characters} 位人物草案 · {preview.data.counts.payoffs} 条伏笔计划</p><div><h3 className="text-sm font-medium">保留</h3><ul className="mt-1 list-inside list-disc text-sm text-muted-foreground"><li>故事方向与已填写的卷章纲</li><li>人物草案与伏笔计划</li><li>{revisionDocument.facts.filter(fact => fact.immutable).length} 条不可违背的固定设定</li></ul></div><div><h3 className="text-sm font-medium">待补充</h3><p className="mt-1 text-sm text-muted-foreground">首卷节奏与执行安排、第 1 章任务和场景</p></div>{(preview.data.mapping.volumes as Array<{ nodeId?: string; title?: string; chapterCount?: number; chapterRange?: { from: number; to: number } }> | undefined)?.map((volume, index) => <p key={volume.nodeId ?? index} className="text-sm text-muted-foreground">{volume.title ?? "分卷"}：预计 {volume.chapterRange?.from ?? 1}–{volume.chapterRange?.to ?? volume.chapterCount ?? 1} 章</p>)}{preview.data.warnings.map((warning, index) => <p key={index} className="text-sm text-amber-700 dark:text-amber-300">{warning.message}</p>)}</> : <p className="text-sm text-muted-foreground">确认预览后查看将保留的内容与待补项。</p>}</aside>
    </div>
    {Array.isArray(preview.data?.errors) ? (preview.data.errors as Array<{ message: string; nodeId?: string; field?: string }>).map((item, index) => <p role="alert" key={index} className="text-sm text-destructive">{item.message}{item.nodeId ? `（节点 ${item.nodeId}${item.field ? ` · ${item.field}` : ""}）` : ""}</p>) : null}
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4"><p className="text-sm text-muted-foreground">创建后可查看并确认开写准备，不会自动调用模型或生成正文。</p><div className="flex gap-2"><Button variant="secondary" onClick={runPreview} disabled={!canPreview || !chapterSettingsValid || unsaved || preview.isPending}>{preview.isPending ? "正在检查…" : "检查开书内容"}</Button><Button onClick={() => create.mutate()} disabled={!previewMatches || (Array.isArray(preview.data?.errors) && preview.data.errors.length > 0) || unsaved || create.isPending}>{create.isPending ? "正在创建…" : "创建小说并查看准备"}</Button></div></footer>
  </main>;
}
