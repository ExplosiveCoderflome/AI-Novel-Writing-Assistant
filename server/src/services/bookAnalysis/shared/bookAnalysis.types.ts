import type { BookAnalysisEvidenceItem, BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";

export type AnalysisTask =
  | { analysisId: string; kind: "full" }
  | { analysisId: string; kind: "section"; sectionKey: BookAnalysisSectionKey };

export type BookAnalysisStage = "loading_cache" | "preparing_notes" | "generating_overview" | "generating_sections";

export interface SourceSegment {
  label: string;
  content: string;
}

export interface SourceNote {
  sourceLabel: string;
  summary: string;
  plotPoints: string[];
  timelineEvents: string[];
  characters: string[];
  worldbuilding: string[];
  themes: string[];
  styleTechniques: string[];
  marketHighlights: string[];
  readerSignals: string[];
  weaknessSignals: string[];
  evidence: BookAnalysisEvidenceItem[];
}

export interface SectionGenerationResult {
  markdown: string;
  structuredData: Record<string, unknown> | null;
  normalizationWarnings: string[];
  evidence: BookAnalysisEvidenceItem[];
  tokenUsage?: LlmTokenUsageSnapshot | null;
}

export interface BookAnalysisOverviewContext {
  markdownSummary?: string;
  oneLinePositioning?: string;
  genreTags: string[];
  sellingPointTags: string[];
  targetReaders: string[];
  strengths: string[];
  weaknesses: string[];
}

export interface SourceNotesResult {
  notes: SourceNote[];
  segmentCount: number;
  cacheHit: boolean;
}

export interface BookAnalysisProgressUpdate {
  stage: BookAnalysisStage;
  progress: number;
  itemKey?: string | null;
  itemLabel?: string | null;
}
