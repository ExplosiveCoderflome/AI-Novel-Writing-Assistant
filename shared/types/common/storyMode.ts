export type StoryModeConflictCeiling = "low" | "medium" | "high";

export interface StoryModeProfile {
  coreDrive: string;
  readerReward: string;
  progressionUnits: string[];
  allowedConflictForms: string[];
  forbiddenConflictForms: string[];
  conflictCeiling: StoryModeConflictCeiling;
  resolutionStyle: string;
  chapterUnit: string;
  volumeReward: string;
  mandatorySignals: string[];
  antiSignals: string[];
}

export interface NovelStoryMode {
  id: string;
  name: string;
  description?: string | null;
  template?: string | null;
  parentId?: string | null;
  profile: StoryModeProfile;
  createdAt: string;
  updatedAt: string;
}
