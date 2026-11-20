import type { Response } from "express";
import type { AgentReplyPreview } from "@ai-novel/shared/types/agentConversation/turn";
import { initSSE } from "../../../llm/streaming";
import { agentReplyLive } from "../AgentReplyLive";

export function streamAgentReply(res: Response, turnId: string, status: string) {
  if (res.destroyed) return;
  res.setHeader("X-Accel-Buffering", "no");
  const disposeHeartbeat = initSSE(res);
  res.once("close", disposeHeartbeat);
  const send = (snapshot: AgentReplyPreview) => {
    if (!res.destroyed && !res.writableEnded && (!res.write(`data: ${JSON.stringify(snapshot)}\n\n`) || snapshot.done)) res.end();
  };
  if (status !== "running") return send({turnId, text:"", stage:"", done:true});
  const unsubscribe = agentReplyLive.subscribe(turnId, send);
  res.once("close", unsubscribe);
}
