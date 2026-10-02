import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listDirectorRuns, listLegacyDirectorRuns } from "@/api/directorNext";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";

export default function DirectorRunHistoryPage() {
  const [needsAttention, setNeedsAttention] = useState(false);
  const query = useQuery({ queryKey: queryKeys.directorNext.runs(needsAttention), queryFn: () => listDirectorRuns({ needsAttention, limit: 50 }), retry: false, refetchInterval: 4000 });
  const legacy = useQuery({queryKey:["legacyDirectorHistory"],queryFn:listLegacyDirectorRuns,retry:false});
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap justify-between gap-4 border-b border-border/60 pb-5">
        <div><h1 className="text-2xl font-semibold">导演运行记录</h1><p className="mt-2 text-sm text-muted-foreground">查看创作进度和异常，打开对应小说导演台处理下一步。</p></div>
        <Button asChild variant="outline"><Link to="/lab/director/preview">查看状态预览</Link></Button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needsAttention} onChange={(event) => setNeedsAttention(event.target.checked)} />只看需要处理</label>
        <Button variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>刷新记录</Button>
      </div>
      {query.isLoading ? <p className="text-sm text-muted-foreground">正在读取运行记录…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "读取失败，请重新读取。"}</p> : !query.data?.data?.length ? <p className="py-8 text-sm text-muted-foreground">没有符合条件的创作记录。</p> : (
        <ul className="divide-y divide-border/60">{query.data.data.map((record) => <li key={record.runId} className="flex flex-wrap items-start justify-between gap-4 py-5"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{record.statusLabel} · {record.progressLabel}</p><p className="mt-1 text-sm font-medium">{record.headline}</p>{record.detail ? <p className="mt-2 text-sm text-muted-foreground">{record.detail}</p> : null}</div><Button asChild variant="ghost" size="sm"><Link to={record.directorRoute}>打开小说导演台</Link></Button></li>)}</ul>
      )}
      {!needsAttention && legacy.data?.data?.length ? <section className="border-t border-border/60 pt-5"><h2 className="text-sm font-semibold">历史创作</h2><ul className="divide-y divide-border/50">{legacy.data.data.map(record=><li key={record.runId} className="flex items-center justify-between gap-3 py-4"><div><p className="text-xs text-muted-foreground">{record.statusLabel} · {record.progressLabel}</p><p className="mt-1 text-sm">{record.headline}</p></div><Button asChild variant="ghost" size="sm"><Link to={record.sourceRoute}>打开小说</Link></Button></li>)}</ul></section>:null}
    </div>
  );
}
