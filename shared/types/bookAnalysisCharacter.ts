import type { BookAnalysisEvidenceItem } from "./bookAnalysis";
import type { CharacterProfile } from "./characterProfile";

export type BookAnalysisCharacterGenerationDepth = "quick" | "standard" | "deep";

export type BookAnalysisCharacterDimension =
  | "basic"
  | "appearance"
  | "personality"
  | "motivation"
  | "arc"
  | "relations"
  | "scenes";

export interface BookAnalysisCharacterArc {
  id: string;
  characterId: string;
  chapterIndex?: number | null;
  stageLabel: string;
  stateSnapshot?: Record<string, unknown> | null;
  evidence: BookAnalysisEvidenceItem[];
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
  evidence: BookAnalysisEvidenceItem[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookAnalysisCharacter {
  id: string;
  analysisId: string;
  name: string;
  role: string;
  generationDepth: BookAnalysisCharacterGenerationDepth;
  selectedDimensions: BookAnalysisCharacterDimension[];
  profile: CharacterProfile;
  evidence: BookAnalysisEvidenceItem[];
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

export const BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS: Readonly<Record<BookAnalysisCharacterDimension, string>> = {
  basic: "基础信息",
  appearance: "外形维度",
  personality: "性格维度",
  motivation: "动机维度",
  arc: "弧线维度",
  relations: "关系维度",
  scenes: "场景表现",
};
