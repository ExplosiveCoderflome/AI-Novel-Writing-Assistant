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
  optimizePreview: boolean;
  saveSection: boolean;
  publish: boolean;
  createStyleProfile: boolean;
}

export interface BookAnalysisWorkspace {
  keyword: string;
  status: BookAnalysisStatus | "";
  selectedAnalysisId: string;
  selectedDocumentId: string;
  selectedVersionId: string;
  selectedNovelId: string;
  includeTimeline: boolean;
  llmConfig: LLMConfigState;
  sectionDrafts: Record<string, SectionDraft>;
  publishFeedback: string;
  styleProfileFeedback: string;
  lastPublishResult: BookAnalysisPublishResult | null;
  analyses: BookAnalysis[];
  selectedAnalysis?: BookAnalysisDetail;
  documentOptions: KnowledgeDocumentSummary[];
  novelOptions: NovelOption[];
  versionOptions: KnowledgeDocumentDetail["versions"];
  sourceDocument?: KnowledgeDocumentDetail;
  aggregatedEvidence: AggregatedEvidenceItem[];
  optimizingSectionKey: BookAnalysisSectionKey | null;
  pending: PendingState;
  setKeyword: (keyword: string) => void;
  setStatus: (status: BookAnalysisStatus | "") => void;
  setSelectedNovelId: (novelId: string) => void;
  setIncludeTimeline: (include: boolean) => void;
  setLlmConfig: (config: LLMConfigState) => void;
  selectDocument: (documentId: string) => void;
  selectVersion: (versionId: string) => void;
  openAnalysis: (analysisId: string, documentId: string) => void;
  createAnalysis: () => Promise<void>;
  copySelectedAnalysis: () => Promise<void>;
  rebuildAnalysis: (analysisId: string) => void;
  archiveAnalysis: (analysisId: string) => void;
  regenerateSection: (sectionKey: BookAnalysisSectionKey) => void;
  optimizeSectionPreview: (section: BookAnalysisSection) => Promise<void>;
  applySectionOptimizePreview: (section: BookAnalysisSection) => void;
  clearSectionOptimizePreview: (section: BookAnalysisSection) => void;
  saveSection: (section: BookAnalysisSection) => void;
  downloadSelectedAnalysis: (format: ExportFormat) => Promise<void>;
  publishSelectedAnalysis: () => Promise<void>;
  createStyleProfileFromAnalysis: () => Promise<void>;
  updateSectionDraft: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  getSectionDraft: (section: BookAnalysisSection) => SectionDraft;
}
