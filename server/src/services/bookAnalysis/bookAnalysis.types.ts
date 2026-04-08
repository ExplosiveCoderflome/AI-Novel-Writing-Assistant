import type { BookAnalysisEvidenceItem, BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";

export type AnalysisTask =
  | { analysisId: string; kind: "full" }
  | { analysisId: string; kind: "section"; sectionKey: BookAnalysisSectionKey };

export type BookAnalysisStage = "loading_cache" | "preparing_notes" | "generating_sections";

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
  evidence: BookAnalysisEvidenceItem[];
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
