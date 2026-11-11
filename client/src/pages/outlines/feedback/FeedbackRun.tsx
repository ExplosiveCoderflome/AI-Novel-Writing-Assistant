import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBookBindingView } from "@ai-novel/shared/types/outlineOpenBook";
import type { OutlineFeedbackRunView } from "@ai-novel/shared/types/outlineFeedback";
import { analyzeOutlineFeedback, decideOutlineFeedback, retryOutlineFeedback } from "@/api/outlineFeedback";
import { Button } from "@/components/ui/button";
import { findOutlineNodeTitle, outlineFieldLabels } from "../outlineNodes";
import { feedbackItemProtected, selectedFeedbackIds } from "./feedbackModel";

const statusLabels = { pending: "等待分析", running: "正在分析", completed: "分析完成", failed: "分析失败" };
const itemLabels = { pending: "待确认", adopted: "已采纳", rejected: "已拒绝" };
export function FeedbackRun({ run, binding, document, unsaved }: { run: OutlineFeedbackRunView; binding: OutlineBookBindingView; document: OutlineDocument; unsaved: boolean }) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const ids = selectedFeedbackIds(run, selected);
  const refresh = async () => {
    await Promise.all([["outline-feedback", binding.projectId], ["outline", binding.projectId], ["outline-revisions", binding.projectId], ["outline-book-binding", binding.projectId], ["directorBookWorkspace", binding.novelId]].map(queryKey => client.invalidateQueries({ queryKey })));
  };
  const decision = useMutation({ mutationFn: (kind: "adopt" | "reject") => decideOutlineFeedback(binding.projectId, run.id, ids, kind), onSuccess: async (_, kind) => { setSelected([]); if (kind === "adopt") await refresh(); else await client.invalidateQueries({ queryKey: ["outline-feedback", binding.projectId] }); }, onError: (error: unknown) => { if ((error as { response?: { status?: number } }).response?.status === 409) setConflict(true); } });
  const refreshFeedback = () => client.invalidateQueries({ queryKey: ["outline-feedback", binding.projectId] });
  const retry = useMutation({ mutationFn: () => retryOutlineFeedback(binding.projectId, run.id), onSuccess: refreshFeedback });
  const reanalyze = useMutation({ mutationFn: () => analyzeOutlineFeedback(binding.projectId, run.chapterId), onSuccess: refreshFeedback });
  const stale = run.stale || conflict;
  const protectedSelection = run.items.some(item => ids.includes(item.operationId) && feedbackItemProtected(binding, item, run.chapterOrder));
  const error = decision.error ?? retry.error ?? reanalyze.error;
  return <section className="space-y-3 border-b border-border/50 pb-5" aria-label={`第 ${run.chapterOrder} 章正文反馈`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">第 {run.chapterOrder} 章 · {statusLabels[run.status]}</h3><time className="text-xs text-muted-foreground" dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time></div>
    <div className="bg-muted/30 px-3 py-2"><p className="text-xs font-medium">来源摘要 · 分析时保存的内容</p><p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{run.sourceSummary || "暂无来源摘要"}</p></div>
    {run.status === "pending" || run.status === "running" ? <p role="status" className="text-xs leading-6 text-muted-foreground">反馈在后台分析，可返回本书继续下一章。</p> : null}
    {run.error ? <p role="alert" className="text-sm text-destructive">{run.error}</p> : null}
    {run.canRetry ? <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>{retry.isPending ? "提交中…" : "重试分析"}</Button> : null}
    {stale && run.items.some(item => item.status === "pending") ? <div role="alert" className="space-y-2 text-sm"><p>来源摘要、大纲或章节规划有变化。这份建议需重新分析后再采纳。</p><Button size="sm" variant="secondary" disabled={reanalyze.isPending || unsaved} onClick={() => reanalyze.mutate()}>{reanalyze.isPending ? "提交中…" : "按本章摘要重新分析"}</Button></div> : null}
    {run.status === "completed" && !run.items.length ? <p className="text-sm text-muted-foreground">本章暂无需要调整的大纲建议。</p> : null}
    <div className="space-y-4">{run.items.map(item => {
      const locked = feedbackItemProtected(binding, item, run.chapterOrder);
      const before = run.sourceNodes?.find(node => node.nodeId === item.nodeId)?.fields;
      return <article key={item.operationId} className="space-y-2 border-t border-border/40 pt-3" aria-label={`${findOutlineNodeTitle(document, item.nodeId)}反馈建议`}>
        <label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={ids.includes(item.operationId)} disabled={item.status !== "pending" || decision.isPending} onChange={event => setSelected(current => event.target.checked ? [...current, item.operationId] : current.filter(id => id !== item.operationId))}/><span>{findOutlineNodeTitle(document, item.nodeId)} · {itemLabels[item.status]}</span></label>
        <p className="text-xs leading-6 text-muted-foreground">{item.reason}</p>
        {binding.mapping.chapters.some(chapter => chapter.nodeId === item.nodeId) ? <p className="text-xs">后续章节任务调整提议 · 采纳后供下一次章节准备使用</p> : null}
        {locked ? <p className="flex items-center gap-1 text-xs"><LockKeyhole className="h-3 w-3"/>保留或固定字段受保护，不能采纳此项。</p> : null}
        {Object.entries(item.fields).map(([field, after]) => <div key={field}><p className="text-xs font-medium">{outlineFieldLabels[field] ?? "大纲字段"}</p><dl className="outline-comparison mt-1 text-sm leading-6"><div className="bg-muted/30 p-2"><dt className="text-xs text-muted-foreground">− 调整前</dt><dd className="whitespace-pre-wrap break-words">{before?.[field] || "无"}</dd></div><div className="bg-muted/30 p-2"><dt className="text-xs text-muted-foreground">＋ 建议调整后</dt><dd className="whitespace-pre-wrap break-words">{after || "无"}</dd></div></dl></div>)}
        {item.status === "adopted" && item.revisionId ? <Button asChild variant="ghost" size="sm"><Link to={`/outlines/${binding.projectId}?revisionId=${encodeURIComponent(item.revisionId)}`}>查看采纳修订 v{item.revisionVersion}</Link></Button> : null}
      </article>;
    })}</div>
    {run.items.some(item => item.status === "pending") ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs">已选 {ids.length} 项</span><Button size="sm" disabled={!ids.length || decision.isPending || !!stale || unsaved || protectedSelection} onClick={() => decision.mutate("adopt")}>{decision.isPending && decision.variables === "adopt" ? "采纳中…" : "采纳所选"}</Button><Button size="sm" variant="secondary" disabled={!ids.length || decision.isPending} onClick={() => decision.mutate("reject")}>拒绝所选</Button></div> : null}
    {decision.isError || retry.isError || reanalyze.isError ? <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "操作失败，请重试。"}</p> : null}
  </section>;
}
