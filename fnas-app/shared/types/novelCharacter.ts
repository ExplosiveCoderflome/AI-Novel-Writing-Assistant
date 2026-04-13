import type { LLMProvider } from "./llm";

export type CharacterCastRole =
  | "protagonist"
  | "antagonist"
  | "ally"
  | "foil"
  | "mentor"
  | "love_interest"
  | "pressure_source"
  | "catalyst";

export type CharacterGender = "male" | "female" | "other" | "unknown";

export interface Character {
  id: string;
  name: string;
  role: string;
  gender?: CharacterGender | null;
  castRole?: CharacterCastRole | null;
  storyFunction?: string | null;
  relationToProtagonist?: string | null;
  personality?: string | null;
  background?: string | null;
  development?: string | null;
  outerGoal?: string | null;
  innerNeed?: string | null;
  fear?: string | null;
  wound?: string | null;
  misbelief?: string | null;
  secret?: string | null;
  moralLine?: string | null;
  firstImpression?: string | null;
  arcStart?: string | null;
  arcMidpoint?: string | null;
  arcClimax?: string | null;
  arcEnd?: string | null;
  currentState?: string | null;
  currentGoal?: string | null;
  lastEvolvedAt?: string | null;
  novelId: string;
  baseCharacterId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BaseCharacter {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  appearance?: string | null;
  weaknesses?: string | null;
  interests?: string | null;
  keyEvents?: string | null;
  tags: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterRelation {
  id: string;
  novelId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  sourceCharacterName?: string | null;
  targetCharacterName?: string | null;
  surfaceRelation: string;
  hiddenTension?: string | null;
  conflictSource?: string | null;
  secretAsymmetry?: string | null;
  dynamicLabel?: string | null;
  nextTurnPoint?: string | null;
  trustScore?: number | null;
  conflictScore?: number | null;
  intimacyScore?: number | null;
  dependencyScore?: number | null;
  evidence?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterCastOptionMember {
  id: string;
  optionId: string;
  sortOrder: number;
  name: string;
  role: string;
  gender: CharacterGender;
  castRole: CharacterCastRole;
  relationToProtagonist?: string | null;
  storyFunction: string;
  shortDescription?: string | null;
  outerGoal?: string | null;
  innerNeed?: string | null;
  fear?: string | null;
  wound?: string | null;
  misbelief?: string | null;
  secret?: string | null;
  moralLine?: string | null;
  firstImpression?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterCastOptionRelation {
  id: string;
  optionId: string;
  sortOrder: number;
  sourceName: string;
  targetName: string;
  surfaceRelation: string;
  hiddenTension?: string | null;
  conflictSource?: string | null;
  secretAsymmetry?: string | null;
  dynamicLabel?: string | null;
  nextTurnPoint?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterCastOption {
  id: string;
  novelId: string;
  title: string;
  summary: string;
  whyItWorks?: string | null;
  recommendedReason?: string | null;
  status: string;
  sourceStoryInput?: string | null;
  members: CharacterCastOptionMember[];
  relations: CharacterCastOptionRelation[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterCastApplyResult {
  optionId: string;
  createdCount: number;
  updatedCount: number;
  relationCount: number;
  characterIds: string[];
  primaryCharacterId?: string | null;
}

export interface CharacterCastOptionDeleteResult {
  deletedOptionId: string;
  deletedAppliedOption: boolean;
  remainingOptionCount: number;
}

export interface CharacterCastOptionClearResult {
  deletedCount: number;
  deletedAppliedCount: number;
  remainingOptionCount: number;
}

export type SupplementalCharacterGenerationMode = "linked" | "independent" | "auto";
export type SupplementalCharacterTargetCastRole = CharacterCastRole | "auto";

export interface SupplementalCharacterGenerateInput {
  mode?: SupplementalCharacterGenerationMode;
  anchorCharacterIds?: string[];
  targetCastRole?: SupplementalCharacterTargetCastRole;
  count?: number;
  userPrompt?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface SupplementalCharacterRelation {
  sourceName: string;
  targetName: string;
  surfaceRelation: string;
  hiddenTension?: string | null;
  conflictSource?: string | null;
  dynamicLabel?: string | null;
  nextTurnPoint?: string | null;
}

export interface SupplementalCharacterCandidate {
  name: string;
  role: string;
  gender: CharacterGender;
  castRole: CharacterCastRole;
  summary: string;
  storyFunction: string;
  relationToProtagonist?: string | null;
  personality?: string | null;
  background?: string | null;
  development?: string | null;
  outerGoal?: string | null;
  innerNeed?: string | null;
  fear?: string | null;
  wound?: string | null;
  misbelief?: string | null;
  secret?: string | null;
  moralLine?: string | null;
  firstImpression?: string | null;
  currentState?: string | null;
  currentGoal?: string | null;
  whyNow?: string | null;
  relations: SupplementalCharacterRelation[];
}

export interface SupplementalCharacterGenerationResult {
  mode: SupplementalCharacterGenerationMode;
  recommendedCount: number;
  planningSummary?: string | null;
  candidates: SupplementalCharacterCandidate[];
}

export interface SupplementalCharacterApplyResult {
  character: Character;
  relationCount: number;
}

export interface CharacterTimeline {
  id: string;
  novelId: string;
  characterId: string;
  chapterId?: string | null;
  chapterOrder?: number | null;
  title: string;
  content: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}
