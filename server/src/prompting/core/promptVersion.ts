import crypto from "node:crypto";

function normalizePromptVersionValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizePromptVersionValue(item, seen));
  }
  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, item]) => [
        normalizePromptVersionValue(key, seen),
        normalizePromptVersionValue(item, seen),
      ])
      .sort(([left], [right]) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value instanceof Set) {
    return [...value.values()]
      .map((item) => normalizePromptVersionValue(item, seen))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular]";
    }
    seen.add(value as object);
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizePromptVersionValue(item, seen)]);
    seen.delete(value as object);
    return Object.fromEntries(entries);
  }
  return String(value);
}

export function stableStringifyPromptVersionSource(value: unknown): string {
  return JSON.stringify(normalizePromptVersionValue(value, new WeakSet<object>()));
}

export function buildPromptVersion(source: unknown): string {
  return `h${crypto.createHash("sha256").update(stableStringifyPromptVersionSource(source)).digest("hex").slice(0, 12)}`;
}
