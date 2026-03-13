const WORLD_TEXT_FIELD_KEYS = [
  "description",
  "background",
  "geography",
  "cultures",
  "magicSystem",
  "politics",
  "races",
  "religions",
  "technology",
  "conflicts",
  "history",
  "economy",
  "factions",
] as const;

type WorldTextFieldKey = (typeof WORLD_TEXT_FIELD_KEYS)[number];

function normalizeTextFieldValue(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    return value || null;
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    const values = raw
      .map((item) => normalizeTextFieldValue(item))
      .filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join("\n") : null;
  }
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["content", "summary", "description", "value", "text", "overview"]) {
      const nested = normalizeTextFieldValue(record[key]);
      if (nested) {
        return nested;
      }
    }
    const lines = Object.entries(record)
      .map(([key, value]) => {
        const normalized = normalizeTextFieldValue(value);
        return normalized ? `${key}：${normalized}` : null;
      })
      .filter((item): item is string => Boolean(item));
    return lines.length > 0 ? lines.join("\n") : JSON.stringify(record, null, 2);
  }
  return null;
}

function normalizeJsonFieldValue(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    return value || null;
  }
  return JSON.stringify(raw);
}

function getAliasedField(record: Record<string, unknown>, field: WorldTextFieldKey): unknown {
  switch (field) {
    case "cultures":
      return record.cultures ?? record.culture ?? null;
    case "conflicts":
      return record.conflicts ?? record.conflict ?? null;
    default:
      return record[field] ?? null;
  }
}

export interface PersistedGeneratedWorldPayload {
  description: string | null;
  background: string | null;
  geography: string | null;
  cultures: string | null;
  magicSystem: string | null;
  politics: string | null;
  races: string | null;
  religions: string | null;
  technology: string | null;
  conflicts: string | null;
  history: string | null;
  economy: string | null;
  factions: string | null;
  selectedDimensions: string | null;
  layerStates: string | null;
  consistencyReport: string | null;
  overviewSummary: string | null;
}

export function normalizeGeneratedWorldPayload(
  raw: Record<string, unknown>,
  fallbackDescription?: string,
): PersistedGeneratedWorldPayload {
  const normalized = WORLD_TEXT_FIELD_KEYS.reduce((acc, field) => {
    acc[field] = normalizeTextFieldValue(getAliasedField(raw, field));
    return acc;
  }, {} as Record<WorldTextFieldKey, string | null>);

  return {
    ...normalized,
    description: normalized.description ?? fallbackDescription?.trim() ?? null,
    selectedDimensions: normalizeJsonFieldValue(raw.selectedDimensions),
    layerStates: normalizeJsonFieldValue(raw.layerStates),
    consistencyReport: normalizeTextFieldValue(raw.consistencyReport),
    overviewSummary: normalizeTextFieldValue(raw.overviewSummary ?? raw.summary),
  };
}
