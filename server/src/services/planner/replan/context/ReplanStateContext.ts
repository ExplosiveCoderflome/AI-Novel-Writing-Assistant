import type { CanonicalStateSnapshot } from "@ai-novel/shared/types/canonicalState";

// Object key ordering is irrelevant to facts; array ordering and all field values are retained.
function orderedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  });
}

/** Lossless prompt projection, not a new persisted canonical-state format. */
export function buildReplanStateContext(snapshot: CanonicalStateSnapshot | null): {
  stableJson: string;
  dynamicJson: string;
} {
  if (!snapshot) return { stableJson: "null", dynamicJson: "null" };
  const { bookContract, worldState, narrative, ...state } = snapshot;
  const { currentSituation, ...worldBaseline } = worldState ?? {};
  const payoffStates: unknown[] = [];
  const indices = new Map<string, number>();
  const references = (records: unknown[]) => records.map(record => {
    const key = orderedJson(record);
    const existing = indices.get(key);
    if (existing !== undefined) return existing;
    const index = payoffStates.length;
    indices.set(key, index);
    payoffStates.push(record);
    return index;
  });
  const { pendingPayoffs, urgentPayoffs, overduePayoffs, ...narrativeState } = narrative ?? {};
  const payoffReferences = {
    pendingPayoffs: references(pendingPayoffs ?? []),
    urgentPayoffs: references(urgentPayoffs ?? []),
    overduePayoffs: references(overduePayoffs ?? []),
  };
  return {
    stableJson: orderedJson({ bookContract, worldState: worldState ? worldBaseline : null }),
    dynamicJson: orderedJson({
      ...state,
      ...(worldState ? { worldState: { currentSituation } } : {}),
      narrative: narrative ? { ...narrativeState, payoffStates, ...payoffReferences } : null,
    }),
  };
}
