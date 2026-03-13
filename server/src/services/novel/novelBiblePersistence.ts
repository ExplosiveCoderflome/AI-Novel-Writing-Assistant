const NOVEL_BIBLE_TEXT_FIELDS = [
  "coreSetting",
  "forbiddenRules",
  "mainPromise",
  "characterArcs",
  "worldRules",
] as const;

type NovelBibleTextField = (typeof NOVEL_BIBLE_TEXT_FIELDS)[number];

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

function normalizeRawContent(raw: Record<string, unknown>): string {
  return JSON.stringify(raw);
}

function getAliasedField(record: Record<string, unknown>, field: NovelBibleTextField): unknown {
  switch (field) {
    case "coreSetting":
      return record.coreSetting ?? record.setting ?? record.core ?? null;
    case "forbiddenRules":
      return record.forbiddenRules ?? record.rules ?? record.forbidden ?? null;
    case "mainPromise":
      return record.mainPromise ?? record.promise ?? record.mainline ?? null;
    case "characterArcs":
      return record.characterArcs ?? record.characters ?? record.characterLines ?? null;
    case "worldRules":
      return record.worldRules ?? record.world ?? record.worldSetting ?? null;
    default:
      return record[field] ?? null;
  }
}

export interface PersistedNovelBiblePayload {
  coreSetting: string | null;
  forbiddenRules: string | null;
  mainPromise: string | null;
  characterArcs: string | null;
  worldRules: string | null;
  rawContent: string;
}

export function normalizeNovelBiblePayload(
  raw: Record<string, unknown>,
  fallbackTitle?: string,
): PersistedNovelBiblePayload {
  const normalized = NOVEL_BIBLE_TEXT_FIELDS.reduce((acc, field) => {
    acc[field] = normalizeTextFieldValue(getAliasedField(raw, field));
    return acc;
  }, {} as Record<NovelBibleTextField, string | null>);

  return {
    ...normalized,
    coreSetting:
      normalized.coreSetting
      ?? (fallbackTitle?.trim() ? `${fallbackTitle.trim()}的核心设定` : null),
    rawContent: normalizeRawContent(raw),
  };
}
