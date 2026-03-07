import type { LLMProvider } from "./llm";

export type BookAnalysisStatus = "draft" | "queued" | "running" | "succeeded" | "failed" | "archived";
export type BookAnalysisSectionStatus = "idle" | "running" | "succeeded" | "failed";
export type BookAnalysisSectionKey =
  | "overview"
  | "plot_structure"
  | "character_system"
  | "worldbuilding"
  | "themes"
  | "style_technique"
  | "market_highlights";

export const BOOK_ANALYSIS_SECTIONS: ReadonlyArray<{
  key: BookAnalysisSectionKey;
  title: string;
}> = [
  { key: "overview", title: "拆书总览" },
  { key: "plot_structure", title: "剧情结构" },
  { key: "character_system", title: "人物系统" },
  { key: "worldbuilding", title: "世界观与设定" },
  { key: "themes", title: "主题表达" },
  { key: "style_technique", title: "文风与技法" },
  { key: "market_highlights", title: "商业化卖点" },
];

export interface BookAnalysisEvidenceItem {
  label: string;
  excerpt: string;
  sourceLabel: string;
}

export interface BookAnalysisSection {
  id: string;
  analysisId: string;
  sectionKey: BookAnalysisSectionKey;
  title: string;
  status: BookAnalysisSectionStatus;
  aiContent?: string | null;
  editedContent?: string | null;
  notes?: string | null;
  structuredData?: Record<string, unknown> | null;
  evidence: BookAnalysisEvidenceItem[];
  frozen: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface BookAnalysis {
  id: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  documentFileName: string;
  documentVersionNumber: number;
  currentDocumentVersionId?: string | null;
  currentDocumentVersionNumber: number;
  isCurrentVersion: boolean;
  title: string;
  status: BookAnalysisStatus;
  summary?: string | null;
  provider?: LLMProvider | null;
  model?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  progress: number;
  lastError?: string | null;
  lastRunAt?: string | null;
  publishedDocumentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisDetail extends BookAnalysis {
  sections: BookAnalysisSection[];
}

export interface BookAnalysisPublishResult {
  analysisId: string;
  novelId: string;
  knowledgeDocumentId: string;
  knowledgeDocumentVersionNumber: number;
  bindingCount: number;
  publishedAt: string;
}
