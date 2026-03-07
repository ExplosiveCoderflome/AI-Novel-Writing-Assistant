import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type { KnowledgeDocumentDetail, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import type { AggregatedEvidenceItem, LLMConfigState, SectionDraft } from "../bookAnalysis.types";

export type ExportFormat = "markdown" | "json";

export interface NovelOption {
  id: string;
  title: string;
}

export interface PendingState {
  create: boolean;
  copy: boolean;
  rebuild: boolean;
  archive: boolean;
  regenerate: boolean;
  saveSection: boolean;
  publish: boolean;
}

export interface BookAnalysisWorkspace {
  keyword: string;
  status: BookAnalysisStatus | "";
  selectedAnalysisId: string;
  selectedDocumentId: string;
  selectedVersionId: string;
  selectedNovelId: string;
  llmConfig: LLMConfigState;
  sectionDrafts: Record<string, SectionDraft>;
  publishFeedback: string;
  lastPublishResult: BookAnalysisPublishResult | null;
  analyses: BookAnalysis[];
  selectedAnalysis?: BookAnalysisDetail;
  documentOptions: KnowledgeDocumentSummary[];
  novelOptions: NovelOption[];
  versionOptions: KnowledgeDocumentDetail["versions"];
  sourceDocument?: KnowledgeDocumentDetail;
  aggregatedEvidence: AggregatedEvidenceItem[];
  pending: PendingState;
  setKeyword: (keyword: string) => void;
  setStatus: (status: BookAnalysisStatus | "") => void;
  setSelectedNovelId: (novelId: string) => void;
  setLlmConfig: (config: LLMConfigState) => void;
  selectDocument: (documentId: string) => void;
  selectVersion: (versionId: string) => void;
  openAnalysis: (analysisId: string, documentId: string) => void;
  createAnalysis: () => Promise<void>;
  copySelectedAnalysis: () => Promise<void>;
  rebuildAnalysis: (analysisId: string) => void;
  archiveAnalysis: (analysisId: string) => void;
  regenerateSection: (sectionKey: BookAnalysisSectionKey) => void;
  saveSection: (section: BookAnalysisSection) => void;
  downloadSelectedAnalysis: (format: ExportFormat) => Promise<void>;
  publishSelectedAnalysis: () => Promise<void>;
  updateSectionDraft: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  getSectionDraft: (section: BookAnalysisSection) => SectionDraft;
}
