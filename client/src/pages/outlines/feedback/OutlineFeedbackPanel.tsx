import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineBookBindingView } from "@ai-novel/shared/types/outlineOpenBook";
import { analyzeOutlineFeedback, getOutlineFeedback } from "@/api/outlineFeedback";
import { Button } from "@/components/ui/button";
import { findOutlineNodeTitle, outlineFieldLabels } from "../outlineNodes";
import { FeedbackSettings } from "./FeedbackSettings";
import { FeedbackRun } from "./FeedbackRun";

export function OutlineFeedbackPanel({ binding, document, unsaved }: { binding: OutlineBookBindingView; document: OutlineDocument; unsaved: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["outline-feedback", binding.projectId], queryFn: () => getOutlineFeedback(binding.projectId), retry: false, refetchInterval: q => q.state.data?.runs.some(run => run.status === "pending" || run.status === "running") ? 4000 : false });
  const [chapterId, setChapterId] = useState("");
  const analyze = useMutation({ mutationFn: () => analyzeOutlineFeedback(binding.projectId, chapterId), onSuccess: () => client.invalidateQueries({ queryKey: ["outline-feedback", binding.projectId] }) });
  const protectedRules = binding.policy.rules.filter(rule => ["preserve", "hard_constraint"].includes(rule.mode));
  return <section aria-label="正文反馈回大纲" className="space-y-4">
    <div><h2 className="text-lg font-semibold">正文反馈回大纲</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">先检查章节摘要与逐项差异，采纳的建议才会进入下一版工作大纲。</p><Button asChild variant="ghost" size="sm"><Link to={binding.sourceRoute}>返回《{binding.title}》继续写作</Link></Button></div>
    {unsaved ? <p role="status" className="text-xs">请先保存大纲修改，再采纳或重新分析。</p> : null}
    {query.isLoading ? <p role="status" className="text-sm">正在读取正文反馈…</p> : null}
    {query.isError ? <div role="alert" className="space-y-2 text-sm"><p>正文反馈读取失败。{query.error.message}</p><Button variant="secondary" size="sm" onClick={() => void query.refetch()}>重新读取反馈</Button></div> : null}
    {query.data ? <>
      <FeedbackSettings key={JSON.stringify(query.data.settings)} projectId={binding.projectId} settings={query.data.settings}/>
      <details><summary className="cursor-pointer text-xs">保留与固定字段受保护 · {protectedRules.length} 项</summary><ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs leading-6">{protectedRules.map(rule => <li key={`${rule.nodeId}:${rule.field}`}>{findOutlineNodeTitle(document, rule.nodeId)} · {outlineFieldLabels[rule.field] ?? "固定字段"} · {rule.mode === "hard_constraint" ? "固定" : "保留"}</li>)}</ul></details>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (chapterId) analyze.mutate(); }}><label className="block space-y-1 text-sm"><span>按已保存摘要手动分析</span><select className="h-9 w-full rounded-md border border-input bg-background px-2" value={chapterId} onChange={event => setChapterId(event.target.value)}><option value="">选择来源章节</option>{binding.mapping.chapters.map(chapter => <option key={chapter.chapterId} value={chapter.chapterId}>第 {chapter.chapterOrder} 章 · {findOutlineNodeTitle(document, chapter.nodeId)}</option>)}</select></label><p className="text-xs text-muted-foreground">请选已完成且保存摘要的章节；分析仅使用摘要。</p><Button variant="secondary" size="sm" type="submit" disabled={!chapterId || analyze.isPending || unsaved}>{analyze.isPending ? "提交中…" : "分析本章摘要"}</Button>{analyze.isError ? <p role="alert" className="text-sm text-destructive">{analyze.error.message}</p> : null}</form>
      {!query.data.runs.length ? <p className="py-4 text-sm text-muted-foreground">暂无正文反馈。完成章节并保存摘要后，可在这里检查大纲调整建议。</p> : null}
      {query.data.runs.map(run => <FeedbackRun key={run.id} run={run} binding={binding} document={document} unsaved={unsaved}/>)}
    </> : null}
  </section>;
}
