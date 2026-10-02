import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getDirectorDetail, getDirectorSummary } from "@/api/directorNext";
import { getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import DirectorPanel from "@/components/directorNext/DirectorPanel";
import { previewStates, previewTimeline, previewView } from "./preview";

export default function DirectorNovelPage({ previewOnly = false }: { previewOnly?: boolean }) {
  const { novelId: routeNovelId = "" } = useParams();
  const novelId = previewOnly ? "preview" : routeNovelId;
  const [params, setParams] = useSearchParams();
  const preview = novelId === "preview";
  const summaryQuery = useQuery({ queryKey: queryKeys.directorNext.summary(novelId), queryFn: () => getDirectorSummary(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 4000 });
  const detailQuery = useQuery({ queryKey: queryKeys.directorNext.detail(novelId), queryFn: () => getDirectorDetail(novelId), enabled: !preview && !!novelId, retry: false, refetchInterval: 4000 });
  const novelQuery = useQuery({ queryKey: queryKeys.novels.detail(novelId), queryFn: () => getNovelDetail(novelId), enabled: !preview && !!novelId });
  const detail = detailQuery.data?.data;
  const view = preview ? previewView(params.get("state") ?? "running") : detail?.view ?? summaryQuery.data?.data;
  const error = detailQuery.error ?? summaryQuery.error;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div><p className="text-xs text-muted-foreground">小说导演台</p><h1 className="mt-1 text-2xl font-semibold">{preview ? "移动之城 · 状态预览" : novelQuery.data?.data?.title ?? "小说创作"}</h1></div>
        {!previewOnly ? <Button asChild variant="ghost"><Link to="/lab/director">查看运行记录</Link></Button> : null}
      </header>
      {preview ? <div className="space-y-3 rounded-md bg-muted/40 p-4"><p className="text-sm">状态预览使用示例数据，创作命令禁用，不会生成或修改小说。</p><div className="flex flex-wrap gap-2">{previewStates.map((state) => <Button key={state.id} size="sm" variant={params.get("state") === state.id ? "default" : "ghost"} onClick={() => setParams({ state: state.id })}>{state.label}</Button>)}</div></div> : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <section className="space-y-6 py-4">
          <h2 className="text-lg font-semibold">创作上下文</h2>
          {novelQuery.isError ? <p role="alert" className="text-sm text-destructive">小说内容读取失败。<Button variant="ghost" size="sm" onClick={() => void novelQuery.refetch()}>重新读取</Button></p> : null}
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">{preview ? "守门人醒来后失去了记忆。为了守护一座会移动的城，他必须辨认每次靠近城门的人，也逐渐发现这座城与自己过去的联系。" : novelQuery.data?.data?.description || "查看本书的规划、角色和章节内容，再结合导演台提示决定下一步。"}</p>
          {!preview ? <Button asChild><Link to={`/novels/${encodeURIComponent(novelId)}/edit`}>打开小说工作区</Link></Button> : null}
          <p className="text-xs leading-6 text-muted-foreground">导演台展示当前授权范围的推进情况。整本小说的内容与规划以小说工作区保存的结果为准。</p>
        </section>
        <div className="min-w-0 lg:border-l lg:border-border/60 lg:pl-6">
          {!preview && error ? <div role="alert" className="space-y-3 py-4"><p className="text-sm text-destructive">{error instanceof Error ? error.message : "导演信息读取失败。"}</p><Button variant="outline" onClick={() => void Promise.all([summaryQuery.refetch(), detailQuery.refetch()])}>重新读取</Button></div>
            : view ? <DirectorPanel view={view} novelId={novelId} timeline={preview ? previewTimeline : detail?.timeline} preview={preview} />
              : <p className="py-4 text-sm text-muted-foreground">{summaryQuery.isLoading || detailQuery.isLoading ? "正在读取导演信息…" : "这本小说没有新导演创作记录。"}</p>}
        </div>
      </div>
    </div>
  );
}
