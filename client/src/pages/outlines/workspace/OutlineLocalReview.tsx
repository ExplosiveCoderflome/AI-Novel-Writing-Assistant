import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import { AgentThinking } from "@/components/agentConversation/AgentThinking";
import { useAgentReplyPreview } from "@/components/agentConversation/useAgentReplyPreview";
import { outlineReviewThread, type LocalTarget } from "./outlineReviewThread";

export type LocalReviewDraft = { text: string; priorId?: string };
interface Props {
  projectId: string; target: LocalTarget; title: string; version: number;
  expanded: boolean; disabled: boolean; draft: LocalReviewDraft;
  onExpand: () => void; onChange: (draft: LocalReviewDraft) => void;
  onSend: (text: string, priorId?: string) => void; onOpen: (id: string) => void;
}
const statusLabels: Record<string, string> = { pending: "待采纳", applied: "已采纳", partially_applied: "部分采纳", rejected: "已放弃", superseded: "已有后续建议", stale: "旧建议" };

export function OutlineLocalReview({ projectId, target, title, version, expanded, disabled, draft, onExpand, onChange, onSend, onOpen }: Props) {
  const thread = outlineReviewThread(projectId, target);
  const history = useQuery({ queryKey: thread.queryKey, queryFn: thread.load,
    refetchInterval: query => query.state.data?.some(turn => turn.status === "running") ? 1500 : false });
  const turns = history.data ?? [];
  const latest = turns.at(-1);
  const running = turns.find(turn => turn.status === "running");
  const live = useAgentReplyPreview(running && thread.streamUrl(running.id), running?.id, history.refetch);
  const stop = useMutation({ mutationFn: thread.interrupt, onSettled: () => history.refetch() });
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!expanded || !input.current) return;
    const body = input.current.closest<HTMLElement>(".outline-reading-body");
    if (body) body.scrollTop = 0;
    input.current.focus();
  }, [expanded]);
  const prior = turns.find(turn => turn.result && turn.result.id === draft.priorId);
  const person = target.kind === "character";
  return <section className="outline-local-review" aria-label={person ? "人物局部修改" : "章节局部修改"}>
    {expanded && <form id="outline-local-form" className="outline-review-followup" onSubmit={event => {
      event.preventDefault();
      if (draft.text.trim() && !disabled && !running && history.isSuccess) onSend(draft.text.trim(), draft.priorId);
    }}>
      <label>{person ? `希望怎样修改${title}？` : `希望怎样调整「${title}」？`}
        <textarea ref={input} rows={3} maxLength={6000} value={draft.text} onChange={e => onChange({...draft, text:e.target.value})}
          placeholder={person ? `例如，丰富一下${title}的目标和动机。` : "例如，让本章的冲突更明确，保留结尾的悬念。"} /></label>
      {prior && <p className="outline-local-note">沿用建议「{prior.requestText}」 <button type="button" className="underline" onClick={() => onChange({text:draft.text})}>取消引用</button></p>}
      <p className="outline-local-note">{person ? "会一起核对出场卷章与伏笔。" : "只拟定本章的修改。"}先看建议，确认后保存为新版本。</p>
      <div className="outline-reading-actions"><Button disabled={disabled || !!running || !history.isSuccess || !draft.text.trim()}>生成修改建议</Button></div>
    </form>}
    {running && <div role="status" className="outline-local-reply"><p>{live?.stage || "正在整理修改建议…"}</p>
      <AgentThinking steps={live?.thinking ?? running.thinking} running />{live?.text && <MarkdownViewer content={live.text} />}
      <button type="button" className="outline-reading-link" disabled={stop.isPending} onClick={() => stop.mutate(running.id)}>结束本轮</button></div>}
    {expanded && !running && latest?.status === "completed" && !latest.result && latest.replyText && <div className="outline-local-reply"><h4>本次回复</h4><MarkdownViewer content={latest.replyText} /></div>}
    {history.isError && <p role="alert">修改记录读取失败。<button onClick={() => void history.refetch()}>重新读取</button></p>}
    {stop.isError && <p role="alert">{stop.error.message}</p>}
    {!!turns.length && <details className="outline-local-history"><summary>历史建议 <small>{turns.length} 轮</small></summary>
      <ol>{[...turns].reverse().map(turn => {
        const result = turn.result;
        return <li key={turn.id}><strong>{turn.requestText}</strong>
          <small>基于 v{turn.contextVersion} · {result ? result.baseVersion !== version && result.status === "pending" ? "旧建议" : statusLabels[result.status] ?? "已结束"
            : turn.status === "completed" ? "讨论回复" : turn.status === "running" ? "生成中" : turn.status === "interrupted" ? "已结束" : "生成失败"}</small>
          {result && <button className="outline-reading-link" onClick={() => onOpen(result.id)}>{result.baseVersion !== version && result.status === "pending" ? "与当前稿对照" : "查看建议"}</button>}
          {result && ["applied","partially_applied","pending"].includes(result.status) && <button className="outline-reading-link" onClick={() => {
            onChange({...draft, priorId:result.id}); onExpand(); input.current?.focus();
          }}>沿用这份建议</button>}
          {(turn.replyText || !!turn.thinking?.length) && <details><summary>查看本轮回复</summary><AgentThinking steps={turn.thinking} running={false} />{turn.replyText && <MarkdownViewer content={turn.replyText} />}</details>}
          {(turn.status === "failed" || turn.status === "interrupted") && <button className="outline-reading-link" onClick={() => {
            onChange({text:turn.requestText, priorId:turn.parentResultId ?? undefined}); onExpand(); input.current?.focus();
          }}>用这条要求继续</button>}
        </li>;
      })}</ol></details>}
  </section>;
}
