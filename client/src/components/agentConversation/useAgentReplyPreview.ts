import { useEffect, useState } from "react";
import { subscribeSnapshots } from "@/lib/streaming/subscribeSnapshots";
import type { AgentReplyPreview } from "@ai-novel/shared/types/agentConversation/turn";

export function useAgentReplyPreview(streamUrl: string | undefined, turnId: string | undefined, refetch: () => Promise<unknown>) {
  const [preview, setPreview] = useState<AgentReplyPreview | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!streamUrl || typeof EventSource === "undefined") return;
    const close = subscribeSnapshots(streamUrl, raw => {
      const frame = raw as Partial<AgentReplyPreview> | null;
      if (!frame || frame.turnId !== turnId || typeof frame.text !== "string"
        || typeof frame.stage !== "string" || typeof frame.done !== "boolean") return;
      if (frame.thinking !== undefined && (!Array.isArray(frame.thinking) ||
        !frame.thinking.every(step => step && typeof step.stage === "string" && typeof step.text === "string"))) return;
      if (frame.done) { close(); void refetch(); }
      else setPreview(frame as AgentReplyPreview);
    });
    return close;
  }, [streamUrl, turnId, refetch]);
  return preview?.turnId === turnId ? preview : null;
}
