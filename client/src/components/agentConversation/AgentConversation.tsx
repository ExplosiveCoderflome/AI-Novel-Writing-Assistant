import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentConversationTurn, AgentTurnInput } from "@ai-novel/shared/types/agentConversation/turn";
import { Button } from "@/components/ui/button";

export interface AgentConversationAdapter<Result> {
  queryKey: readonly string[];
  load: () => Promise<AgentConversationTurn<Result>[]>;
  send: (input: AgentTurnInput) => Promise<unknown>;
  interrupt: (turnId: string) => Promise<unknown>;
}

interface Props<Result extends { id: string }> {
  adapter: AgentConversationAdapter<Result>;
  title: string;
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

function requestId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function AgentConversation<Result extends { id: string }>({
  adapter, title, inputLabel, placeholder, initialAction, followUpAction, versionLabel, maxLength, disabled, value, onChange, canContinue, describeResult, renderResult,
}: Props<Result>) {
  const client = useQueryClient();
  const [openedId, setOpenedId] = useState<string | null>(null);
  const attempted = useRef<AgentTurnInput | null>(null);
  const transcript = useRef<HTMLOListElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const history = useQuery({ queryKey: adapter.queryKey, queryFn: adapter.load,
    refetchInterval: query => query.state.data?.some(turn => turn.status === "running") ? 1500 : false });
  const turns = history.data ?? [];
  const results = turns.flatMap((turn, index) => turn.result ? [{ result: turn.result, number: index + 1 }] : []);
  const byResultId = new Map(results.map(item => [item.result.id, item]));
  const opened = (openedId ? byResultId.get(openedId) : undefined) ?? results.at(-1);
  const parent = opened && canContinue(opened.result) ? opened : [...results].reverse().find(item => canContinue(item.result));
  const running = turns.find(turn => turn.status === "running");
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [turns.length, running?.id]);
  const refresh = () => client.invalidateQueries({ queryKey: adapter.queryKey, exact: true });
  const send = useMutation({
    mutationFn: adapter.send,
    onSuccess: () => { onChange(""); setOpenedId(null); attempted.current = null; },
    onSettled: refresh,
  });
  const stop = useMutation({ mutationFn: adapter.interrupt, onSettled: refresh });
  const busy = send.isPending || !!running || stop.isPending;
  const canSend = history.isSuccess && !disabled && !busy && !!value.trim();
  function submit() {
    if (!canSend) return;
    const requestText = value.trim(), parentResultId = parent?.result.id;
    const previous = attempted.current;
    const input = previous && previous.requestText === requestText && previous.parentResultId === parentResultId
      ? previous : { requestId: requestId(), requestText, parentResultId };
    attempted.current = input;
    send.mutate(input);
  }

  return <section className="space-y-4" aria-label={title}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">{title}</h3>
      <Button size="sm" variant="ghost" disabled={history.isFetching} onClick={() => void history.refetch()}>刷新对话</Button>
    </div>
    {history.isLoading && <p role="status" className="text-sm text-muted-foreground">正在读取对话…</p>}
    {history.isError && <p role="alert" className="text-sm text-destructive">对话读取失败，请刷新对话。</p>}
    {turns.length > 0 && <ol ref={transcript} aria-label="对话记录" className="max-h-80 space-y-4 overflow-auto overscroll-contain py-1 pr-1">
      {turns.map((turn, index) => {
        const from = turn.parentResultId ? byResultId.get(turn.parentResultId) : undefined;
        return <li key={turn.id} className="space-y-1.5">
          <p className="text-xs text-muted-foreground">第 {index + 1} 轮 · {versionLabel(turn.contextVersion)}{from && ` · 追问第 ${from.number} 轮`}</p>
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-sm"><span className="sr-only">作者</span>{turn.requestText}</p>
          <div className="pl-2 text-sm">
            <p role={turn.status === "failed" ? "alert" : undefined} className="whitespace-pre-wrap break-words"><span className="sr-only">AI</span>{turn.status === "running" ? "正在分析你的要求…" : turn.replyText}</p>
            {turn.result && <button type="button" className="py-1 text-left text-sm text-primary hover:underline"
              aria-pressed={opened?.result.id === turn.result.id} onClick={() => setOpenedId(turn.result!.id)}>
              查看第 {index + 1} 轮提案 · {describeResult(turn.result)}
            </button>}
            {(turn.status === "failed" || turn.status === "interrupted") && <Button size="sm" variant="ghost" disabled={busy || disabled}
              onClick={() => { onChange(turn.requestText); if (from) setOpenedId(from.result.id); editor.current?.focus(); }}>用这条要求继续</Button>}
            {turn.status === "running" && <Button size="sm" variant="ghost" disabled={stop.isPending} onClick={() => stop.mutate(turn.id)}>结束本轮</Button>}
          </div>
        </li>;
      })}
    </ol>}
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className="block space-y-1 text-sm font-medium">{inputLabel}
        <textarea ref={editor} className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal leading-relaxed"
          rows={3} maxLength={maxLength} value={value} disabled={send.isPending} placeholder={placeholder}
          onChange={event => onChange(event.target.value)} />
      </label>
      <Button disabled={!canSend} type="submit">{send.isPending ? "正在发送…" : running ? "正在分析…" : parent ? followUpAction(parent.result, parent.number) : initialAction}</Button>
      {(send.error || stop.error) && <p role="alert" className="text-sm text-destructive">{(send.error ?? stop.error)?.message}</p>}
    </form>
    {opened && <div className="border-t border-border/50 pt-3" key={opened.result.id}>
      <p className="mb-2 text-xs text-muted-foreground">第 {opened.number} 轮提案 · {describeResult(opened.result)}</p>
      {renderResult(opened.result, busy)}
    </div>}
  </section>;
}
