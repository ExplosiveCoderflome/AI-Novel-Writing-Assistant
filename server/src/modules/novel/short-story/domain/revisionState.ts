import type { CreationRevisionStrategy } from "@ai-novel/shared/types/creationStudio";

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export interface RevisionBaseline {
  intentId: string;
  planId: string;
  planUpdatedAt: string;
  segments: Array<{ id: string; order: number; version: number }>;
  affectedIds: string[];
  checkpoint: {
    status: string;
    type: string | null;
    summary: string | null;
    operationId: string | null;
    pendingManualRecovery: boolean;
    cancelRequestedAt: string | null;
  };
}

export function affectedSegmentIds(
  segments: RevisionBaseline["segments"],
  orders: number[],
  strategy: CreationRevisionStrategy,
): string[] {
  if (!orders.length || orders.some((order) => !segments.some((segment) => segment.order === order))) {
    throw new Error("修改范围无效，请重新生成修改预览。");
  }
  return segments.filter((segment) => strategy === "full_replan"
    || (strategy === "rewrite_downstream" ? segment.order >= Math.min(...orders) : orders.includes(segment.order)))
    .map((segment) => segment.id);
}

export function appendSnapshot(raw: string | null, content: string, version: number): string {
  const history = parseJson<Array<{ content: string; version: number; createdAt: string }>>(raw, []);
  return JSON.stringify([...history.slice(-9), { content, version, createdAt: new Date().toISOString() }]);
}

export function isLegacyRevision(task: { currentItemKey: string | null }, source?: string): boolean {
  return Boolean(task.currentItemKey?.startsWith("revision_")) || source === "revision";
}
