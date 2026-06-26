import {
  BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS,
  type BookAnalysisDetail,
  type BookAnalysisEvidenceItem,
  type BookAnalysisSection,
  type BookAnalysisTimelineNode,
} from "@ai-novel/shared/types/bookAnalysis";
import type { RagChunkFacets, RagChunkFacetKey, RagPreChunk } from "../rag/chunkFacets";

const FIELD_FACET_MAP: Record<string, RagChunkFacetKey[]> = {
  genreTags: ["genreTags"],
  genreSellingPoints: ["genreTags", "sellingPointTags"],
  sellingPointTags: ["sellingPointTags"],
  hookPoints: ["sellingPointTags"],
  clickDrivers: ["sellingPointTags"],
  characterSellingPoints: ["sellingPointTags"],
  targetReaders: ["targetReaders"],
  targetReaderMatches: ["targetReaders"],
  strengths: ["strengths"],
  structureHighlights: ["strengths"],
  highlightDesigns: ["strengths"],
  characterHighlights: ["strengths"],
  settingHighlights: ["strengths"],
  hookDesigns: ["strengths"],
  reusablePatterns: ["strengths"],
  reusableTechniques: ["strengths"],
  weaknesses: ["weaknesses"],
  paceRisks: ["weaknesses"],
  tempoRisks: ["weaknesses"],
  clarityRisks: ["weaknesses"],
  settingRisks: ["weaknesses"],
  themeRisks: ["weaknesses"],
  commercialRisks: ["weaknesses"],
  protagonistPositioning: ["characterRole"],
  supportingFunctions: ["characterRole"],
  antagonistFunctions: ["characterRole"],
};

function normalizeTextList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") {
      const trimmed = item.trim();
      return trimmed ? [trimmed] : [];
    }
    if (item && typeof item === "object" && "label" in item) {
      const label = (item as Partial<BookAnalysisTimelineNode>).label;
      return typeof label === "string" && label.trim() ? [label.trim()] : [];
    }
    return [];
  }).slice(0, 12);
}

function pushFacetValues(facets: RagChunkFacets, key: RagChunkFacetKey, values: string[]): void {
  const normalized = values.map((item) => item.trim()).filter(Boolean).slice(0, 12);
  if (normalized.length === 0) {
    return;
  }
  const current = facets[key] ?? [];
  facets[key] = Array.from(new Set([...current, ...normalized])).slice(0, 12);
}

function buildFieldFacets(fieldKey: string, values: string[], evidence: BookAnalysisEvidenceItem[]): RagChunkFacets {
  const facets: RagChunkFacets = {};
  for (const facetKey of FIELD_FACET_MAP[fieldKey] ?? []) {
    pushFacetValues(facets, facetKey, values);
  }
  const chapterIndexes = evidence
    .map((item) => item.chapterIndex)
    .filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item >= 0)
    .map((item) => String(item));
  pushFacetValues(facets, "chapterAnchor", chapterIndexes);
  return facets;
}

function formatEvidenceLines(evidence: BookAnalysisEvidenceItem[]): string[] {
  return evidence.slice(0, 4).map((item) => {
    const chapterLabel = item.chapterIndex === undefined ? "" : `第 ${item.chapterIndex + 1} 章；`;
    return `- ${chapterLabel}${item.sourceLabel}｜${item.label}：${item.excerpt}`;
  });
}

function buildFieldChunk(section: BookAnalysisSection, fieldKey: string, value: unknown): RagPreChunk | null {
  const values = normalizeTextList(value);
  if (values.length === 0) {
    return null;
  }
  const label = BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[fieldKey] ?? fieldKey;
  const evidence = section.evidence.filter((item) => item.fieldKey === fieldKey);
  const firstEvidence = evidence.find((item) => item.chapterIndex !== undefined || item.excerptOffsetRange);
  const facets = buildFieldFacets(fieldKey, values, evidence);
  const chunkText = [
    `拆书小节：${section.title}`,
    `结构化字段：${label}`,
    `关键结论：${values.join("；")}`,
    evidence.length > 0 ? "证据摘录：" : "",
    ...formatEvidenceLines(evidence),
  ].filter(Boolean).join("\n");

  return {
    chunkText,
    facets,
    anchor: {
      sectionKey: section.sectionKey,
      fieldKey,
      ...(firstEvidence?.fieldIndex !== undefined ? { fieldIndex: firstEvidence.fieldIndex } : {}),
      ...(firstEvidence?.chapterIndex !== undefined ? { chapterIndex: firstEvidence.chapterIndex } : {}),
      ...(firstEvidence?.excerptOffsetRange ? { excerptOffsetRange: firstEvidence.excerptOffsetRange } : {}),
    },
    metadata: {
      source: "book_analysis_structured",
      sectionKey: section.sectionKey,
      sectionTitle: section.title,
      fieldKey,
      fieldLabel: label,
    },
  };
}

export function buildBookAnalysisRagPreChunks(detail: BookAnalysisDetail): RagPreChunk[] {
  const chunks: RagPreChunk[] = [];
  for (const section of detail.sections) {
    const structuredData = section.structuredData;
    if (!structuredData || typeof structuredData !== "object" || Array.isArray(structuredData)) {
      continue;
    }
    for (const [fieldKey, value] of Object.entries(structuredData)) {
      const chunk = buildFieldChunk(section, fieldKey, value);
      if (chunk) {
        chunks.push(chunk);
      }
    }
  }
  return chunks.slice(0, 120);
}
