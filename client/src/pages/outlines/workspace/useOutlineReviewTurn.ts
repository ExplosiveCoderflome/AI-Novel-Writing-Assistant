import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentConversationTurn } from "@ai-novel/shared/types/agentConversation/turn";
import { apiClient } from "@/api/client";
import { createOutlineId } from "../outlineNodes";

type TrackedTurn = { turnId: string; characterId?: string };
type Request = { requestText: string; baseVersion: number; characterId?: string; priorId?: string; action?: "generate_initial" };
const inline = { errorPresentation: "inline" } as const;

export function useOutlineReviewTurn(projectId: string, onFinish: (proposalId: string | undefined, characterId?: string) => void) {
  const cache = useQueryClient();
  const key = "outline-active-turn:" + projectId;
  const [tracked, setTracked] = useState<TrackedTurn | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
  });
  const [failure, setFailure] = useState("");
  const retry = useRef<{ signature: string; requestId: string } | null>(null);
  const lastHandled = useRef("");
  function track(turnId: string, characterId?: string) {
    const next = { turnId, characterId };
    setFailure("");
    setTracked(next);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* In-memory tracking is sufficient for this visit. */ }
  }
  const prefix = "/outlines/" + projectId;
  const characterId = tracked?.characterId;
  const threadKey = characterId ? ["agent-conversation", "outline-character", projectId, characterId] : ["agent-conversation", "outline-workbench", projectId];
  const history = useQuery<AgentConversationTurn<{ id: string }>[]>({
    queryKey: threadKey, enabled: !!tracked,
    queryFn: async () => (await apiClient.get(prefix + (characterId ? "/character-impact/conversation" : "/conversation"), { ...inline, params: characterId ? { characterId } : undefined })).data.data,
    refetchInterval: tracked ? 1500 : false,
  });
  const turn = tracked && history.data?.find(item => item.id === tracked.turnId);
  useEffect(() => {
    if (!turn || turn.status === "running" || turn.id === lastHandled.current) return;
    lastHandled.current = turn.id;
    setTracked(null);
    try { sessionStorage.removeItem(key); } catch { /* The completed turn is persisted on the server. */ }
    if (turn.status !== "completed") setFailure(turn.replyText || "这一轮未能完成，可以调整要求后重试。");
    void cache.invalidateQueries({ queryKey: ["outline-pending", projectId] });
    void cache.invalidateQueries({ queryKey: ["outline-review", projectId] });
    onFinish(turn.result?.id, characterId);
  }, [turn, key, cache, projectId, onFinish, characterId]);
  const send = useMutation({
    mutationFn: async (input: Request) => {
      const signature = JSON.stringify(input);
      if (retry.current?.signature !== signature) retry.current = { signature, requestId: createOutlineId() };
      const { characterId, priorId, ...rest } = input;
      const body = characterId ? { ...rest, characterId, priorProposalId: priorId } : { ...rest, parentResultId: priorId };
      const res = await apiClient.post(prefix + (characterId ? "/character-impact" : "") + "/conversation/turns", { ...body, requestId: retry.current.requestId }, inline);
      return { turnId: res.data.data.turnId as string, characterId };
    },
    onError: () => cache.invalidateQueries({ queryKey: ["outline", projectId] }),
    onSuccess: result => {
      retry.current = null;
      track(result.turnId, result.characterId);
      void cache.invalidateQueries({ queryKey: ["agent-conversation", result.characterId ? "outline-character" : "outline-workbench", projectId] });
    },
  });
  return { track, send: send.mutate, busy: send.isPending || !!tracked, error: send.error?.message || failure || (tracked && history.error?.message), clearError: () => { setFailure(""); send.reset(); } };
}
