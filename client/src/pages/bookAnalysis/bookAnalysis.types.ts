import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface SectionDraft {
  editedContent: string;
  notes: string;
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
  sectionTitle: string;
  label: string;
  excerpt: string;
  sourceLabel: string;
}
