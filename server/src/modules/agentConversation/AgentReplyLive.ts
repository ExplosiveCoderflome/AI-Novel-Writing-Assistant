import { parsePartialJson } from "@langchain/core/output_parsers";
import type { AgentReplyPreview, AgentThinkingStep } from "@ai-novel/shared/types/agentConversation/turn";
import { ThinkTagStreamFilter } from "../../llm/reasoning";
import { COMPLETED_SESSION_RETENTION_MS, llmLiveBroker } from "../../platform/llm/live/LlmLiveBroker";

type Listener = (preview: AgentReplyPreview) => void;
interface LiveTurn {
  snapshot: AgentReplyPreview;
  listeners: Set<Listener>;
  flush?: () => void;
}
const turns = new Map<string, LiveTurn>();

function publish(turn: LiveTurn, snapshot: AgentReplyPreview) {
  if (turn.snapshot.done) return;
  turn.snapshot = snapshot;
  for (const send of turn.listeners) send(snapshot);
}

export const agentReplyLive = {
  begin(turnId: string) {
    turns.set(turnId, {snapshot: {turnId, stage: "正在整理你的想法…", text: "", done: false}, listeners: new Set()});
  },
  subscribe(turnId: string, send: Listener) {
    const turn = turns.get(turnId);
    if (!turn) return () => {};
    send(turn.snapshot);
    if (!turn.snapshot.done) turn.listeners.add(send);
    return () => { turn.listeners.delete(send); };
  },
  recentThinking(turnId: string, savedStatus: string) {
    return savedStatus === "running" ? undefined : turns.get(turnId)?.snapshot.thinking;
  },
  end(turnId: string) {
    const turn = turns.get(turnId);
    if (!turn || turn.snapshot.done) return;
    turn.flush?.();
    publish(turn, {...turn.snapshot, stage: "", text: "", done: true});
    turn.listeners.clear();
    turn.flush = undefined;
    if (!turn.snapshot.thinking?.length) { turns.delete(turnId); return; }
    setTimeout(() => { if (turns.get(turnId) === turn) turns.delete(turnId); }, COMPLETED_SESSION_RETENTION_MS).unref();
  },
  async during<T>(turnId: string, stage: string, showReply: boolean, run: (itemKey: string) => Promise<T>): Promise<T> {
    const itemKey = "agent-reply:" + turnId;
    const turn = turns.get(turnId);
    if (!turn || turn.snapshot.done) return run(itemKey);
    const liveTurn = turn;
    const previousSteps = turn.snapshot.thinking ?? [];
    let interaction: string | undefined;
    let filter = new ThinkTagStreamFilter();
    let raw = "", text = "", reasoning = "";
    let enabled: boolean | undefined;
    let reasoningTokens: number | undefined;
    let collecting = false, textDirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function flush() {
      clearTimeout(timer); timer = undefined;
      if (textDirty) {
        textDirty = false;
        const json = raw.trimStart().replace(/^```(?:json)?\s*/i, "");
        if (json.startsWith("{")) try {
          const partial = parsePartialJson(json);
          if (typeof partial?.replyText === "string") text = partial.replyText;
        } catch { /* A later delta may complete the field or escape. */ }
      }
      const step: AgentThinkingStep = {stage, text: reasoning, enabled, reasoningTokens};
      const thinking = interaction ? [...previousSteps, step] : previousSteps;
      publish(liveTurn, {turnId, stage, text, thinking, done: false});
    }
    function schedule() { timer ??= setTimeout(flush, 75); }
    turn.flush = flush;
    flush();
    const unsubscribe = llmLiveBroker.subscribe({itemKey}, event => {
      if (turn.snapshot.done) return;
      if (event.type === "session_started") {
        interaction = event.context.interactionId;
        raw = ""; text = ""; reasoning = ""; textDirty = false;
        filter = new ThinkTagStreamFilter();
        enabled = event.context.reasoningEnabled;
        reasoningTokens = undefined;
        collecting = true;
        flush();
      } else if (event.type === "usage_updated" && event.interactionId === interaction) {
        // Some endpoints report usage after validation, without emitting any reasoning text.
        const tokens = event.tokenUsage.reasoningTokens;
        if (tokens != null && tokens > 0) { reasoningTokens = tokens; schedule(); }
      } else if (collecting && event.interactionId === interaction) {
        if (event.type === "reasoning_delta") {
          reasoning += event.content;
          schedule();
        } else if (event.type === "output_delta" && showReply) {
          raw += filter.push(event.content).text; textDirty = true;
          schedule();
        } else if (event.type === "phase_changed" && !["requesting", "streaming"].includes(event.phase)) {
          if (showReply) { raw += filter.flush().text; textDirty = true; }
          flush(); collecting = false;
        }
      }
    });
    try { return await run(itemKey); }
    finally { unsubscribe(); if (timer) flush(); if (turn.flush === flush) turn.flush = undefined; }
  },
};
