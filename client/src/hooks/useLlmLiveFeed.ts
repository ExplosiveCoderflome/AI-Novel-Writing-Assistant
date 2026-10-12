import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LlmLiveEvent,
  LlmLiveSessionSnapshot,
  LlmLiveStreamFrame,
} from "@ai-novel/shared/types/llmLive";
import { API_BASE_URL } from "@/lib/constants";
import { subscribeLlmLiveStream, type LlmLiveConnectionState } from "@/lib/llmLive/stream";
import {
  clearLlmLiveCache,
  llmLiveCacheKey,
  loadLlmLiveCache,
  saveLlmLiveCache,
} from "@/lib/storage/llmLiveCache";

const MAX_PREVIEW_CHARS = 16_000;

function updateSession(
  current: LlmLiveSessionSnapshot | undefined,
  event: LlmLiveEvent,
): LlmLiveSessionSnapshot | null {
  if (event.type === "session_started") {
    return {
      context: event.context,
      seq: event.seq,
      phase: "requesting",
      phaseMessage: "正在连接模型",
      preview: "",
      totalChars: 0,
      reasoning: "",
      totalReasoningChars: 0,
      firstResponseAt: null,
      tokenUsage: null,
      startedAt: event.at,
      updatedAt: event.at,
      completedAt: null,
    };
  }
  if (!current) {
    return null;
  }
  if (event.type === "output_delta") {
    const preview = current.preview + event.content;
    return {
      ...current,
      seq: event.seq,
      phase: current.phase === "requesting" ? "streaming" : current.phase,
      phaseMessage: current.phase === "requesting" ? "模型正在返回内容" : current.phaseMessage,
      preview: preview.length > MAX_PREVIEW_CHARS ? preview.slice(-MAX_PREVIEW_CHARS) : preview,
      totalChars: event.totalChars,
      firstResponseAt: current.firstResponseAt ?? event.at,
      updatedAt: event.at,
    };
  }
  if (event.type === "reasoning_delta") {
    return {
      ...current,
      seq: event.seq,
      phase: current.phase === "requesting" ? "streaming" : current.phase,
      phaseMessage: current.phase === "requesting" ? "模型正在思考" : current.phaseMessage,
      reasoning: current.reasoning + event.content,
      totalReasoningChars: event.totalReasoningChars,
      firstResponseAt: current.firstResponseAt ?? event.at,
      updatedAt: event.at,
    };
  }
  if (event.type === "usage_updated") {
    return {
      ...current,
      seq: event.seq,
      tokenUsage: event.tokenUsage,
      updatedAt: event.at,
    };
  }
  if (event.type === "phase_changed") {
    return {
      ...current,
      seq: event.seq,
      phase: event.phase,
      phaseMessage: event.message,
      updatedAt: event.at,
      completedAt: event.phase === "completed" || event.phase === "failed" || event.phase === "cancelled"
        ? event.at
        : null,
    };
  }
  if (event.type === "session_completed") {
    return {
      ...current,
      seq: event.seq,
      phase: "completed",
      phaseMessage: "模型结果已准备完成",
      totalChars: event.totalChars,
      updatedAt: event.at,
      completedAt: event.at,
    };
  }
  return {
    ...current,
    seq: event.seq,
    phase: "failed",
    phaseMessage: event.message,
    updatedAt: event.at,
    completedAt: event.at,
  };
}

export function useLlmLiveFeed(input: {
  taskId?: string | null;
  enabled?: boolean;
}) {
  const [sessionsById, setSessionsById] = useState<Record<string, LlmLiveSessionSnapshot>>({});
  const [connectionState, setConnectionState] = useState<LlmLiveConnectionState>("disconnected");
  const pendingFramesRef = useRef<LlmLiveStreamFrame[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenSessionIdsRef = useRef(new Set<string>());
  const cacheKey = llmLiveCacheKey(input.taskId);
  const cacheReadyRef = useRef<string | null>(null);

  useEffect(() => {
    const taskId = input.taskId?.trim();
    cacheReadyRef.current = null;
    if (input.enabled === false) {
      setSessionsById({});
      setConnectionState("disconnected");
      return;
    }

    const controller = new AbortController();
    setSessionsById({});
    void loadLlmLiveCache(cacheKey).then((cachedSessions) => {
      if (controller.signal.aborted) {
        return;
      }
      cacheReadyRef.current = cacheKey;
      setSessionsById((current) => ({
        ...Object.fromEntries(cachedSessions
          .filter((session) => !hiddenSessionIdsRef.current.has(session.context.interactionId))
          .map((session) => [session.context.interactionId, session])),
        ...current,
      }));
    }).catch(() => {
      cacheReadyRef.current = cacheKey;
    });
    const flush = () => {
      flushTimerRef.current = null;
      const frames = pendingFramesRef.current.splice(0);
      if (frames.length === 0) {
        return;
      }
      setSessionsById((previous) => {
        const next = { ...previous };
        for (const frame of frames) {
          if (frame.type === "snapshot") {
            for (const session of frame.sessions) {
              if (!hiddenSessionIdsRef.current.has(session.context.interactionId)) {
                next[session.context.interactionId] = session;
              }
            }
            continue;
          }
          if (frame.type === "event") {
            const event = frame.event;
            const interactionId = event.type === "session_started"
              ? event.context.interactionId
              : event.interactionId;
            if (event.type === "session_started") {
              hiddenSessionIdsRef.current.delete(interactionId);
            } else if (hiddenSessionIdsRef.current.has(interactionId)) {
              continue;
            }
            const updated = updateSession(next[interactionId], event);
            if (updated) {
              next[interactionId] = updated;
            }
          }
        }
        return next;
      });
    };
    const enqueue = (frame: LlmLiveStreamFrame) => {
      if (frame.type === "ping") {
        return;
      }
      pendingFramesRef.current.push(frame);
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flush, 80);
      }
    };

    const stopStream = subscribeLlmLiveStream({
      url: taskId
        ? API_BASE_URL + "/llm-live/stream?taskId=" + encodeURIComponent(taskId)
        : API_BASE_URL + "/llm-live/stream",
      onFrame: enqueue,
      onConnectionState: setConnectionState,
    });
    return () => {
      controller.abort();
      stopStream();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingFramesRef.current = [];
      setConnectionState("disconnected");
    };
  }, [cacheKey, input.enabled, input.taskId]);

  useEffect(() => {
    if (cacheReadyRef.current !== cacheKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveLlmLiveCache(cacheKey, Object.values(sessionsById)).catch(() => undefined);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [cacheKey, sessionsById]);

  const sessions = useMemo(
    () => Object.values(sessionsById).sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    [sessionsById],
  );
  const clearSessions = () => {
    pendingFramesRef.current = [];
    void clearLlmLiveCache(cacheKey).catch(() => undefined);
    setSessionsById((previous) => {
      for (const interactionId of Object.keys(previous)) {
        hiddenSessionIdsRef.current.add(interactionId);
      }
      return {};
    });
  };
  return {
    connected: connectionState === "connected",
    connectionState,
    sessions,
    latestSession: sessions[sessions.length - 1] ?? null,
    clearSessions,
  };
}
