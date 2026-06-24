import type { BookAnalysisTimelineNode } from "../types/bookAnalysis";

const SOURCE_REF_LIMIT = 8;

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export function normalizeBookAnalysisTimelineNode(value: unknown): BookAnalysisTimelineNode | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { label } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!label) {
    return null;
  }

  const timeHint = typeof row.timeHint === "string" ? row.timeHint.trim() : "";
  const phase = typeof row.phase === "string" ? row.phase.trim() : "";
  const sourceRefs = normalizeStringList(row.sourceRefs, SOURCE_REF_LIMIT);

  return {
    label,
    ...(timeHint ? { timeHint } : {}),
    ...(phase ? { phase } : {}),
    ...(sourceRefs.length > 0 ? { sourceRefs } : {}),
  };
}

export function normalizeBookAnalysisTimelineNodes(value: unknown, limit: number): BookAnalysisTimelineNode[] {
  const source = Array.isArray(value) ? value : typeof value === "string" && value.trim() ? [value] : [];
  return source
    .map((item) => normalizeBookAnalysisTimelineNode(item))
    .filter((item): item is BookAnalysisTimelineNode => Boolean(item))
    .slice(0, limit);
}

export function groupBookAnalysisTimelineNodesByPhase(
  nodes: ReadonlyArray<BookAnalysisTimelineNode>,
  fallbackPhase = "未分阶段",
): Array<{ phase: string; nodes: BookAnalysisTimelineNode[] }> {
  const phaseOrder: string[] = [];
  const phaseGroups = new Map<string, BookAnalysisTimelineNode[]>();

  for (const node of nodes) {
    const phase = node.phase?.trim() || fallbackPhase;
    if (!phaseGroups.has(phase)) {
      phaseGroups.set(phase, []);
      phaseOrder.push(phase);
    }
    phaseGroups.get(phase)?.push(node);
  }

  return phaseOrder.map((phase) => ({
    phase,
    nodes: phaseGroups.get(phase) ?? [],
  }));
}
