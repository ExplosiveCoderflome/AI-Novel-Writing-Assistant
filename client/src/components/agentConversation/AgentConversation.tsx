import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowUpRight, Bookmark, ChevronDown, Feather, FileText, RefreshCw, Square } from "lucide-react";
import type { AgentConversationTurn, AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import "./agentConversation.css";

export interface AgentConversationAdapter<Result> {
  queryKey: readonly string[];
  load: () => Promise<AgentConversationTurn<Result>[]>;
  send: (input: AgentTurnInput) => Promise<unknown>;
  interrupt: (turnId: string) => Promise<unknown>;
}

interface Props<Result extends { id: string }> {
  adapter: AgentConversationAdapter<Result>;
  title: string;
  context: string;
  confirmationHint: string;
  welcome: { title: string; body: string; starters: { label: string; text: string }[] };
  inputLabel: string;
  placeholder: string;
  initialAction: string;
  followUpAction: (result: Result, number: number) => string;
  versionLabel: (version: string) => string;
  maxLength: number;
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  canContinue: (result: Result) => boolean;
  describeResult: (result: Result) => string;
  renderResult: (result: Result, busy: boolean) => ReactNode;
}

export function AgentConversation<Result extends { id: string }>({
  adapter, title, context, confirmationHint, welcome, inputLabel, placeholder, initialAction, followUpAction, versionLabel,
  maxLength, disabled, value, onChange, canContinue, describeResult, renderResult,
}: Props<Result>) {
  const client = useQueryClient();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const attempted = useRef<AgentTurnInput | null>(null);
  const lastTurn = useRef<HTMLLIElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const history = useQuery({ queryKey: adapter.queryKey, queryFn: adapter.load,
    refetchInterval: query => query.state.data?.some(turn => turn.status === "running") ? 1500 : false });
  const turns = history.data ?? [];
  const results = turns.flatMap((turn, index) => turn.result ? [{ result: turn.result, number: index + 1 }] : []);
  const byResultId = new Map(results.map(item => [item.result.id, item]));
  const opened = openedId ? byResultId.get(openedId) : undefined;
  const parent = opened && canContinue(opened.result) ? opened : [...results].reverse().find(item => canContinue(item.result));
  const running = turns.find(turn => turn.status === "running");
  useEffect(() => {
    // Scroll only the conversation. Moving the workbench itself steals the author's place in the editor.
    const row = lastTurn.current;
    if (row && turns.length > 1 && row.parentElement?.parentElement) {
      const feed = row.parentElement.parentElement;
      feed.scrollTop += row.getBoundingClientRect().top - feed.getBoundingClientRect().top;
    }
  }, [turns.length]);
  const refresh = () => client.invalidateQueries({ queryKey: adapter.queryKey, exact: true });
  const send = useMutation({ mutationFn: adapter.send,
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
      <div><h3>{title}</h3><p>{context}</p></div>
      <button type="button" className="agent-refresh" title="刷新对话" aria-label="刷新对话" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw size={15} /></button>
    </header>
    <div className="agent-feed">
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
          return <li key={turn.id} ref={index === turns.length - 1 ? lastTurn : undefined}>
            <div className="agent-author"><small>你{from && ` · 追问第 ${from.number} 轮`}</small><p>{turn.requestText}</p></div>
            <div className="agent-reply"><small><Feather size={13} aria-hidden="true" />{title} · {versionLabel(turn.contextVersion)}</small>
              <p role={turn.status === "failed" ? "alert" : turn.status === "running" ? "status" : undefined}>{turn.status === "running" ? "正在整理你的想法…" : turn.replyText}</p>
              {result && <button type="button" className="agent-result-link" aria-expanded={opened?.result.id === result.id}
                onClick={() => setOpenedId(opened?.result.id === result.id ? null : result.id)}><FileText size={14} aria-hidden="true" />查看第 {index + 1} 轮提案 · {describeResult(result)}<ChevronDown size={13} aria-hidden="true" /></button>}
              {(turn.status === "failed" || turn.status === "interrupted") && <button className="agent-text-action" type="button" disabled={busy || disabled}
                onClick={() => { if (from) setOpenedId(from.result.id); compose(turn.requestText); }}>用这条要求继续</button>}
              {running?.id === turn.id && <button className="agent-text-action" type="button" disabled={stop.isPending} onClick={() => stop.mutate(turn.id)}><Square size={11} />结束本轮</button>}
              {opened && result?.id === opened.result.id && <div className="agent-review" key={result.id}>{renderResult(result, busy)}</div>}
            </div>
          </li>;
        })}
      </ol>}
    </div>
    <form className="agent-compose" onSubmit={e => { e.preventDefault(); submit(); }}>
      {parent && <div className="agent-reference"><Bookmark size={12} />接着第 {parent.number} 轮提案讨论</div>}
      <div className="agent-input">
        <textarea ref={editor} aria-label={inputLabel} rows={2} value={value} maxLength={maxLength}
          placeholder={turns.length ? "继续追问，或写下你想调整的地方…" : placeholder} disabled={send.isPending} onChange={event => onChange(event.target.value)}
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
