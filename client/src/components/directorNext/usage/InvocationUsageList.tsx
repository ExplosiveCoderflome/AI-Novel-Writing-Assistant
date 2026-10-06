import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getDirectorUsage } from "@/api/directorNext";
import { formatCacheTokens } from "@/components/liveExecution/usage/presentation";
import { Button } from "@/components/ui/button";
export function InvocationUsageList({ runId, active = false }: {
    runId: string;
    active?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const query = useInfiniteQuery({ queryKey: ["directorInvocationUsage", runId], initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) => getDirectorUsage(runId, { cursor: pageParam }), getNextPageParam: last => last.data?.nextCursor ?? undefined,
        enabled: open, retry: false, refetchInterval: open && active ? 5000 : false });
    const summary = query.data?.pages[0]?.data?.recordedSummary;
    const items = query.data?.pages.flatMap(p => p.data?.items ?? []) ?? [];
    return <section className="border-t border-border/60 py-4">
 <button type="button" className="text-sm font-semibold" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? "▾" : "▸"} 调用用量</button>
 {open ? <div className="mt-3 space-y-3 text-xs">
 {query.isPending ? <p className="text-muted-foreground">正在读取调用用量…</p> : query.isError ? <p className="text-muted-foreground">调用用量暂不可读取。<button className="ml-2 underline" onClick={() => void query.refetch()}>重新读取</button></p> : <>
 {summary ? <><p>缓存命中 Tokens {formatCacheTokens(summary.inputCache.cacheHitTokens, "completed", summary.inputCache.cacheUsageStatus)}</p>
 <p>缓存未命中 Tokens {formatCacheTokens(summary.inputCache.cacheMissTokens, "completed", summary.inputCache.cacheUsageStatus)}</p>
 <p className="text-muted-foreground">已记录 {summary.recordedCallCount} 次调用{summary.unknownCallCount + summary.invalidCallCount + summary.partialCallCount > 0 ? "，部分调用未提供完整统计。" : "。"}历史调用未记录缓存用量。</p></> : null}
 {!items.length ? <p className="text-muted-foreground">本次创作没有调用用量记录。</p> : <ul className="divide-y divide-border/50">{items.map(item => <li key={item.invocationId} className="space-y-1 py-3">
 <p>{new Date(item.startedAt).toLocaleString()} · {item.stage ?? "创作"}</p>
 <p className="break-words text-muted-foreground">{item.provider ?? "厂商未记录"} · {item.model ?? "模型未记录"} · {item.status === "completed" ? "调用完成" : item.status === "partial" ? "部分返回" : "调用失败"}</p>
 <p>缓存命中 Tokens {formatCacheTokens(item.inputCache.cacheHitTokens, "completed", item.inputCache.cacheUsageStatus)}</p>
 <p>缓存未命中 Tokens {formatCacheTokens(item.inputCache.cacheMissTokens, "completed", item.inputCache.cacheUsageStatus)}</p>
 </li>)}</ul>}
 {query.hasNextPage ? <Button variant="ghost" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>查看更多调用</Button> : null}
 </>}
 </div> : null}</section>;
}
