import { useCallback, useEffect, useRef, useState } from "react";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import { API_BASE_URL } from "@/lib/constants";

interface UseSSEOptions {
  headers?: Record<string, string>;
  onReasoning?: (content: string) => void;
  onDone?: (fullContent: string) => void;
}

export function useSSE(options?: UseSSEOptions) {
  const [content, setContent] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const handleFrame = useCallback(
    (frame: SSEFrame) => {
      if (frame.type === "ping") {
        return;
      }

      if (frame.type === "chunk") {
        setContent((prev) => prev + frame.content);
        return;
      }

      if (frame.type === "reasoning") {
        setReasoning((prev) => prev + frame.content);
        options?.onReasoning?.(frame.content);
        return;
      }

      if (frame.type === "done") {
        setIsStreaming(false);
        setIsDone(true);
        options?.onDone?.(frame.fullContent);
        return;
      }

      setIsStreaming(false);
      setIsDone(false);
      setError(frame.error);
    },
    [options],
  );

  const start = useCallback(
    async (url: string, body: unknown) => {
      abort();
      setContent("");
      setReasoning("");
      setError(null);
      setIsDone(false);
      setIsStreaming(true);

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const response = await fetch(url.startsWith("http") ? url : `${API_BASE_URL}${url}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(options?.headers ?? {}),
          },
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`请求失败，状态码 ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const rawFrame of frames) {
            const payloadLine = rawFrame
              .split("\n")
              .find((line) => line.startsWith("data:"));
            if (!payloadLine) {
              continue;
            }
            const rawData = payloadLine.replace("data:", "").trim();
            if (!rawData) {
              continue;
            }
            const frame = JSON.parse(rawData) as SSEFrame;
            handleFrame(frame);
          }
        }
      } catch (streamError) {
        if ((streamError as Error).name !== "AbortError") {
          setError(streamError instanceof Error ? streamError.message : "流式请求失败。");
          setIsStreaming(false);
        }
      } finally {
        controllerRef.current = null;
      }
    },
    [abort, handleFrame, options?.headers],
  );

  useEffect(() => abort, [abort]);

  return {
    start,
    abort,
    content,
    reasoning,
    isStreaming,
    isDone,
    error,
  };
}
