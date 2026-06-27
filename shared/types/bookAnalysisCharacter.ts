import type { BookAnalysisEvidenceItem } from "./bookAnalysis";
import type { CharacterProfile } from "./characterProfile";
import type { ImageAsset } from "./image";

export type BookAnalysisCharacterGenerationDepth = "brief" | "standard" | "deep" | "exhaustive";
export type BookAnalysisCharacterStatus = "candidate" | "generating" | "generated" | "failed";

export type BookAnalysisCharacterDimension =
  | "basic"
  | "appearance"
  | "personality"
  | "capability"
  | "motivation"
  | "arc"
  | "relations"
  | "scenes"
  | "languageStyle"
  | "thinkingPattern"
  | "values"
  | "secrets";

export type BookAnalysisCharacterEvidenceSourceType = "notes" | "chapter_chunk";

export interface BookAnalysisCharacterEvidenceItem extends BookAnalysisEvidenceItem {
  sourceType?: BookAnalysisCharacterEvidenceSourceType;
  chunkId?: string;
  noteSegmentId?: string;
  quote?: string;
  dimension?: BookAnalysisCharacterDimension;
}

export interface BookAnalysisCharacterDepthMetadata {
  dimensions: Partial<Record<BookAnalysisCharacterDimension, {
    depth: BookAnalysisCharacterGenerationDepth;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    chunkIds?: string[];
    noteSegmentIds?: string[];
  }>>;
  totalTokens?: number;
  retrievalTraceIds?: string[];
  generatedAt?: string;
}

export interface BookAnalysisCharacterProfileSection {
  dimension: BookAnalysisCharacterDimension;
  title: string;
  depth: BookAnalysisCharacterGenerationDepth;
  content: string;
  evidence: BookAnalysisCharacterEvidenceItem[];
  updatedAt?: string;
}

export interface BookAnalysisCharacterArc {
  id: string;
  characterId: string;
  chapterIndex?: number | null;
  stageLabel: string;
  stateSnapshot?: Record<string, unknown> | null;
  evidence: BookAnalysisCharacterEvidenceItem[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacterScene {
  id: string;
  characterId: string;
  sceneLabel: string;
  sceneType?: string | null;
  performance?: Record<string, unknown> | null;
  evidence: BookAnalysisCharacterEvidenceItem[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacterAppearance {
  id: string;
  characterId: string;
  coveragePercent: number;
  consolidatedAppearance: Record<string, unknown> | null;
  variantPolicy: Record<string, unknown> | null;
  lastIndexedChapterIndex?: number | null;
  snapshots: BookAnalysisCharacterAppearanceSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacterAppearanceSnapshot {
  id: string;
  characterId: string;
  chapterIndex: number;
  chapterTitle?: string | null;
  appearance: Record<string, unknown> | null;
  evidence: BookAnalysisCharacterEvidenceItem[];
  summaryCaption?: string | null;
  contextSceneRefs: string[];
  manuallyEdited: boolean;
  images: BookAnalysisCharacterAppearanceImage[];
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacterAppearanceImage {
  id: string;
  snapshotId: string;
  generationTaskId?: string | null;
  imageAssetId?: string | null;
  imageAsset?: ImageAsset | null;
  imagePrompt: Record<string, unknown> | null;
  referenceAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacter {
  id: string;
  analysisId: string;
  name: string;
  role: string;
  status: BookAnalysisCharacterStatus;
  briefDescription?: string | null;
  importance?: string | null;
  occurringChapters?: string[];
  lastGenerationError?: string | null;
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  profile: CharacterProfile;
  evidence: BookAnalysisCharacterEvidenceItem[];
  depthMetadata: BookAnalysisCharacterDepthMetadata | null;
  profileSections: BookAnalysisCharacterProfileSection[];
  appearance?: BookAnalysisCharacterAppearance | null;
  arcs: BookAnalysisCharacterArc[];
  scenes: BookAnalysisCharacterScene[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacterGenerateInput {
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  characterNames?: string[];
}

export interface BookAnalysisCharacterIdentifyInput {
  limit?: number;
}

export interface BookAnalysisCharacterProfileGenerateInput {
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  dimensionsToRegenerate?: BookAnalysisCharacterDimension[];
}

export interface BookAnalysisCharacterAppearanceScanInput {
  targetPercent: number;
}

export interface BookAnalysisCharacterAppearanceImageGenerateInput {
  snapshotId: string;
  provider?: string;
  count?: number;
  stylePreset?: string;
}

export interface BookAnalysisCharacterBatchGenerateInput extends BookAnalysisCharacterProfileGenerateInput {
  includeFailed?: boolean;
}

export const BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS: Readonly<Record<BookAnalysisCharacterDimension, string>> = {
  basic: "基础信息",
  appearance: "外形维度",
  personality: "性格维度",
  capability: "能力维度",
  motivation: "动机维度",
  arc: "弧线维度",
  relations: "关系维度",
  scenes: "场景表现",
  languageStyle: "语言风格",
  thinkingPattern: "思维模式",
  values: "价值观",
  secrets: "秘密伏笔",
};
