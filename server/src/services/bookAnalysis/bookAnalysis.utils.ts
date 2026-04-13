import type { BookAnalysisEvidenceItem, BookAnalysisSection, BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
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
      return {
        label: label || "片段",
        excerpt: excerpt || "",
        sourceLabel: sourceLabel || "源文档",
      };
    })
    .filter((item): item is BookAnalysisEvidenceItem => Boolean(item))
    .slice(0, 24);
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

export function renderNotesForPrompt(notes: SourceNote[]): string {
  return notes
    .map((note) => {
      const readerSignals = note.readerSignals ?? [];
      const weaknessSignals = note.weaknessSignals ?? [];
      const sections = [
        `## ${note.sourceLabel}`,
        `摘要：${note.summary}`,
        `剧情要点：${note.plotPoints.join("；") || "无"}`,
        `时间线节点：${note.timelineEvents.join("；") || "无"}`,
        `人物信息：${note.characters.join("；") || "无"}`,
        `设定信息：${note.worldbuilding.join("；") || "无"}`,
        `主题信息：${note.themes.join("；") || "无"}`,
        `文风技法：${note.styleTechniques.join("；") || "无"}`,
        `商业卖点：${note.marketHighlights.join("；") || "无"}`,
        `读者信号：${readerSignals.join("；") || "无"}`,
        `短板信号：${weaknessSignals.join("；") || "无"}`,
        note.evidence.length > 0
          ? `证据摘录：\n${note.evidence.map((item) => `- ${item.label}：${item.excerpt}`).join("\n")}`
          : "证据摘录：无",
      ];
      return sections.join("\n");
    })
    .join("\n\n");
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

export function decodeStructuredData(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const parsed = safeParseJSON<Record<string, unknown> | null>(value, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function decodeEvidence(value: string | null): BookAnalysisEvidenceItem[] {
  if (!value) {
    return [];
  }
  return toEvidenceList(safeParseJSON<unknown[]>(value, []));
}
