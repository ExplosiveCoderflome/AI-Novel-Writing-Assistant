import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { outlineReviewThread, type LocalTarget } from "./outlineReviewThread";
import { createOutlineId } from "../outlineNodes";

type TrackedTurn = { turnId: string; target?: LocalTarget };
type Request = { requestText: string; baseVersion: number; target?: LocalTarget; priorId?: string; action?: "generate_initial" };

export function useOutlineReviewTurn(projectId: string, onFinish: (proposalId: string | undefined, target?: LocalTarget) => void) {
  const cache = useQueryClient();
  const key = "outline-active-turn:" + projectId;
  const [tracked, setTracked] = useState<TrackedTurn | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return saved?.characterId ? { turnId: saved.turnId, target: { kind: "character", id: saved.characterId } } : saved;
    } catch { return null; }
  });
  const [failure, setFailure] = useState("");
  const retry = useRef<{ signature: string; requestId: string } | null>(null);
  const lastHandled = useRef("");
  function track(turnId: string, target?: LocalTarget) {
    const next = { turnId, target };
    setFailure("");
    setTracked(next);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* In-memory tracking is sufficient for this visit. */ }
  }
  const target = tracked?.target;
  const thread = outlineReviewThread(projectId, target);
  const history = useQuery({
    queryKey: thread.queryKey, enabled: !!tracked, queryFn: thread.load,
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
    onFinish(turn.result?.id, target);
  }, [turn, key, cache, projectId, onFinish, target]);
  const send = useMutation({
    mutationFn: async (input: Request) => {
      const signature = JSON.stringify(input);
      if (retry.current?.signature !== signature) retry.current = { signature, requestId: createOutlineId() };
      const { target, priorId, ...rest } = input;
      const turnId = await outlineReviewThread(projectId, target).send(retry.current.requestId, rest, priorId);
      return { turnId, target };
    },
    onError: () => cache.invalidateQueries({ queryKey: ["outline", projectId] }),
    onSuccess: result => {
      retry.current = null;
      track(result.turnId, result.target);
      void cache.invalidateQueries({ queryKey: outlineReviewThread(projectId, result.target).queryKey });
    },
  });
  return { track, target, send: send.mutate, busy: send.isPending || !!tracked, error: send.error?.message || failure || (tracked && history.error?.message), clearError: () => { setFailure(""); send.reset(); } };
}
