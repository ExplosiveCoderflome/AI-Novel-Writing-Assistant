import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getDirectorDetail, getDirectorSummary } from "@/api/directorNext";
import { getSimpleCreationShelf } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import DirectorPanel from "@/components/directorNext/DirectorPanel";
import { previewStates, previewTimeline, previewView } from "./preview";
import { NovelWorkspace, previewBook } from "./workspace";

export default function DirectorNovelPage({ previewOnly = false }: { previewOnly?: boolean }) {
  const { novelId: routeNovelId = "" } = useParams();
  const novelId = previewOnly ? "preview" : routeNovelId;
  const [params, setParams] = useSearchParams();
  const preview = novelId === "preview";
  const [directorOpen, setDirectorOpen] = useState(true);
  const summaryQuery = useQuery({ queryKey: queryKeys.directorNext.summary(novelId), queryFn: () => getDirectorSummary(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 4000 });
  const detailQuery = useQuery({ queryKey: queryKeys.directorNext.detail(novelId), queryFn: () => getDirectorDetail(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 4000 });
  const bookQuery = useQuery({ queryKey: queryKeys.novels.simpleShelf(novelId), queryFn: () => getSimpleCreationShelf(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 10000 });
  const book = preview ? previewBook : bookQuery.data?.data;
  const detail = detailQuery.data?.data;
  const view = preview ? previewView(params.get("state") ?? "running") : detail?.view ?? summaryQuery.data?.data;
  const error = detailQuery.error ?? summaryQuery.error;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div><p className="text-xs text-muted-foreground">小说工作台</p><h1 className="mt-1 text-2xl font-semibold">{book?.novel.title ?? "小说创作"}</h1><p className="mt-2 text-xs text-muted-foreground">阅读正文，查看设定，跟随角色的故事变化。</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" aria-expanded={directorOpen} onClick={() => setDirectorOpen(open => !open)}>{directorOpen ? "收起导演台" : "显示导演台"}</Button>
          {!preview ? <Button asChild variant="ghost"><Link to={`/novels/${encodeURIComponent(novelId)}/edit`}>编辑本书</Link></Button> : null}
          {!previewOnly ? <Button asChild variant="ghost"><Link to="/lab/director">运行记录</Link></Button> : null}
        </div>
      </header>
      {preview ? <details className="rounded-md bg-muted/30 px-4 py-3"><summary className="cursor-pointer text-xs text-muted-foreground">示例预览 · 切换导演状态</summary><p className="mt-3 text-xs text-muted-foreground">本页使用示例内容，创作命令禁用。</p><div className="mt-3 flex flex-wrap gap-2">{previewStates.map((state) => <Button key={state.id} size="sm" variant={(params.get("state") ?? "running") === state.id ? "default" : "ghost"} onClick={() => setParams({ state: state.id })}>{state.label}</Button>)}</div></details> : null}
      <div className={`grid gap-6 ${directorOpen ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}>
        <div className="min-w-0">
          {!preview && bookQuery.isError ? <div role="alert" className="mb-4 space-y-2 rounded-md bg-destructive/5 p-4"><p className="text-sm text-destructive">本书内容读取失败。{book ? "你仍可查看上次读取的内容。" : ""}</p><Button variant="outline" size="sm" onClick={() => void bookQuery.refetch()}>重新读取本书</Button></div> : null}
          {book ? <NovelWorkspace key={novelId} book={book} preview={preview} /> : <p className="py-12 text-sm text-muted-foreground">{bookQuery.isLoading ? "正在读取本书内容…" : "暂无可展示的内容。"}</p>}
        </div>
        {directorOpen ? <aside aria-label="导演台" className="min-w-0 border-t border-border/50 pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          {!preview && error ? <div role="alert" className="space-y-3 py-4"><p className="text-sm text-destructive">{error instanceof Error ? error.message : "导演信息读取失败。"}</p><Button variant="outline" onClick={() => void Promise.all([summaryQuery.refetch(), detailQuery.refetch()])}>重新读取</Button></div>
            : view ? <DirectorPanel view={view} novelId={novelId} timeline={preview ? previewTimeline : detail?.timeline} preview={preview} />
              : <p className="py-4 text-sm text-muted-foreground">{summaryQuery.isLoading || detailQuery.isLoading ? "正在读取导演信息…" : "这本小说没有新导演创作记录。"}</p>}
        </aside> : null}
      </div>
    </div>
  );
}
