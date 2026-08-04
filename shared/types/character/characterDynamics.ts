export type CharacterCandidateStatus = "pending" | "confirmed" | "merged" | "rejected";
export type DynamicCharacterRiskLevel = "none" | "info" | "warn" | "high";

export interface CharacterCandidate {
  id: string;
  novelId: string;
  sourceChapterId?: string | null;
  sourceChapterOrder?: number | null;
  proposedName: string;
  proposedRole?: string | null;
  summary?: string | null;
  evidence: string[];
  matchedCharacterId?: string | null;
  status: CharacterCandidateStatus;
  confidence?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterVolumeAssignment {
  id: string;
  novelId: string;
  characterId: string;
  volumeId: string;
  volumeTitle?: string | null;
  roleLabel?: string | null;
  responsibility: string;
  appearanceExpectation?: string | null;
  plannedChapterOrders: number[];
  isCore: boolean;
  absenceWarningThreshold: number;
  absenceHighRiskThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterFactionTrack {
  id: string;
  novelId: string;
  characterId: string;
  volumeId?: string | null;
  volumeTitle?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  factionLabel: string;
  stanceLabel?: string | null;
  summary?: string | null;
  sourceType: string;
  confidence?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterRelationStage {
  id: string;
  novelId: string;
  relationId?: string | null;
  sourceCharacterId: string;
  targetCharacterId: string;
  sourceCharacterName?: string | null;
  targetCharacterName?: string | null;
  volumeId?: string | null;
  volumeTitle?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  stageLabel: string;
  stageSummary: string;
  nextTurnPoint?: string | null;
  sourceType: string;
  confidence?: number | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DynamicCharacterOverviewItem {
  characterId: string;
  name: string;
  role: string;
  castRole?: string | null;
  currentState?: string | null;
  currentGoal?: string | null;
  volumeRoleLabel?: string | null;
  volumeResponsibility?: string | null;
  isCoreInVolume: boolean;
  plannedChapterOrders: number[];
  appearanceCount: number;
  lastAppearanceChapterOrder?: number | null;
  absenceSpan: number;
  absenceRisk: DynamicCharacterRiskLevel;
  factionLabel?: string | null;
  stanceLabel?: string | null;
}

export interface DynamicCharacterCurrentVolume {
  id?: string | null;
  title: string;
  sortOrder?: number | null;
  startChapterOrder?: number | null;
  endChapterOrder?: number | null;
  currentChapterOrder?: number | null;
}

export interface DynamicCharacterOverview {
  novelId: string;
  currentVolume: DynamicCharacterCurrentVolume | null;
  summary: string;
  pendingCandidateCount: number;
  characters: DynamicCharacterOverviewItem[];
  relations: CharacterRelationStage[];
  candidates: CharacterCandidate[];
  factionTracks: CharacterFactionTrack[];
  assignments: CharacterVolumeAssignment[];
}
