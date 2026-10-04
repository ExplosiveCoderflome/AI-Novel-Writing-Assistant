import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams, useLocation } from "react-router-dom";
import { getDirectorDetail, getDirectorSummary, getDirectorWorkspace, type DirectorDriver } from "@/api/directorNext";
import { getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import DirectorPanel from "@/components/directorNext/DirectorPanel";
import DirectorBadge from "@/components/directorNext/DirectorBadge";
import DirectorStart from "@/components/directorNext/DirectorStart";
import { ResizableWorkspace } from "@/components/layout/resizableWorkspace";
import { previewStates, previewTimeline, previewView } from "./preview";
import { NovelWorkspace, previewBook, resolveSavedReview } from "./workspace";

export default function DirectorNovelPage({ previewOnly = false }: { previewOnly?: boolean }) {
  const { novelId: routeNovelId = "" } = useParams();
  const novelId = previewOnly ? "preview" : routeNovelId;
  const [params, setParams] = useSearchParams();
  const location=useLocation();
  const preview = novelId === "preview";
  useEffect(()=>{
    const type=params.get("review");
    if (!preview && type && [...params.keys()].some(key=>key!=="review")) setParams({review:type},{replace:true});
  },[params,preview,setParams]);
  const [directorOpen, setDirectorOpen] = useState(true);
  const summaryQuery = useQuery({ queryKey: queryKeys.directorNext.summary(novelId), queryFn: () => getDirectorSummary(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 4000 });
  const detailQuery = useQuery({ queryKey: queryKeys.directorNext.detail(novelId), queryFn: () => getDirectorDetail(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 4000 });
  const bookQuery = useQuery({ queryKey: ["directorBookWorkspace",novelId], queryFn: () => getDirectorWorkspace(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 10000 });
  const book = preview ? previewBook : bookQuery.data?.data;
  const savedReview=book ? resolveSavedReview(book,params) : null;
  const detail = detailQuery.data?.data;
  const novelQuery = useQuery({queryKey: ["directorNovelMetadata",novelId],queryFn:()=>getNovelDetail(novelId),enabled:!preview && !!novelId,retry:false});
  const view = preview ? previewView(params.get("state") ?? "running") : detail?.view ?? summaryQuery.data?.data;
  const error = detailQuery.error ?? summaryQuery.error;
  const metadata = novelQuery.data?.data;
  const startForm = !preview && book && metadata ? (range: {from:number;to:number}|null, driver: DirectorDriver = "assisted") => <DirectorStart key={`${view?.runId ?? novelId}:${range?.from ?? "planning"}`} novelId={novelId} estimatedChapterCount={book.novel.estimatedChapterCount} nextChapter={Math.max(0,...book.chapters.filter(chapter=>chapter.content?.trim()).map(chapter=>chapter.order))+1} initialStory={metadata.description ?? ""} worldId={metadata.worldId} suggestedRange={range} initialDriver={driver}/> : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-3">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/60 pb-2">
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-4 gap-y-2 lg:basis-auto">
          <h1 title={book?.novel.title} className="min-w-0 truncate text-lg font-semibold">{book?.novel.title ?? "小说创作"}</h1>
          {!error && view ? <DirectorBadge view={view} novelId={novelId} modeOnly/> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 [&_button]:h-8 [&_a]:h-8">
          {!previewOnly ? <Button asChild variant="ghost"><Link to="/novels">返回书架</Link></Button> : null}
          <Button variant="ghost" aria-expanded={directorOpen} onClick={() => setDirectorOpen(open => !open)}>{directorOpen ? "收起导演台" : "显示导演台"}</Button>
          {params.has("review") ? <Button asChild variant="ghost"><Link to={`/lab/director/${encodeURIComponent(novelId)}`}>返回本书</Link></Button> : null}
          {!previewOnly ? <Button asChild variant="ghost"><Link to="/lab/director">运行记录</Link></Button> : null}
        </div>
      </header>
      {preview ? <details className="rounded-md bg-muted/30 px-4 py-3"><summary className="cursor-pointer text-xs text-muted-foreground">示例预览 · 切换导演状态</summary><p className="mt-3 text-xs text-muted-foreground">本页使用示例内容，创作命令禁用。</p><div className="mt-3 flex flex-wrap gap-2">{previewStates.map((state) => <Button key={state.id} size="sm" variant={(params.get("state") ?? "running") === state.id ? "default" : "ghost"} onClick={() => setParams({ state: state.id })}>{state.label}</Button>)}</div></details> : null}
      <ResizableWorkspace id="director-novel-layout" label="调整正文与导演台宽度" defaultLeft={76} minLeft={580} minRight={280} breakpoint={920} left={<div className="min-w-0">
          {!preview && bookQuery.isError ? <div role="alert" className="mb-4 space-y-2 rounded-md bg-destructive/5 p-4"><p className="text-sm text-destructive">本书内容读取失败。{book ? "你仍可查看上次读取的内容。" : ""}</p><Button variant="outline" size="sm" onClick={() => void bookQuery.refetch()}>重新读取本书</Button></div> : null}
          {book ? <NovelWorkspace key={novelId} book={book} preview={preview} review={params} onLeaveReview={()=>setParams({})} /> : <p className="py-12 text-sm text-muted-foreground">{bookQuery.isLoading ? "正在读取本书内容…" : "暂无可展示的内容。"}</p>}
        </div>} right={directorOpen ? <aside aria-label="导演台" className="min-w-0">
          {!preview && error ? <div role="alert" className="space-y-3 py-4"><p className="text-sm text-destructive">{error instanceof Error ? error.message : "导演信息读取失败。"}</p><Button variant="outline" onClick={() => void Promise.all([summaryQuery.refetch(), detailQuery.refetch()])}>重新读取</Button></div>
            : view ? <DirectorPanel view={view} novelId={novelId} timeline={preview ? previewTimeline : detail?.timeline} preview={preview} startForm={startForm} reviewTarget={savedReview ? location.pathname+location.search : undefined} reviewReady={Boolean(savedReview?.ready) && !bookQuery.isError} reviewRunId={savedReview?.runId} reviewVersion={savedReview?.controlVersion}/>
              : <p className="py-4 text-sm text-muted-foreground">{summaryQuery.isLoading || detailQuery.isLoading ? "正在读取导演信息…" : "选择创作范围，让 AI 从本书内容继续。"}</p>}
          {!error && !view ? startForm?.(null):null}
        </aside> : null}/>
    </div>
  );
}
