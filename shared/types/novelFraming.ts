import type { LLMProvider } from "./llm";

export const BOOK_FRAMING_MAX_COMMERCIAL_TAGS = 6;
export const BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH = 20;

export interface BookFramingSuggestion {
  targetAudience: string;
  commercialTags: string[];
  competingFeel: string;
  bookSellingPoint: string;
  first30ChapterPromise: string;
}

export interface BookFramingSuggestionInput {
  title?: string;
  description?: string;
  genreLabel?: string;
  styleTone?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

function normalizeSingleCommercialTag(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH);
}

export function normalizeCommercialTags(input: string | string[] | null | undefined): string[] {
  const rawValues = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\n,，]/)
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of rawValues) {
    if (typeof item !== "string") {
      continue;
    }
    const next = normalizeSingleCommercialTag(item);
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    normalized.push(next);
    if (normalized.length >= BOOK_FRAMING_MAX_COMMERCIAL_TAGS) {
      break;
    }
  }
  return normalized;
}

export function parseCommercialTagsJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeCommercialTags(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function serializeCommercialTagsJson(input: string | string[] | null | undefined): string | null {
  const tags = normalizeCommercialTags(input);
  return tags.length > 0 ? JSON.stringify(tags) : null;
}

export function formatCommercialTagsInput(input: string | string[] | null | undefined): string {
  return normalizeCommercialTags(input).join("，");
}
