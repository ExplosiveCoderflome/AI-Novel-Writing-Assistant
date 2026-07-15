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
    const context: LlmLiveContext = { ...input, interactionId };
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

  getSnapshots(filter: LlmLiveSubscriptionFilter): LlmLiveSessionSnapshot[] {
    this.pruneCompletedSessions();
    return [...this.sessions.values()]
      .map((entry) => entry.snapshot)
      .filter((snapshot) => (
        (!filter.interactionId || snapshot.context.interactionId === filter.interactionId)
        && (!filter.taskId || snapshot.context.taskId === filter.taskId)
      ))
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  updatePhase(interactionId: string, phase: LlmLivePhase, message: string): void {
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

  fail(interactionId: string, message: string): void {
    const record = this.sessions.get(interactionId);
    if (!record) {
      return;
    }
    this.updatePhase(interactionId, "failed", message);
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
    });
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
    for (const listener of this.listeners) {
      listener(event);
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
    const message = error instanceof Error ? error.message : "模型调用失败";
    this.broker.fail(this.interactionId, message);
  }
}

export const llmLiveBroker = new LlmLiveBroker();
