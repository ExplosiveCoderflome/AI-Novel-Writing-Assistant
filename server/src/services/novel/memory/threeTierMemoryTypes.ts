export type MemoryTier = "hot" | "warm" | "cold";

export interface HotMemoryPackage {
  sessionInstruction?: string;
  inlineFeedback?: string[];
  activeUserOverrides?: Record<string, unknown>;
}

export interface WarmMemoryPackage {
  rollingSummaries?: Array<{
    chapterOrder: number;
    chapterTitle: string;
    summary: string;
    keyPlotPoints?: string[];
    characterStates?: string;
  }>;
  recentCharacterArcMomentum?: string;
  plotPacingState?: string;
}

export interface ColdMemoryPackage {
  worldAxioms?: string[];
  characterImmutableRules?: string[];
  masterNovelOutline?: string;
  ragLoreKnowledge?: string;
}

export interface ThreeTierMemoryInput {
  hot?: HotMemoryPackage;
  warm?: WarmMemoryPackage;
  cold?: ColdMemoryPackage;
  totalTokenBudget?: number;
}

export interface MemoryBudgetSplit {
  hotMax: number;
  coldMax: number;
  warmMax: number;
}
