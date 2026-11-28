import type { Response } from "express";
import type { AgentReplyPreview } from "@ai-novel/shared/types/agentConversation/turn";
import { initSSE } from "../../../llm/streaming";
import { agentReplyLive } from "../AgentReplyLive";

export function streamAgentReply(res: Response, turnId: string, status: string) {
  if (res.destroyed) return;
  res.setHeader("X-Accel-Buffering", "no");
  const disposeHeartbeat = initSSE(res);
  res.once("close", disposeHeartbeat);
  let paused = false;
  let latest: AgentReplyPreview | undefined;
  function send(snapshot: AgentReplyPreview) {
    if (res.destroyed || res.writableEnded) return;
    if (paused) { latest = snapshot; return; }
    paused = !res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    if (snapshot.done) res.end();
    else if (paused) res.once("drain", () => {
      paused = false;
      const pending = latest;
      latest = undefined;
      if (pending) send(pending);
    });
  }
  if (status !== "running") return send({turnId, text:"", stage:"", done:true});
  const unsubscribe = agentReplyLive.subscribe(turnId, send);
  res.once("close", unsubscribe);
}
