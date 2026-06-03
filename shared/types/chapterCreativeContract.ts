const SYSTEM_AUDIT_MARKERS = [
  "acceptance_gate_unavailable",
  "missing_must_hit",
  "quality_gate_failed",
  "schema_error",
  "mode_fit",
  "plot/missing_must_hit",
  "mode_fit/acceptance_gate_unavailable",
];

function normalizeContractMarker(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "/")
    .trim()
    .toLowerCase();
}

export function isSystemAuditContractItem(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = normalizeContractMarker(value);
  if (!normalized) {
    return false;
  }
  return SYSTEM_AUDIT_MARKERS.some((marker) => normalized.includes(marker));
}

export function sanitizeCreativeMustAdvanceItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || isSystemAuditContractItem(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
