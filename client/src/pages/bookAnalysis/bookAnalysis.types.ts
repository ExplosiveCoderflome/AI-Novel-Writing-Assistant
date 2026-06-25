import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BookAnalysisEvidenceItem, BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";

export interface SectionDraft {
  editedContent: string;
  notes: string;
  focusInstruction: string;
  frozen: boolean;
  optimizeInstruction: string;
  optimizePreview: string;
}

export interface LLMConfigState {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
}

export interface AggregatedEvidenceItem extends BookAnalysisEvidenceItem {
  sectionKey: BookAnalysisSectionKey;
  sectionTitle: string;
}

export interface SectionEvidenceItem extends AggregatedEvidenceItem {
  evidenceKey: string;
}
