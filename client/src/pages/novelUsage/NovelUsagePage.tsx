import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getNovelUsage } from "@/api/novel";
import { Button } from "@/components/ui/button";
import { UsageOverview } from "./components/UsageOverview";
import { UsageLogTable } from "./components/UsageLogTable";
import { formatUsageTokens, usageFiltersFromParams, usageStageLabel, usageStatusLabel } from "./presentation";

export default function NovelUsagePage() {
  const { id: novelId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const filters = usageFiltersFromParams(params);
  const queryClient = useQueryClient();
  const queryKey = ["novelInvocationUsage", novelId, filters];
  const query = useInfiniteQuery({
    queryKey, initialPageParam: undefined as string | undefined,
    queryFn: ({pageParam}) => getNovelUsage(novelId, {...filters, cursor: pageParam, limit: 30}),
    getNextPageParam: last => last.data?.nextCursor ?? undefined, enabled: Boolean(novelId), retry: false,
    refetchInterval: q => autoRefresh && (q.state.data?.pages.length ?? 0) <= 1 ? 15000 : false,
  });
  const data = query.data?.pages[0]?.data;
  const items = query.data?.pages.flatMap(page => page.data?.items ?? []) ?? [];
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, {replace: true});
  };
  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
      <div><h1 className="text-2xl font-semibold">AI 用量与调用日志</h1><p className="mt-2 text-sm text-muted-foreground">{data?.novel.title ?? "本书"} · 查看各次创作的输入、输出与缓存用量。</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="ghost"><Link to={`/lab/director/${encodeURIComponent(novelId)}`}>返回小说导演台</Link></Button><Button asChild variant="ghost"><Link to="/novels">返回书架</Link></Button></div>
    </header>
    {query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{query.error instanceof Error ? query.error.message : "本书 AI 用量读取失败。"}</p><Button size="sm" variant="outline" onClick={() => void query.refetch()}>重新读取</Button>{Object.keys(filters).length ? <Button size="sm" variant="ghost" onClick={() => setParams({}, {replace: true})}>清除筛选</Button> : null}</div> : null}
    {query.isPending ? <p className="py-10 text-sm text-muted-foreground">正在读取本书 AI 用量…</p> : data ? <>
      <UsageOverview data={data} />
      <section aria-label="调用日志" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">调用日志</h2><div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />自动刷新</label>
          <Button size="sm" variant="ghost" disabled={query.isFetching} onClick={() => void queryClient.resetQueries({queryKey, exact: true})}>刷新日志</Button>
        </div></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Filter label="章节" value={filters.chapterId} onChange={value => setFilter("chapterId", value)} options={data.facets.chapters.map(ch => ({value: ch.id, label: `第 ${ch.order} 章 · ${ch.title}`}))} />
          <Filter label="创作步骤" value={filters.stage} onChange={value => setFilter("stage", value)} options={data.facets.stages.map(stage => ({value: stage, label: usageStageLabel(stage)}))} />
          <Filter label="厂商" value={filters.provider} onChange={value => setFilter("provider", value)} options={data.facets.providers.map(provider => ({value: provider, label: provider}))} />
          <Filter label="模型" value={filters.model} onChange={value => setFilter("model", value)} options={data.facets.models.map(model => ({value: model, label: model}))} />
          <Filter label="调用状态" value={filters.status} onChange={value => setFilter("status", value)} options={["completed", "partial", "failed"].map(status => ({value: status, label: usageStatusLabel(status)}))} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><p>当前筛选 {data.filteredSummary.recordedCallCount.toLocaleString()} 次调用 · 已报告 {formatUsageTokens(data.filteredSummary.totalTokens)} Tokens</p>{Object.keys(filters).length ? <Button size="sm" variant="ghost" onClick={() => setParams({}, {replace: true})}>清除筛选</Button> : null}</div>
        <UsageLogTable items={items} />
        {query.hasNextPage ? <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "正在读取…" : "查看更多调用"}</Button> : null}
        {autoRefresh ? <p className="text-xs text-muted-foreground">最新记录每 15 秒刷新；展开历史分页后，点击“刷新日志”返回最新记录。</p> : null}
      </section>
    </> : null}
  </div>;
}

function Filter({label, value, options, onChange}: {label: string; value?: string; options: {value: string; label: string}[]; onChange: (value: string) => void}) {
  return <label className="min-w-0 space-y-1 text-xs text-muted-foreground"><span>{label}</span><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" value={value ?? ""} onChange={event => onChange(event.target.value)}><option value="">全部{label}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
