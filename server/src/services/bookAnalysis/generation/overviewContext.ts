import type { BookAnalysisOverviewContext, SectionGenerationResult } from "../bookAnalysis.types";
import {
  buildAnalysisSummaryFromContent,
  decodeStructuredData,
  getEffectiveContent,
} from "../bookAnalysis.utils";

function readStructuredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStructuredStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function buildOverviewContext(generated: SectionGenerationResult): BookAnalysisOverviewContext | null {
  return buildOverviewContextFromData(generated.markdown, generated.structuredData);
}

export function buildOverviewContextFromSection(section: {
  aiContent: string | null;
  editedContent: string | null;
  structuredDataJson: string | null;
} | undefined): BookAnalysisOverviewContext | null {
  if (!section) {
    return null;
  }
  return buildOverviewContextFromData(
    getEffectiveContent(section),
    decodeStructuredData(section.structuredDataJson),
  );
}

function buildOverviewContextFromData(
  markdown: string,
  rawStructuredData: Record<string, unknown> | null | undefined,
): BookAnalysisOverviewContext | null {
  const structuredData = rawStructuredData && typeof rawStructuredData === "object"
    ? rawStructuredData
    : {};
  const context: BookAnalysisOverviewContext = {
    markdownSummary: buildAnalysisSummaryFromContent(markdown) ?? undefined,
    oneLinePositioning: readStructuredString(structuredData.oneLinePositioning),
    genreTags: readStructuredStringArray(structuredData.genreTags),
    sellingPointTags: readStructuredStringArray(structuredData.sellingPointTags),
    targetReaders: readStructuredStringArray(structuredData.targetReaders),
    strengths: readStructuredStringArray(structuredData.strengths),
    weaknesses: readStructuredStringArray(structuredData.weaknesses),
  };
  const hasSignal = Boolean(context.markdownSummary)
    || Boolean(context.oneLinePositioning)
    || context.genreTags.length > 0
    || context.sellingPointTags.length > 0
    || context.targetReaders.length > 0
    || context.strengths.length > 0
    || context.weaknesses.length > 0;
  return hasSignal ? context : null;
}
