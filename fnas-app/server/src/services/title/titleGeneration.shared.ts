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

type TitleSuggestionHookType =
  | "identity_gap"
  | "abnormal_situation"
  | "power_mutation"
  | "rule_hook"
  | "direct_conflict"
  | "high_concept";

export type TitleSurfaceFrame =
  | "contrast_then_self"
  | "setting_then_self"
  | "scenario_then_self"
  | "self_split"
  | "colon_split"
  | "when_open"
  | "setting_open"
  | "self_open"
  | "genre_open"
  | "comma_split"
  | "plain_statement";

interface NormalizedTitleSuggestion extends TitleFactorySuggestion {
  surfaceFrame: TitleSurfaceFrame;
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

const HOOK_TYPE_TO_STYLE: Record<TitleSuggestionHookType, TitleSuggestionStyle> = {
  identity_gap: "conflict",
  abnormal_situation: "suspense",
  power_mutation: "high_concept",
  rule_hook: "suspense",
  direct_conflict: "conflict",
  high_concept: "high_concept",
};

const GENRE_OPENING_PATTERN =
  /^(末日|丧尸|诡异|规则|全球|全民|深海|废土|星际|高武|修仙|历史|天灾|国运|灾变|怪谈)/u;
const SELF_SPLIT_PATTERN = /^我.+[，,]/u;
const SCENARIO_THEN_SELF_PATTERN =
  /^[^，,：:]+[，,](我|我的|我能|我有|我靠|我用|我让|我把|我开局|我却|我直接|我只要)/u;
const CONTRAST_THEN_SELF_PATTERN =
  /^(别人|全网|所有人|世人|诸天|满朝|全校|全班|全服).+[，,](我|我的|我能|我有|我靠|我开局|我却|我直接)/u;
const SETTING_THEN_SELF_PATTERN = /^在.+[，,](我|我的|我能|我有|我靠|我开局|我却|我直接)/u;

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

function normalizeHookType(value: unknown): TitleSuggestionHookType | null {
  const key = toTrimmedString(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(HOOK_TYPE_TO_STYLE, key)) {
    return key as TitleSuggestionHookType;
  }
  return null;
}

export function normalizeStyle(value: unknown, hookType?: unknown): TitleSuggestionStyle {
  const key = toTrimmedString(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (key && STYLE_ALIASES[key]) {
    return STYLE_ALIASES[key];
  }

  const normalizedHookType = normalizeHookType(hookType);
  if (normalizedHookType) {
    return HOOK_TYPE_TO_STYLE[normalizedHookType];
  }

  return "high_concept";
}

export function normalizeTitle(raw: string): string {
  return raw
    .replace(/^[\d.\-\s、]+/u, "")
    .replace(/^["'“”‘’《》〈〉「」『』【】]+|["'“”‘’《》〈〉「」『』【】]+$/gu, "")
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

function canonicalizeTitleFrame(title: string): string {
  return normalizeTitle(title)
    .replace(/,/g, "，")
    .replace(/:/g, "：");
}

export function detectTitleSurfaceFrame(title: string): TitleSurfaceFrame {
  const normalized = canonicalizeTitleFrame(title);
  if (!normalized) {
    return "plain_statement";
  }

  if (CONTRAST_THEN_SELF_PATTERN.test(normalized)) {
    return "contrast_then_self";
  }
  if (SETTING_THEN_SELF_PATTERN.test(normalized)) {
    return "setting_then_self";
  }
  if (SELF_SPLIT_PATTERN.test(normalized)) {
    return "self_split";
  }
  if (SCENARIO_THEN_SELF_PATTERN.test(normalized)) {
    return "scenario_then_self";
  }
  if (normalized.includes("：")) {
    return "colon_split";
  }
  if (/^当/u.test(normalized)) {
    return "when_open";
  }
  if (/^在/u.test(normalized)) {
    return "setting_open";
  }
  if (/^我/u.test(normalized)) {
    return "self_open";
  }
  if (normalized.includes("，")) {
    return "comma_split";
  }
  if (GENRE_OPENING_PATTERN.test(normalized)) {
    return "genre_open";
  }
  return "plain_statement";
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

function sanitizeSuggestion(value: unknown): NormalizedTitleSuggestion | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as {
    title?: unknown;
    clickRate?: unknown;
    score?: unknown;
    style?: unknown;
    hookType?: unknown;
    angle?: unknown;
    coreSell?: unknown;
    reason?: unknown;
  };

  const title = normalizeTitle(toTrimmedString(record.title));
  const normalizedLength = titleLength(title);
  if (!title || normalizedLength < 4 || normalizedLength > 26) {
    return null;
  }

  return {
    title,
    clickRate: clampClickRate(record.clickRate ?? record.score),
    style: normalizeStyle(record.style, record.hookType),
    angle: normalizeShortText(record.angle ?? record.coreSell, 20),
    reason: normalizeShortText(record.reason, 72),
    surfaceFrame: detectTitleSurfaceFrame(title),
  };
}

function maximumPatternShare(targetCount: number): number {
  return Math.max(2, Math.ceil(targetCount * 0.4));
}

export function maximumFrameClusterSize(targetCount: number): number {
  return maximumPatternShare(targetCount);
}

export function minimumStyleVariety(count: number): number {
  return count >= 10 ? 4 : 3;
}

export function minimumStructuralVariety(count: number): number {
  if (count >= 12) {
    return 5;
  }
  if (count >= 8) {
    return 4;
  }
  if (count >= 5) {
    return 3;
  }
  return 2;
}

export function collectUniqueSuggestions(
  values: unknown[],
  count: number,
  blockedTitles: string[] = [],
): TitleFactorySuggestion[] {
  const blocked = blockedTitles.map((item) => normalizeTitle(item)).filter(Boolean);
  const suggestions: NormalizedTitleSuggestion[] = [];
  const frameCounts = new Map<TitleSurfaceFrame, number>();
  const maxPerFrame = maximumFrameClusterSize(count);

  for (const item of values) {
    const normalized = sanitizeSuggestion(item);
    if (!normalized) {
      continue;
    }
    if (blocked.some((blockedTitle) => isNearDuplicateTitle(blockedTitle, normalized.title))) {
      continue;
    }
    if (suggestions.some((existing) => isNearDuplicateTitle(existing.title, normalized.title))) {
      continue;
    }

    const currentFrameCount = frameCounts.get(normalized.surfaceFrame) ?? 0;
    if (currentFrameCount >= maxPerFrame) {
      continue;
    }

    suggestions.push(normalized);
    frameCounts.set(normalized.surfaceFrame, currentFrameCount + 1);

    if (suggestions.length >= count) {
      break;
    }
  }

  return suggestions
    .sort((left, right) => right.clickRate - left.clickRate)
    .map(({ surfaceFrame, ...suggestion }) => suggestion);
}

export function hasEnoughStyleVariety(items: TitleFactorySuggestion[], targetCount: number): boolean {
  const styles = new Set(items.map((item) => item.style));
  return styles.size >= minimumStyleVariety(targetCount);
}

export function hasEnoughStructuralVariety(items: TitleFactorySuggestion[], targetCount: number): boolean {
  if (items.length === 0) {
    return false;
  }

  const frameCounts = new Map<TitleSurfaceFrame, number>();
  for (const item of items) {
    const frame = detectTitleSurfaceFrame(item.title);
    frameCounts.set(frame, (frameCounts.get(frame) ?? 0) + 1);
  }

  const uniqueFrameCount = frameCounts.size;
  const dominantFrameCount = Math.max(...frameCounts.values());

  return uniqueFrameCount >= minimumStructuralVariety(targetCount)
    && dominantFrameCount <= maximumFrameClusterSize(targetCount);
}
