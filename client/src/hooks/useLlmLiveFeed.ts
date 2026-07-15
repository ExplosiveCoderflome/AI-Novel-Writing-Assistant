import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LlmLiveEvent,
  LlmLiveSessionSnapshot,
  LlmLiveStreamFrame,
} from "@ai-novel/shared/types/llmLive";
import { API_BASE_URL } from "@/lib/constants";

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
  const [connected, setConnected] = useState(false);
  const pendingFramesRef = useRef<LlmLiveStreamFrame[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenSessionIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const taskId = input.taskId?.trim();
    if (input.enabled === false) {
      setSessionsById({});
      setConnected(false);
      return;
    }

    const controller = new AbortController();
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

    const connect = async () => {
      try {
        const streamUrl = taskId
          ? API_BASE_URL + "/llm-live/stream?taskId=" + encodeURIComponent(taskId)
          : API_BASE_URL + "/llm-live/stream";
        const response = await fetch(
          streamUrl,
          { signal: controller.signal },
        );
        if (!response.ok || !response.body) {
          throw new Error("生成实况连接失败");
        }
        setConnected(true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const rawFrame of frames) {
            const dataLine = rawFrame.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) {
              continue;
            }
            enqueue(JSON.parse(dataLine.slice(6)) as LlmLiveStreamFrame);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setConnected(false);
        }
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingFramesRef.current = [];
      setConnected(false);
    };
  }, [input.enabled, input.taskId]);

  const sessions = useMemo(
    () => Object.values(sessionsById).sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    [sessionsById],
  );
  const clearSessions = () => {
    pendingFramesRef.current = [];
    setSessionsById((previous) => {
      for (const interactionId of Object.keys(previous)) {
        hiddenSessionIdsRef.current.add(interactionId);
      }
      return {};
    });
  };
  return {
    connected,
    sessions,
    latestSession: sessions[sessions.length - 1] ?? null,
    clearSessions,
  };
}
