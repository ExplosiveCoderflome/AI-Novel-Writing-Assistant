import type { LlmLiveStreamFrame } from "@ai-novel/shared/types/llmLive";

export type LlmLiveConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

const RECONNECT_DELAY_MS = 2_000;
// The server sends a heartbeat every 15 seconds, even while the model is idle.
const SILENCE_TIMEOUT_MS = 45_000;

/** A read-only subscription. Reconnection never retries a model call or changes a task. */
export function subscribeLlmLiveStream(input: {
  url: string;
  onFrame: (frame: LlmLiveStreamFrame) => void;
  onConnectionState: (state: LlmLiveConnectionState) => void;
}): () => void {
  let stopped = false;
  let attempt: AbortController | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeRetry: (() => void) | null = null;
  let reconnectImmediately = false;

  const clearSilenceTimer = () => {
    if (silenceTimer !== null) clearTimeout(silenceTimer);
    silenceTimer = null;
  };
  const interruptAttempt = () => {
    attempt?.abort();
    void reader?.cancel().catch(() => undefined);
  };
  const armSilenceTimer = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (stopped) return;
      input.onConnectionState("reconnecting");
      interruptAttempt();
    }, SILENCE_TIMEOUT_MS);
  };
  const reconnectNow = () => {
    if (stopped) return;
    if (wakeRetry) {
      wakeRetry();
    } else if (attempt && !attempt.signal.aborted) {
      reconnectImmediately = true;
      input.onConnectionState("reconnecting");
      interruptAttempt();
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") reconnectNow();
  };
  window.addEventListener("online", reconnectNow);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const waitForRetry = () => new Promise<void>(resolve => {
    const timer = setTimeout(() => { wakeRetry = null; resolve(); }, RECONNECT_DELAY_MS);
    wakeRetry = () => { clearTimeout(timer); wakeRetry = null; resolve(); };
  });
  const connect = async () => {
    input.onConnectionState("connecting");
    while (!stopped) {
      attempt = new AbortController();
      reconnectImmediately = false;
      armSilenceTimer();
      try {
        const response = await fetch(input.url, { signal: attempt.signal });
        if (stopped || attempt.signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          if (stopped) break;
          throw new Error("实况连接已中断");
        }
        if (!response.ok || !response.body) throw new Error("实况连接失败");
        input.onConnectionState("connected");
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped && !attempt.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          armSilenceTimer();
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? "";
          for (const rawFrame of frames) {
            const data = rawFrame.split(/\r?\n/)
              .filter(line => line.startsWith("data:"))
              .map(line => line.slice(5).trimStart()).join("\n");
            if (!data) continue;
            let frame: LlmLiveStreamFrame;
            try { frame = JSON.parse(data) as LlmLiveStreamFrame; }
            catch { continue; }
            if (!stopped && !attempt.signal.aborted) input.onFrame(frame);
          }
        }
      } catch {
        // Transport errors and heartbeat timeouts share the same reconnect path.
      } finally {
        clearSilenceTimer();
        if (reader) {
          void reader.cancel().catch(() => undefined);
          reader.releaseLock();
          reader = null;
        }
        attempt.abort();
        attempt = null;
        if (!stopped) input.onConnectionState("reconnecting");
      }
      if (!stopped && !reconnectImmediately) await waitForRetry();
    }
  };
  void connect();
  return () => {
    stopped = true;
    window.removeEventListener("online", reconnectNow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearSilenceTimer();
    wakeRetry?.();
    interruptAttempt();
  };
}
