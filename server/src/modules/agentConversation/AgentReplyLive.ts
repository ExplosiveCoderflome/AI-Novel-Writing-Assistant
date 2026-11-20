import { parsePartialJson } from "@langchain/core/output_parsers";
import type { AgentReplyPreview } from "@ai-novel/shared/types/agentConversation/turn";
import { ThinkTagStreamFilter } from "../../llm/reasoning";
import { llmLiveBroker } from "../../platform/llm/live/LlmLiveBroker";

type Listener = (preview: AgentReplyPreview) => void;
const active = new Map<string, { snapshot: AgentReplyPreview; listeners: Set<Listener> }>();

function publish(snapshot: AgentReplyPreview) {
  const turn = active.get(snapshot.turnId);
  if (!turn) return;
  turn.snapshot = snapshot;
  for (const send of turn.listeners) send(snapshot);
}

export const agentReplyLive = {
  begin(turnId: string) {
    active.set(turnId, {snapshot: {turnId, stage: "正在整理你的想法…", text: "", done: false}, listeners: new Set()});
  },
  subscribe(turnId: string, send: Listener) {
    const turn = active.get(turnId);
    if (!turn) return () => {};
    turn.listeners.add(send);
    send(turn.snapshot);
    return () => { turn.listeners.delete(send); };
  },
  end(turnId: string) {
    if (active.has(turnId)) publish({turnId, stage: "", text: "", done: true});
    active.delete(turnId);
  },
  async during<T>(turnId: string, stage: string, showReply: boolean, run: (itemKey: string) => Promise<T>): Promise<T> {
    const itemKey = "agent-reply:" + turnId;
    let interaction: string | undefined;
    let filter = new ThinkTagStreamFilter();
    let raw = "", lastText = "", streaming = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function flush() {
      clearTimeout(timer); timer = undefined;
      const json = raw.trimStart().replace(/^```(?:json)?\s*/i, "");
      if (!json.startsWith("{")) return;
      try {
        const partial = parsePartialJson(json);
        if (typeof partial?.replyText === "string" && partial.replyText !== lastText) {
          lastText = partial.replyText;
          publish({turnId, stage, text: lastText, done: false});
        }
      } catch { /* An incomplete escape or field is retried with the next delta. */ }
    }
    publish({turnId, stage, text: "", done: false});
    const unsubscribe = llmLiveBroker.subscribe({itemKey}, event => {
      if (event.type === "session_started") {
        clearTimeout(timer); timer = undefined;
        interaction = event.context.interactionId;
        raw = ""; lastText = ""; filter = new ThinkTagStreamFilter();
        streaming = showReply;
        publish({turnId, stage, text: "", done: false});
      } else if (interaction === event.interactionId && streaming) {
        if (event.type === "output_delta") {
          raw += filter.push(event.content).text;
          if (!timer) timer = setTimeout(flush, 75);
        } else if (event.type === "phase_changed" && !["requesting", "streaming"].includes(event.phase)) {
          raw += filter.flush().text; flush(); streaming = false;
        }
      }
    });
    try { return await run(itemKey); }
    finally { clearTimeout(timer); unsubscribe(); }
  },
};
