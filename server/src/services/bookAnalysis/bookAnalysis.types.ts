import type { BookAnalysisEvidenceItem, BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";

export type AnalysisTask =
  | { analysisId: string; kind: "full" }
  | { analysisId: string; kind: "section"; sectionKey: BookAnalysisSectionKey };

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
  evidence: BookAnalysisEvidenceItem[];
}

export interface SectionGenerationResult {
  markdown: string;
  structuredData: Record<string, unknown> | null;
  evidence: BookAnalysisEvidenceItem[];
}
