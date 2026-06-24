import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";

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

export interface AggregatedEvidenceItem {
  sectionKey: BookAnalysisSectionKey;
  sectionTitle: string;
  label: string;
  excerpt: string;
  sourceLabel: string;
  chapterIndex?: number;
  excerptOffsetRange?: {
    start: number;
    end: number;
  };
}
