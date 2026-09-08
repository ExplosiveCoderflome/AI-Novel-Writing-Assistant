import { del, get, set } from "idb-keyval";
import type { LlmLiveSessionSnapshot } from "@ai-novel/shared/types/llmLive";

const MAX_CACHED_SESSIONS = 30;

function hasIndexedDb(): boolean {
  return typeof globalThis.indexedDB !== "undefined";
}

function normalizeCachedSession(value: unknown): LlmLiveSessionSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const session = value as Partial<LlmLiveSessionSnapshot>;
  if (!session.context?.interactionId || !session.startedAt || !session.updatedAt || !session.phase) {
    return null;
  }
  return {
    ...session,
    context: session.context,
    seq: session.seq ?? 0,
    phase: session.phase,
    phaseMessage: session.phaseMessage ?? "",
    preview: session.preview ?? "",
    totalChars: session.totalChars ?? 0,
    reasoning: session.reasoning ?? "",
    totalReasoningChars: session.totalReasoningChars ?? 0,
    firstResponseAt: session.firstResponseAt ?? null,
    tokenUsage: session.tokenUsage ?? null,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt ?? null,
  };
}

export function llmLiveCacheKey(taskId?: string | null): string {
  return `llm-live:${taskId?.trim() || "global"}`;
}

export function selectRecentLlmLiveSessions(
  sessions: LlmLiveSessionSnapshot[],
): LlmLiveSessionSnapshot[] {
  return [...sessions]
    .filter((session) => ["completed", "failed", "cancelled"].includes(session.phase))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_CACHED_SESSIONS);
}

export async function loadLlmLiveCache(key: string): Promise<LlmLiveSessionSnapshot[]> {
  if (!hasIndexedDb()) {
    return [];
  }
  const cached = await get<unknown>(key);
  return Array.isArray(cached)
    ? selectRecentLlmLiveSessions(
      cached.map(normalizeCachedSession).filter((session): session is LlmLiveSessionSnapshot => session !== null),
    )
    : [];
}

export async function saveLlmLiveCache(
  key: string,
  sessions: LlmLiveSessionSnapshot[],
): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }
  await set(key, selectRecentLlmLiveSessions(sessions));
}

export async function clearLlmLiveCache(key: string): Promise<void> {
  if (!hasIndexedDb()) {
    return;
  }
  await del(key);
}
