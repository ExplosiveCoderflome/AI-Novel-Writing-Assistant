import { randomUUID } from "node:crypto";
import type {
  LlmLiveContext,
  LlmLiveEvent,
  LlmLivePhase,
  LlmLiveSessionSnapshot,
} from "@ai-novel/shared/types/llmLive";

const COMPLETED_SESSION_RETENTION_MS = 10 * 60 * 1000;
const MAX_PREVIEW_CHARS = 16_000;

interface SessionRecord {
  snapshot: LlmLiveSessionSnapshot;
  startedAtMs: number;
}

export interface LlmLiveSubscriptionFilter {
  taskId?: string;
  interactionId?: string;
}

export class LlmLiveBroker {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly listeners = new Set<(event: LlmLiveEvent) => void>();
  private nextSeq = 0;

  begin(input: Omit<LlmLiveContext, "interactionId"> & { interactionId?: string }): LlmLiveSession {
    this.pruneCompletedSessions();
    const now = new Date();
    const interactionId = input.interactionId ?? randomUUID();
    const context: LlmLiveContext = {
      ...input,
      promptPreview: input.promptPreview ?? null,
      interactionId,
    };
    const snapshot: LlmLiveSessionSnapshot = {
      context,
      seq: this.nextSequence(),
      phase: "requesting",
      phaseMessage: "正在连接模型",
      preview: "",
      totalChars: 0,
      startedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
    };
    this.sessions.set(interactionId, {
      snapshot,
      startedAtMs: now.getTime(),
    });
    this.publish({
      type: "session_started",
      seq: snapshot.seq,
      at: now.toISOString(),
      context,
    });
    return new LlmLiveSession(this, interactionId);
  }

  subscribe(
    filter: LlmLiveSubscriptionFilter,
    listener: (event: LlmLiveEvent) => void,
  ): () => void {
    const wrapped = (event: LlmLiveEvent) => {
      if (this.matches(event, filter)) {
        listener(event);
      }
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  getSnapshots(filter: LlmLiveSubscriptionFilter = {}): LlmLiveSessionSnapshot[] {
    this.pruneCompletedSessions();
    return [...this.sessions.values()]
      .map((entry) => entry.snapshot)
      .filter((snapshot) => (
        (!filter.interactionId || snapshot.context.interactionId === filter.interactionId)
        && (!filter.taskId || snapshot.context.taskId === filter.taskId)
      ))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.updatedAt.localeCompare(left.updatedAt));
  }

  updatePhase(interactionId: string, phase: LlmLivePhase, message: string, errorMessage?: string | null): void {
    const record = this.sessions.get(interactionId);
    if (!record) {
      return;
    }
    const now = new Date().toISOString();
    const seq = this.nextSequence();
    record.snapshot = {
      ...record.snapshot,
      seq,
      phase,
      phaseMessage: message,
      errorMessage: errorMessage ?? record.snapshot.errorMessage ?? null,
      updatedAt: now,
      completedAt: phase === "completed" || phase === "failed" || phase === "cancelled" ? now : null,
    };
    this.publish({
      type: "phase_changed",
      seq,
      at: now,
      interactionId,
      phase,
      message,
      errorMessage,
    });
  }

  appendDelta(interactionId: string, content: string): void {
    if (!content) {
      return;
    }
    const record = this.sessions.get(interactionId);
    if (!record) {
      return;
    }
    const now = new Date().toISOString();
    const preview = record.snapshot.preview + content;
    const seq = this.nextSequence();
    record.snapshot = {
      ...record.snapshot,
      seq,
      phase: record.snapshot.phase === "requesting" ? "streaming" : record.snapshot.phase,
      phaseMessage: record.snapshot.phase === "requesting" ? "模型正在返回内容" : record.snapshot.phaseMessage,
      preview: preview.length > MAX_PREVIEW_CHARS ? preview.slice(-MAX_PREVIEW_CHARS) : preview,
      totalChars: record.snapshot.totalChars + content.length,
      updatedAt: now,
    };
    this.publish({
      type: "output_delta",
      seq,
      at: now,
      interactionId,
      content,
      totalChars: record.snapshot.totalChars,
    });
  }

  complete(interactionId: string): void {
    const record = this.sessions.get(interactionId);
    if (!record) {
      return;
    }
    this.updatePhase(interactionId, "completed", "模型结果已准备完成");
    const snapshot = this.sessions.get(interactionId)?.snapshot;
    if (!snapshot) {
      return;
    }
    const seq = this.nextSequence();
    const completedAt = new Date().toISOString();
    this.sessions.set(interactionId, {
      ...record,
      snapshot: {
        ...snapshot,
        seq,
        updatedAt: completedAt,
        completedAt,
      },
    });
    this.publish({
      type: "session_completed",
      seq,
      at: completedAt,
      interactionId,
      totalChars: snapshot.totalChars,
      durationMs: Date.now() - record.startedAtMs,
    });
  }

  fail(interactionId: string, message: string, errorMessage?: string | null): void {
    const record = this.sessions.get(interactionId);
    if (!record) {
      return;
    }
    this.updatePhase(interactionId, "failed", message, errorMessage);
    const snapshot = this.sessions.get(interactionId)?.snapshot;
    if (!snapshot) {
      return;
    }
    const seq = this.nextSequence();
    const failedAt = new Date().toISOString();
    this.sessions.set(interactionId, {
      ...record,
      snapshot: {
        ...snapshot,
        seq,
        errorMessage: errorMessage || message,
        updatedAt: failedAt,
        completedAt: failedAt,
      },
    });
    this.publish({
      type: "session_failed",
      seq,
      at: failedAt,
      interactionId,
      message,
      errorMessage: errorMessage || message,
    });
  }

  ingestRemoteEvent(event: LlmLiveEvent, snapshot?: LlmLiveSessionSnapshot | null): void {
    const interactionId = event.type === "session_started"
      ? event.context.interactionId
      : event.interactionId;
    if (snapshot) {
      this.sessions.set(interactionId, {
        snapshot,
        startedAtMs: Date.parse(snapshot.startedAt) || Date.now(),
      });
    } else if (event.type === "session_started") {
      this.sessions.set(interactionId, {
        snapshot: {
          context: event.context,
          seq: event.seq,
          phase: "requesting",
          phaseMessage: "正在连接模型",
          preview: "",
          totalChars: 0,
          startedAt: event.at,
          updatedAt: event.at,
          completedAt: null,
        },
        startedAtMs: Date.parse(event.at) || Date.now(),
      });
    }
    this.publishLocal(event);
  }

  private matches(event: LlmLiveEvent, filter: LlmLiveSubscriptionFilter): boolean {
    const interactionId = event.type === "session_started"
      ? event.context.interactionId
      : event.interactionId;
    if (filter.interactionId && interactionId !== filter.interactionId) {
      return false;
    }
    if (!filter.taskId) {
      return true;
    }
    const record = this.sessions.get(interactionId);
    return record?.snapshot.context.taskId === filter.taskId;
  }

  private publish(event: LlmLiveEvent): void {
    this.publishLocal(event);
    this.forwardToMainApi(event);
  }

  private publishLocal(event: LlmLiveEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private forwardToMainApi(event: LlmLiveEvent): void {
    if (process.env.IS_MAIN_API === "true") {
      return;
    }
    const port = process.env.PORT || "3000";
    const targetUrl = `http://127.0.0.1:${port}/api/llm-live/internal/event`;
    const interactionId = event.type === "session_started" ? event.context.interactionId : event.interactionId;
    const record = this.sessions.get(interactionId);
    const snapshot = record?.snapshot ?? null;

    try {
      fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, snapshot }),
      }).catch(() => {
        // Silently ignore if API process is restarting
      });
    } catch {
      // Ignore network dispatch errors
    }
  }

  private nextSequence(): number {
    this.nextSeq += 1;
    return this.nextSeq;
  }

  private pruneCompletedSessions(): void {
    const cutoff = Date.now() - COMPLETED_SESSION_RETENTION_MS;
    for (const [interactionId, record] of this.sessions) {
      if (
        (record.snapshot.phase === "completed" || record.snapshot.phase === "failed" || record.snapshot.phase === "cancelled")
        && Date.parse(record.snapshot.updatedAt) < cutoff
      ) {
        this.sessions.delete(interactionId);
      }
    }
  }
}

export class LlmLiveSession {
  constructor(
    private readonly broker: LlmLiveBroker,
    readonly interactionId: string,
  ) {}

  delta(content: string): void {
    this.broker.appendDelta(this.interactionId, content);
  }

  phase(phase: LlmLivePhase, message: string): void {
    this.broker.updatePhase(this.interactionId, phase, message);
  }

  complete(): void {
    this.broker.complete(this.interactionId);
  }

  fail(error: unknown): void {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "模型调用失败";
    const details = error instanceof Error && error.stack ? error.stack : message;
    this.broker.fail(this.interactionId, message, details);
  }
}

export const llmLiveBroker = new LlmLiveBroker();
