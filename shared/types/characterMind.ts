export type CharacterMindSnapshotSource = "bootstrap" | "artifact_delta" | "manual_refresh";

export interface CharacterMindSnapshot {
  id: string;
  novelId: string;
  characterId: string;
  sourceChapterId?: string | null;
  sourceChapterOrder?: number | null;
  sourceChapterTitle?: string | null;
  sourceType: CharacterMindSnapshotSource;
  currentInterpretation: string;
  privateIntent?: string | null;
  activePlan?: string | null;
  emotionalStance?: string | null;
  actionTendency?: string | null;
  decisionTrigger?: string | null;
  beliefs: string[];
  misbeliefs: string[];
  evidence: string[];
  confidence?: number | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}
