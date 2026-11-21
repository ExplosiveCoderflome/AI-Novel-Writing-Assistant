import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Feather, FileText, RefreshCw, Square } from "lucide-react";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import { useAgentReplyPreview } from "./useAgentReplyPreview";
import type { AgentConversationTurn, AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { AgentThinking } from "./AgentThinking";
import "./agentConversation.css";

export interface AgentConversationAdapter<Result> {
  queryKey: readonly string[];
  streamUrl?: (turnId: string) => string;
  load: () => Promise<AgentConversationTurn<Result>[]>;
  send: (input: AgentTurnInput) => Promise<unknown>;
  interrupt: (turnId: string) => Promise<unknown>;
}

interface Props<Result extends { id: string; status: string }> {
  adapter: AgentConversationAdapter<Result>;
  title: string;
  context: ReactNode;
  confirmationHint: string;
  welcome: { title: string; body: string; starters: { label: string; text: string }[] };
  inputLabel: string;
  placeholder: string;
  followUpPlaceholder: string;
  initialAction: string;
  followUpAction: (result: Result, number: number) => string;
  versionLabel: (version: string) => string;
  maxLength: number;
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  canContinue: (result: Result) => boolean;
  describeResult: (result: Result) => string;
  draftPreview?: (result: Result) => { title: string; counts: string } | undefined;
  followUpTopic: (result: Result, number: number) => string;
  onOpenResult?: (resultId: string) => void;
  renderResult?: (result: Result, busy: boolean, round: number) => ReactNode;
}

export function AgentConversation<Result extends { id: string; status: string }>({
  adapter, title, context, confirmationHint, welcome, inputLabel, placeholder, followUpPlaceholder, initialAction, followUpAction, versionLabel,
  maxLength, disabled, value, onChange, canContinue, describeResult, draftPreview, followUpTopic, renderResult, onOpenResult,
}: Props<Result>) {
  const client = useQueryClient();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const attempted = useRef<AgentTurnInput | null>(null);
  const lastTurn = useRef<HTMLLIElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const editor = useRef<HTMLTextAreaElement>(null);
  const topicId = useId();
  const history = useQuery({ queryKey: adapter.queryKey, queryFn: adapter.load,
    refetchInterval: query => query.state.data?.some(turn => turn.status === "running") ? 1500 : false });
  const turns = history.data ?? [];
  const results = turns.flatMap((turn, index) => turn.result ? [{ result: turn.result, number: index + 1 }] : []);
  const byResultId = new Map(results.map(item => [item.result.id, item]));
  const opened = openedId ? byResultId.get(openedId) : undefined;
  const parent = opened && canContinue(opened.result) ? opened : [...results].reverse().find(item => canContinue(item.result));
  const running = turns.find(turn => turn.status === "running");
  const streamUrl = running && adapter.streamUrl?.(running.id);
  const preview = useAgentReplyPreview(streamUrl, running?.id, history.refetch);
  useEffect(() => {
    const feed = feedRef.current;
    if (preview && followReply.current && feed) feed.scrollTop = feed.scrollHeight;
  }, [preview]);
  useEffect(() => {
    // Scroll only the conversation. Moving the workbench itself steals the author's place in the editor.
    const row = lastTurn.current;
    if (row && turns.length > 1 && row.parentElement?.parentElement) {
      const feed = row.parentElement.parentElement;
      feed.scrollTop += row.getBoundingClientRect().top - feed.getBoundingClientRect().top;
    }
  }, [turns.length]);
  const refresh = () => client.invalidateQueries({ queryKey: adapter.queryKey, exact: true });
  const send = useMutation({ mutationKey: adapter.queryKey, mutationFn: adapter.send,
    onSuccess: () => { onChange(""); setOpenedId(null); attempted.current = null; }, onSettled: refresh });
  const stop = useMutation({ mutationFn: adapter.interrupt, onSettled: refresh });
  const busy = send.isPending || !!running || stop.isPending;
  const canSend = history.isSuccess && !disabled && !busy && !!value.trim();
  const action = parent ? followUpAction(parent.result, parent.number) : initialAction;
  function submit() {
    if (!canSend) return;
    const requestText = value.trim(), parentResultId = parent?.result.id;
    const previous = attempted.current;
    const input = previous && previous.requestText === requestText && previous.parentResultId === parentResultId
      ? previous : { requestId: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""), requestText, parentResultId };
    attempted.current = input;
    send.mutate(input);
  }
  function compose(text: string) { onChange(text); editor.current?.focus(); }

  return <section className="agent-conversation" aria-label={title}>
    <header className="agent-heading">
      <span className="agent-mark" aria-hidden="true"><Feather size={20} /></span>
      <div><h3>{title}</h3>{typeof context === "string" ? <p>{context}</p> : context}</div>
      <button type="button" className="agent-refresh" title="刷新对话" aria-label="刷新对话" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw size={15} /></button>
    </header>
    <div className="agent-feed" ref={feedRef} onScroll={event => {
      const feed = event.currentTarget;
      followReply.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    }}>
      {history.isLoading && <p role="status">正在读取对话…</p>}
      {history.isError && <p role="alert">对话读取失败，请刷新对话。</p>}
      {history.isSuccess && !turns.length && <div className="agent-welcome">
        <h4>{welcome.title}</h4><p>{welcome.body}</p>
        {!value.trim() && <div className="agent-starters" role="group" aria-label="选择讨论起点">
          {welcome.starters.map(item => <button key={item.label} type="button" onClick={() => compose(item.text)}>
            {item.label}<ArrowUpRight size={15} aria-hidden="true" /></button>)}
        </div>}
      </div>}
      {!!turns.length && <ol className="agent-messages" aria-label="对话记录">
        {turns.map((turn, index) => {
          const from = turn.parentResultId ? byResultId.get(turn.parentResultId) : undefined;
          const result = turn.result;
          const draft = result && draftPreview?.(result);
          const expanded = !!result && opened?.result.id === result.id;
          const live = turn.status === "running" && preview?.turnId === turn.id ? preview : null;
          return <li key={turn.id} ref={index === turns.length - 1 ? lastTurn : undefined}>
            <div className="agent-author"><small>你{from && ` · 追问第 ${from.number} 轮`}</small><p>{turn.requestText}</p></div>
            <div className="agent-reply"><small><Feather size={13} aria-hidden="true" />{title}{!draft && ` · ${versionLabel(turn.contextVersion)}`}</small>
              <AgentThinking steps={live?.thinking ?? turn.thinking} running={turn.status === "running"} />
              {turn.status === "running" ? <>
                <p role="status" className="text-muted-foreground">{live?.stage || "正在整理你的想法…"}</p>
                {live?.text && <div className="agent-prose"><MarkdownViewer content={live.text} /></div>}
              </> : turn.status === "completed" && turn.replyText ? <div className="agent-prose"><MarkdownViewer content={turn.replyText} /></div>
                : turn.replyText && <p role={turn.status === "failed" ? "alert" : undefined}>{turn.replyText}</p>}
              {result && <button type="button" className={draft ? "agent-draft" : "agent-result-link"} aria-expanded={onOpenResult ? undefined : expanded}
                onClick={() => { setOpenedId(expanded && !onOpenResult ? null : result.id); onOpenResult?.(result.id); }}>
                {draft ? <>
                  <span className="agent-draft-heading">
                    <strong>{draft.title}</strong>
                    <span className="agent-draft-status" data-adopted={result.status === "applied"}>
                      {result.status === "applied" && <Check size={13} aria-hidden="true" />}{describeResult(result)}
                    </span>
                  </span>
                  <span className="agent-draft-footer"><span>{draft.counts}</span><span className="agent-draft-action">
                    {expanded && !onOpenResult ? "收起大纲" : "查看大纲"}<ChevronDown size={14} aria-hidden="true" /></span></span>
                </> : <><FileText size={14} aria-hidden="true" />查看第 {index + 1} 轮提案 · {describeResult(result)}<ChevronDown size={13} aria-hidden="true" /></>}
              </button>}
              {(turn.status === "failed" || turn.status === "interrupted") && <button className="agent-text-action" type="button" disabled={busy || disabled}
                onClick={() => { if (from) setOpenedId(from.result.id); compose(turn.requestText); }}>用这条要求继续</button>}
              {running?.id === turn.id && <button className="agent-text-action" type="button" disabled={stop.isPending} onClick={() => stop.mutate(turn.id)}><Square size={11} />结束本轮</button>}
              {result && expanded && renderResult && <div className="agent-review" data-draft={!!draft} key={result.id}>
                {renderResult(result, busy, index + 1)}
              </div>}
            </div>
          </li>;
        })}
      </ol>}
    </div>
    <form className="agent-compose" onSubmit={e => { e.preventDefault(); submit(); }}>
      <div className="agent-input">
        {parent && <div className="agent-reference" id={topicId} title={`第 ${parent.number} 轮提案`}>
          <BookOpen size={14} aria-hidden="true" />{followUpTopic(parent.result, parent.number)}
        </div>}
        <textarea ref={editor} aria-label={inputLabel} aria-describedby={parent ? topicId : undefined} rows={2} value={value} maxLength={maxLength}
          placeholder={parent ? followUpPlaceholder : turns.length ? "接着说说你的想法…" : placeholder} disabled={send.isPending} onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey
              || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            event.preventDefault(); submit();
          }} />
        <div className="agent-send-row"><span>{confirmationHint}</span>
          <button type="submit" disabled={!canSend} title={action}><span className="sr-only">{action}</span><ArrowUp size={17} aria-hidden="true" /></button>
        </div>
      </div>
      {(send.error || stop.error) && <p role="alert">{(send.error ?? stop.error)?.message}</p>}
    </form>
  </section>;
}
