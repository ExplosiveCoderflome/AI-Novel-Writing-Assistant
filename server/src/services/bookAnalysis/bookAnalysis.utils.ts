import type {
  BookAnalysisEvidenceItem,
  BookAnalysisSection,
  BookAnalysisSectionKey,
} from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_SECTIONS, BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS } from "@ai-novel/shared/types/bookAnalysis";
import { normalizeBookAnalysisTimelineNodes } from "@ai-novel/shared/utils/bookAnalysisTimeline";
import {
  CHAPTER_HEADING_REGEX,
  CHUNK_OVERLAP_CHARS,
  DEFAULT_ANALYSIS_TEMPERATURE,
  MAX_ANALYSIS_MAX_TOKENS,
  MAX_SEGMENT_CHARS,
  MAX_SEGMENT_COUNT,
  MIN_ANALYSIS_MAX_TOKENS,
  MIN_CHAPTER_DETECTION_COUNT,
  MIN_SEGMENT_BODY_LENGTH,
  MIN_SEGMENT_CHARS,
  TARGET_SEGMENT_CHARS,
  UNLIMITED_NOTES_MAX_TOKENS_CACHE_KEY,
} from "./bookAnalysis.constants";
import type { SourceNote, SourceSegment } from "./bookAnalysis.types";

export const BOOK_ANALYSIS_STRUCTURED_ARRAY_LIMIT = 12;
export const BOOK_ANALYSIS_TIMELINE_NODE_LIMIT = 30;

export function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

export function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

export function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON object.");
  }
  return text.slice(first, last + 1);
}

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeTemperature(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ANALYSIS_TEMPERATURE;
  }
  return Math.min(2, Math.max(0, Number(value)));
}

export function normalizeMaxTokens(value: number | null | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(MAX_ANALYSIS_MAX_TOKENS, Math.max(MIN_ANALYSIS_MAX_TOKENS, Math.floor(Number(value))));
}

export function getNotesMaxTokens(sectionMaxTokens: number | undefined): number | undefined {
  if (typeof sectionMaxTokens !== "number" || !Number.isFinite(sectionMaxTokens)) {
    return undefined;
  }
  return Math.max(1200, Math.min(10_000, Math.floor(sectionMaxTokens * 0.6)));
}

export function getNotesMaxTokensCacheKey(sectionMaxTokens: number | undefined): number {
  return getNotesMaxTokens(sectionMaxTokens) ?? UNLIMITED_NOTES_MAX_TOKENS_CACHE_KEY;
}

function normalizeText(source: string): string {
  return source.replace(/\r\n?/g, "\n").trim();
}

export function compactExcerpt(source: string, maxChars = 110): string {
  const normalized = normalizeText(source);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trim()}...`;
}

export function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

export function toEvidenceList(value: unknown, sourceLabelFallback = ""): BookAnalysisEvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const excerpt = typeof row.excerpt === "string" ? row.excerpt.trim() : "";
      if (!label && !excerpt) {
        return null;
      }
      const sourceLabel = typeof row.sourceLabel === "string" ? row.sourceLabel.trim() : sourceLabelFallback;
      const fieldKey = typeof row.fieldKey === "string" ? row.fieldKey.trim() : "";
      const fieldIndex = Number.isInteger(row.fieldIndex) && Number(row.fieldIndex) >= 0
        ? Number(row.fieldIndex)
        : undefined;
      const chapterIndex = Number.isInteger(row.chapterIndex) && Number(row.chapterIndex) >= 0
        ? Number(row.chapterIndex)
        : undefined;
      const excerptOffsetRange = normalizeExcerptOffsetRange(row.excerptOffsetRange);
      return {
        label: label || "片段",
        excerpt: excerpt || "",
        sourceLabel: sourceLabel || "源文档",
        ...(fieldKey ? { fieldKey } : {}),
        ...(fieldIndex !== undefined ? { fieldIndex } : {}),
        ...(chapterIndex !== undefined ? { chapterIndex } : {}),
        ...(excerptOffsetRange ? { excerptOffsetRange } : {}),
      };
    })
    .filter((item): item is BookAnalysisEvidenceItem => Boolean(item))
    .slice(0, 24);
}

function normalizeExcerptOffsetRange(value: unknown): BookAnalysisEvidenceItem["excerptOffsetRange"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  if (!Number.isInteger(row.start) || !Number.isInteger(row.end)) {
    return undefined;
  }
  const start = Number(row.start);
  const end = Number(row.end);
  if (start < 0 || end <= start) {
    return undefined;
  }
  return { start, end };
}

export function normalizeBookAnalysisEvidence(
  sectionKey: BookAnalysisSectionKey,
  value: unknown,
  structuredData?: Record<string, unknown> | null,
): BookAnalysisEvidenceItem[] {
  const fieldSpecs = new Map(BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS[sectionKey].map((field) => [field.key, field]));
  return toEvidenceList(value).map((item) => {
    if (!item.fieldKey) {
      const { fieldKey: _fieldKey, fieldIndex: _fieldIndex, ...rest } = item;
      return rest;
    }
    const fieldSpec = fieldSpecs.get(item.fieldKey);
    if (!fieldSpec) {
      const { fieldKey: _fieldKey, fieldIndex: _fieldIndex, ...rest } = item;
      return rest;
    }
    if (fieldSpec.type === "string") {
      const { fieldIndex: _fieldIndex, ...rest } = item;
      return rest;
    }
    if (item.fieldIndex === undefined || !Number.isInteger(item.fieldIndex) || item.fieldIndex < 0) {
      const { fieldIndex: _fieldIndex, ...rest } = item;
      return rest;
    }
    const normalizedValue = structuredData?.[item.fieldKey];
    const maxIndex = Array.isArray(normalizedValue)
      ? normalizedValue.length
      : fieldSpec.type === "timelineNodeArray"
        ? BOOK_ANALYSIS_TIMELINE_NODE_LIMIT
        : BOOK_ANALYSIS_STRUCTURED_ARRAY_LIMIT;
    if (item.fieldIndex >= maxIndex) {
      const { fieldIndex: _fieldIndex, ...rest } = item;
      return rest;
    }
    return item;
  });
}

function detectChapterSegments(content: string): SourceSegment[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const headings: Array<{ lineIndex: number; heading: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.length > 80) {
      continue;
    }
    if (CHAPTER_HEADING_REGEX.test(line)) {
      headings.push({ lineIndex: index, heading: line });
    }
  }
  if (headings.length < MIN_CHAPTER_DETECTION_COUNT) {
    return [];
  }

  const segments: SourceSegment[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].lineIndex;
    const end = index + 1 < headings.length ? headings[index + 1].lineIndex : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    if (body.length < MIN_SEGMENT_BODY_LENGTH) {
      continue;
    }
    segments.push({
      label: headings[index].heading,
      content: body,
    });
  }
  return segments;
}

function mergeSegments(segments: SourceSegment[]): SourceSegment[] {
  if (segments.length <= MAX_SEGMENT_COUNT) {
    return segments;
  }
  const groupSize = Math.ceil(segments.length / MAX_SEGMENT_COUNT);
  const merged: SourceSegment[] = [];
  for (let index = 0; index < segments.length; index += groupSize) {
    const group = segments.slice(index, index + groupSize);
    if (group.length === 0) {
      continue;
    }
    const first = group[0];
    const last = group[group.length - 1];
    merged.push({
      label: `${first.label} ~ ${last.label}`,
      content: group.map((item) => item.content).join("\n\n"),
    });
  }
  return merged;
}

function splitIntoChunkSegments(content: string): SourceSegment[] {
  const normalized = normalizeText(content);
  const segments: SourceSegment[] = [];
  let start = 0;
  let order = 1;
  while (start < normalized.length) {
    const end = Math.min(start + TARGET_SEGMENT_CHARS, normalized.length);
    let boundary = end;
    if (end < normalized.length) {
      const candidate = normalized.lastIndexOf("\n", Math.min(start + MAX_SEGMENT_CHARS, normalized.length));
      if (candidate > start + MIN_SEGMENT_CHARS) {
        boundary = candidate;
      }
    }
    const chunk = normalized.slice(start, boundary).trim();
    if (chunk) {
      segments.push({
        label: `片段 ${order}`,
        content: chunk,
      });
      order += 1;
    }
    if (boundary >= normalized.length) {
      break;
    }
    start = Math.max(boundary - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return segments.slice(0, MAX_SEGMENT_COUNT);
}

export function buildSourceSegments(content: string): SourceSegment[] {
  const chapterSegments = detectChapterSegments(content);
  if (chapterSegments.length >= MIN_CHAPTER_DETECTION_COUNT) {
    return mergeSegments(chapterSegments);
  }
  return splitIntoChunkSegments(content);
}

function renderNoteField(label: string, values: string[]): string {
  return `${label}：${values.join("；") || "无"}`;
}

type SourceNoteStringListKey =
  | "plotPoints"
  | "timelineEvents"
  | "characters"
  | "worldbuilding"
  | "themes"
  | "styleTechniques"
  | "marketHighlights"
  | "readerSignals"
  | "weaknessSignals";

function normalizeStructuredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStructuredStringArrayWithMeta(value: unknown): {
  value: string[];
  truncated: boolean;
} {
  let items: string[] = [];
  if (Array.isArray(value)) {
    items = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } else if (typeof value === "string" && value.trim()) {
    items = [value.trim()];
  }
  return {
    value: items.slice(0, BOOK_ANALYSIS_STRUCTURED_ARRAY_LIMIT),
    truncated: items.length > BOOK_ANALYSIS_STRUCTURED_ARRAY_LIMIT,
  };
}

function normalizeStructuredTimelineNodeArrayWithMeta(value: unknown): {
  value: ReturnType<typeof normalizeBookAnalysisTimelineNodes>;
  truncated: boolean;
} {
  const items = normalizeBookAnalysisTimelineNodes(value, Number.MAX_SAFE_INTEGER);
  return {
    value: items.slice(0, BOOK_ANALYSIS_TIMELINE_NODE_LIMIT),
    truncated: items.length > BOOK_ANALYSIS_TIMELINE_NODE_LIMIT,
  };
}

export function normalizeBookAnalysisStructuredDataWithWarnings(
  sectionKey: BookAnalysisSectionKey,
  value: Record<string, unknown> | null,
): {
  structuredData: Record<string, unknown>;
  normalizationWarnings: string[];
} {
  const source = value && typeof value === "object" ? value : {};
  const normalized: Record<string, unknown> = {};
  const normalizationWarnings: string[] = [];
  for (const field of BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS[sectionKey]) {
    if (field.type === "string") {
      normalized[field.key] = normalizeStructuredString(source[field.key]);
      continue;
    }
    const result = field.type === "timelineNodeArray"
      ? normalizeStructuredTimelineNodeArrayWithMeta(source[field.key])
      : normalizeStructuredStringArrayWithMeta(source[field.key]);
    normalized[field.key] = result.value;
    if (result.truncated) {
      normalizationWarnings.push(field.key);
    }
  }
  return {
    structuredData: normalized,
    normalizationWarnings,
  };
}

export function normalizeBookAnalysisStructuredData(
  sectionKey: BookAnalysisSectionKey,
  value: Record<string, unknown> | null,
): Record<string, unknown> {
  return normalizeBookAnalysisStructuredDataWithWarnings(sectionKey, value).structuredData;
}

function getNoteFieldsForSection(sectionKey?: BookAnalysisSectionKey): Array<{
  label: string;
  key: SourceNoteStringListKey;
}> {
  switch (sectionKey) {
    case "plot_structure":
      return [
        { label: "剧情要点", key: "plotPoints" },
        { label: "时间线节点", key: "timelineEvents" },
        { label: "读者信号", key: "readerSignals" },
        { label: "短板信号", key: "weaknessSignals" },
      ];
    case "timeline":
      return [
        { label: "时间线节点", key: "timelineEvents" },
        { label: "剧情要点", key: "plotPoints" },
        { label: "人物信息", key: "characters" },
      ];
    case "character_system":
      return [
        { label: "人物信息", key: "characters" },
        { label: "剧情要点", key: "plotPoints" },
        { label: "主题信息", key: "themes" },
      ];
    case "worldbuilding":
      return [
        { label: "设定信息", key: "worldbuilding" },
        { label: "剧情要点", key: "plotPoints" },
        { label: "短板信号", key: "weaknessSignals" },
      ];
    case "themes":
      return [
        { label: "主题信息", key: "themes" },
        { label: "读者信号", key: "readerSignals" },
        { label: "短板信号", key: "weaknessSignals" },
      ];
    case "style_technique":
      return [
        { label: "文风技法", key: "styleTechniques" },
        { label: "读者信号", key: "readerSignals" },
        { label: "短板信号", key: "weaknessSignals" },
      ];
    case "market_highlights":
      return [
        { label: "商业卖点", key: "marketHighlights" },
        { label: "读者信号", key: "readerSignals" },
        { label: "短板信号", key: "weaknessSignals" },
        { label: "人物信息", key: "characters" },
      ];
    default:
      return [
        { label: "剧情要点", key: "plotPoints" },
        { label: "时间线节点", key: "timelineEvents" },
        { label: "人物信息", key: "characters" },
        { label: "设定信息", key: "worldbuilding" },
        { label: "主题信息", key: "themes" },
        { label: "文风技法", key: "styleTechniques" },
        { label: "商业卖点", key: "marketHighlights" },
        { label: "读者信号", key: "readerSignals" },
        { label: "短板信号", key: "weaknessSignals" },
      ];
  }
}

export function renderNotesForPrompt(notes: SourceNote[], sectionKey?: BookAnalysisSectionKey): string {
  return notes
    .map((note) => {
      const fieldLines = getNoteFieldsForSection(sectionKey).map((field) => {
        const value = note[field.key];
        return renderNoteField(field.label, Array.isArray(value) ? value : []);
      });
      const sections = [
        `## ${note.sourceLabel}`,
        `摘要：${note.summary}`,
        ...fieldLines,
        note.evidence.length > 0
          ? `证据摘录：\n${note.evidence.map((item) => `- ${item.label}：${item.excerpt}`).join("\n")}`
          : "证据摘录：无",
      ];
      return sections.join("\n");
    })
    .join("\n\n");
}

function hasAnySignal(note: SourceNote, keys: Array<keyof SourceNote>): boolean {
  return keys.some((key) => {
    const value = note[key];
    return Array.isArray(value) && value.length > 0;
  });
}

export function selectNotesForBookAnalysisSection(
  sectionKey: BookAnalysisSectionKey,
  notes: SourceNote[],
): SourceNote[] {
  if (notes.length === 0 || sectionKey === "overview") {
    return notes;
  }

  const sectionSignalKeys: Partial<Record<BookAnalysisSectionKey, Array<keyof SourceNote>>> = {
    plot_structure: ["plotPoints", "timelineEvents"],
    timeline: ["timelineEvents", "plotPoints"],
    character_system: ["characters"],
    worldbuilding: ["worldbuilding"],
    themes: ["themes", "readerSignals", "weaknessSignals"],
    style_technique: ["styleTechniques", "readerSignals", "weaknessSignals"],
    market_highlights: ["marketHighlights", "readerSignals", "weaknessSignals"],
  };

  const signalKeys = sectionSignalKeys[sectionKey];
  if (!signalKeys?.length) {
    return notes;
  }

  const selected = notes.filter((note) => hasAnySignal(note, signalKeys));
  return selected.length > 0 ? selected : notes;
}

export function getSectionTitle(sectionKey: BookAnalysisSectionKey): string {
  return BOOK_ANALYSIS_SECTIONS.find((item) => item.key === sectionKey)?.title ?? sectionKey;
}

export function getEffectiveContent(section: Pick<BookAnalysisSection, "editedContent" | "aiContent">): string {
  const edited = section.editedContent?.trim();
  if (edited) {
    return edited;
  }
  return section.aiContent?.trim() ?? "";
}

export function buildAnalysisSummaryFromContent(content: string): string | null {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }
  const withoutHeadings = normalized
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return withoutHeadings ? compactExcerpt(withoutHeadings, 160) : compactExcerpt(normalized, 160);
}

export function encodeStructuredData(value: Record<string, unknown> | null): string | null {
  if (!value) {
    return null;
  }
  return JSON.stringify(value);
}

export function encodeEvidence(value: BookAnalysisEvidenceItem[]): string | null {
  if (!value.length) {
    return null;
  }
  return JSON.stringify(value);
}

export function encodeNormalizationWarnings(value: string[] | null | undefined): string | null {
  if (!Array.isArray(value) || !value.length) {
    return null;
  }
  return JSON.stringify(Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))));
}

export function decodeStructuredData(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const parsed = safeParseJSON<Record<string, unknown> | null>(value, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function decodeEvidence(
  value: string | null,
  sectionKey?: BookAnalysisSectionKey,
  structuredData?: Record<string, unknown> | null,
): BookAnalysisEvidenceItem[] {
  if (!value) {
    return [];
  }
  const parsed = safeParseJSON<unknown[]>(value, []);
  return sectionKey ? normalizeBookAnalysisEvidence(sectionKey, parsed, structuredData) : toEvidenceList(parsed);
}

export function decodeNormalizationWarnings(value: string | null): string[] {
  if (!value) {
    return [];
  }
  const parsed = safeParseJSON<unknown[]>(value, []);
  return Array.from(new Set(parsed
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)));
}
