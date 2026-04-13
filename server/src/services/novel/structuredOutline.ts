export interface StructuredOutlineChapter {
  chapter: number;
  title: string;
  summary: string;
  key_events: string[];
  roles: string[];
}

const REQUIRED_KEYS = ["chapter", "title", "summary", "key_events", "roles"] as const;

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONArray(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("Structured outline must be a JSON array.");
  }
  return text.slice(first, last + 1);
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function toRequiredString(value: unknown, label: string, index: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Structured outline item #${index + 1} is missing "${label}".`);
  }
  return value.trim();
}

function toStringArray(value: unknown, label: string, index: number): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Structured outline item #${index + 1} field "${label}" must be an array of strings.`);
  }
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  if (normalized.length === 0) {
    throw new Error(`Structured outline item #${index + 1} field "${label}" cannot be empty.`);
  }
  return normalized;
}

function normalizeChapterItem(raw: unknown, index: number): StructuredOutlineChapter {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Structured outline item #${index + 1} must be an object.`);
  }
  const record = raw as Record<string, unknown>;
  const extraKeys = Object.keys(record).filter((key) => !REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number]));
  if (extraKeys.length > 0) {
    throw new Error(`Structured outline item #${index + 1} contains unsupported keys: ${extraKeys.join(", ")}.`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) {
      throw new Error(`Structured outline item #${index + 1} is missing required key "${key}".`);
    }
  }
  const chapter = toPositiveInt(record.chapter);
  if (chapter === null) {
    throw new Error(`Structured outline item #${index + 1} field "chapter" must be a positive integer.`);
  }
  return {
    chapter,
    title: toRequiredString(record.title, "title", index),
    summary: toRequiredString(record.summary, "summary", index),
    key_events: toStringArray(record.key_events, "key_events", index),
    roles: toStringArray(record.roles, "roles", index),
  };
}

export function parseStrictStructuredOutline(rawText: string, expectedCount?: number): StructuredOutlineChapter[] {
  const jsonText = extractJSONArray(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error("Structured outline JSON parse failed.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Structured outline must be a non-empty JSON array.");
  }
  const chapters = parsed.map((item, index) => normalizeChapterItem(item, index));
  const chapterSet = new Set<number>();
  for (const item of chapters) {
    if (chapterSet.has(item.chapter)) {
      throw new Error(`Structured outline has duplicated chapter number: ${item.chapter}.`);
    }
    chapterSet.add(item.chapter);
  }
  chapters.sort((a, b) => a.chapter - b.chapter);
  if (typeof expectedCount === "number" && expectedCount > 0 && chapters.length !== expectedCount) {
    throw new Error(`Structured outline chapter count mismatch. Expected ${expectedCount}, got ${chapters.length}.`);
  }
  return chapters;
}

export function stringifyStructuredOutline(chapters: StructuredOutlineChapter[]): string {
  return JSON.stringify(chapters, null, 2);
}

export function toOutlineChapterRows(chapters: StructuredOutlineChapter[]): Array<{ order: number; title: string; summary: string }> {
  return chapters.map((item) => ({
    order: item.chapter,
    title: item.title,
    summary: item.summary,
  }));
}
