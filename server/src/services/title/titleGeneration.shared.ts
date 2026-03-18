import type { TitleFactorySuggestion, TitleSuggestionStyle } from "@ai-novel/shared/types/title";

export type TitleGenerationMode = "brief" | "adapt" | "novel";

export interface TitlePromptContext {
  mode: TitleGenerationMode;
  count: number;
  brief: string;
  referenceTitle: string;
  novelTitle: string;
  currentTitle: string;
  genreName: string;
  genreDescription: string;
}

const STYLE_ALIASES: Record<string, TitleSuggestionStyle> = {
  literary: "literary",
  narrative: "literary",
  emotion: "literary",
  conflict: "conflict",
  explosive: "conflict",
  reversal: "conflict",
  suspense: "suspense",
  mystery: "suspense",
  thriller: "suspense",
  high_concept: "high_concept",
  highconcept: "high_concept",
  concept: "high_concept",
  setting: "high_concept",
  worldbuilding: "high_concept",
  hook: "high_concept",
};

export const DEFAULT_TITLE_COUNT = 12;
export const MIN_TITLE_COUNT = 3;
export const MAX_TITLE_COUNT = 24;

function sliceText(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("");
}

export function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return JSON.stringify(content ?? "");
  }
  return content.map((part) => {
    if (typeof part === "string") {
      return part;
    }
    if (typeof part === "object" && part !== null && "text" in part) {
      return toTrimmedString((part as { text?: unknown }).text);
    }
    return JSON.stringify(part);
  }).join("");
}

export function extractJsonPayload(source: string): string {
  const normalized = source.replace(/```json|```/gi, "").trim();
  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  const firstBracket = normalized.indexOf("[");
  const lastBracket = normalized.lastIndexOf("]");

  if (firstBracket >= 0 && lastBracket > firstBracket && (firstBrace < 0 || firstBracket < firstBrace)) {
    return normalized.slice(firstBracket, lastBracket + 1);
  }
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1);
  }
  throw new Error("模型输出异常：无法解析为合法 JSON。");
}

export function normalizeRequestedCount(value: unknown, fallback = DEFAULT_TITLE_COUNT): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(MAX_TITLE_COUNT, Math.max(MIN_TITLE_COUNT, Math.floor(numeric)));
}

export function clampClickRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 72;
  }
  return Math.min(99, Math.max(35, Math.round(value)));
}

export function normalizeStyle(value: unknown): TitleSuggestionStyle {
  const key = toTrimmedString(value).toLowerCase().replace(/[\s-]+/g, "_");
  return STYLE_ALIASES[key] ?? "high_concept";
}

export function normalizeTitle(raw: string): string {
  return raw
    .replace(/^[\d.\-、\s]+/u, "")
    .replace(/^["'“”‘’《》【】]+|["'“”‘’《》【】]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompareKey(title: string): string {
  return normalizeTitle(title)
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, "")
    .toLowerCase();
}

function titleLength(title: string): number {
  return Array.from(title).length;
}

function normalizeShortText(value: unknown, maxLength: number): string | null {
  const text = toTrimmedString(value).replace(/\s+/g, " ");
  if (!text) {
    return null;
  }
  return sliceText(text, maxLength);
}

function buildBiGramSet(source: string): Set<string> {
  const normalized = normalizeCompareKey(source);
  if (!normalized) {
    return new Set<string>();
  }
  if (normalized.length <= 2) {
    return new Set<string>([normalized]);
  }
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - 2; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function titleSimilarity(left: string, right: string): number {
  return jaccardSimilarity(buildBiGramSet(left), buildBiGramSet(right));
}

export function isNearDuplicateTitle(left: string, right: string): boolean {
  const leftKey = normalizeCompareKey(left);
  const rightKey = normalizeCompareKey(right);
  if (!leftKey || !rightKey) {
    return false;
  }
  if (leftKey === rightKey) {
    return true;
  }
  if ((leftKey.includes(rightKey) || rightKey.includes(leftKey)) && Math.abs(leftKey.length - rightKey.length) <= 2) {
    return true;
  }
  return titleSimilarity(leftKey, rightKey) >= 0.78;
}

function sanitizeSuggestion(value: unknown): TitleFactorySuggestion | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as {
    title?: unknown;
    clickRate?: unknown;
    style?: unknown;
    angle?: unknown;
    reason?: unknown;
  };

  const title = normalizeTitle(toTrimmedString(record.title));
  const normalizedLength = titleLength(title);
  if (!title || normalizedLength < 4 || normalizedLength > 26) {
    return null;
  }

  return {
    title,
    clickRate: clampClickRate(record.clickRate),
    style: normalizeStyle(record.style),
    angle: normalizeShortText(record.angle, 20),
    reason: normalizeShortText(record.reason, 72),
  };
}

export function collectUniqueSuggestions(
  values: unknown[],
  count: number,
  blockedTitles: string[] = [],
): TitleFactorySuggestion[] {
  const blocked = blockedTitles.map((item) => normalizeTitle(item)).filter(Boolean);
  const suggestions: TitleFactorySuggestion[] = [];

  for (const item of values) {
    const normalized = sanitizeSuggestion(item);
    if (!normalized) {
      continue;
    }
    if (blocked.some((item) => isNearDuplicateTitle(item, normalized.title))) {
      continue;
    }
    if (suggestions.some((item) => isNearDuplicateTitle(item.title, normalized.title))) {
      continue;
    }
    suggestions.push(normalized);
    if (suggestions.length >= count) {
      break;
    }
  }

  return suggestions.sort((left, right) => right.clickRate - left.clickRate);
}

export function minimumStyleVariety(count: number): number {
  return count >= 10 ? 4 : 3;
}

export function hasEnoughStyleVariety(items: TitleFactorySuggestion[], targetCount: number): boolean {
  const styles = new Set(items.map((item) => item.style));
  return styles.size >= minimumStyleVariety(targetCount);
}
