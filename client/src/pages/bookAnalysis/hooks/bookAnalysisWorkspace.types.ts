import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisPreset,
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { DocumentChapter, KnowledgeDocumentDetail, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import type { AggregatedEvidenceItem, LLMConfigState, SectionDraft } from "../bookAnalysis.types";

export type ExportFormat = "markdown" | "json";
export type BookAnalysisMode = "reference" | "diagnosis";
export type BookAnalysisSourceRangeDraft = { startChapterIndex: number; endChapterIndex: number } | null;

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
  loadCharacters: boolean;
  generateCharacters: boolean;
  createCharacter: boolean;
  updateCharacter: boolean;
  deleteCharacter: boolean;
  createDiagnosis: boolean;
}

export interface BookAnalysisWorkspace {
  analysisMode: BookAnalysisMode;
  keyword: string;
  status: BookAnalysisStatus | "";
  selectedAnalysisId: string;
  selectedDocumentId: string;
  selectedVersionId: string;
  selectedNovelId: string;
  selectedDiagnosisNovelId: string;
  userFocusInstruction: string;
  selectedSourceRange: BookAnalysisSourceRangeDraft;
  budgetTokens: number | null;
  includeTimeline: boolean;
  analysisPreset: BookAnalysisPreset;
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
  sourceVersionContent: string;
  documentChapters: DocumentChapter[];
  sourceChapters: DocumentChapter[];
  sourceChaptersRequested: boolean;
  sourceChaptersLoading: boolean;
  sourceChaptersError: string;
  characters: BookAnalysisCharacter[];
  aggregatedEvidence: AggregatedEvidenceItem[];
  optimizingSectionKey: BookAnalysisSectionKey | null;
  pending: PendingState;
  setKeyword: (keyword: string) => void;
  setStatus: (status: BookAnalysisStatus | "") => void;
  setAnalysisMode: (mode: BookAnalysisMode) => void;
  setSelectedNovelId: (novelId: string) => void;
  setSelectedDiagnosisNovelId: (novelId: string) => void;
  setUserFocusInstruction: (instruction: string) => void;
  setSelectedSourceRange: (range: BookAnalysisSourceRangeDraft) => void;
  setBudgetTokens: (budgetTokens: number | null) => void;
  requestSourceChapters: () => void;
  setIncludeTimeline: (include: boolean) => void;
  setAnalysisPreset: (preset: BookAnalysisPreset) => void;
  setLlmConfig: (config: LLMConfigState) => void;
  selectDocument: (documentId: string) => void;
  selectVersion: (versionId: string) => void;
  openAnalysis: (analysisId: string, documentId: string) => void;
  createAnalysis: () => Promise<void>;
  createDiagnosisAnalysis: () => Promise<void>;
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
  generateCharacters: (input: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
    characterNames?: string[];
  }) => Promise<void>;
  createCharacter: (input: {
    name: string;
    role: string;
    profile?: Partial<CharacterProfile>;
    generationDepth?: BookAnalysisCharacterGenerationDepth;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  }) => Promise<void>;
  updateCharacter: (
    characterId: string,
    input: {
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ) => Promise<void>;
  deleteCharacter: (characterId: string) => Promise<void>;
  updateSectionDraft: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  getSectionDraft: (section: BookAnalysisSection) => SectionDraft;
}
