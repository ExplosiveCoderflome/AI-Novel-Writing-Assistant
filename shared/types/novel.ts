export type NovelStatus = "draft" | "published";

export interface Novel {
  id: string;
  title: string;
  description?: string | null;
  status: NovelStatus;
  outline?: string | null;
  structuredOutline?: string | null;
  genreId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  title: string;
  content?: string | null;
  order: number;
  generationState?: ChapterGenerationState;
  hook?: string | null;
  expectation?: string | null;
  novelId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  personality?: string | null;
  background?: string | null;
  development?: string | null;
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

export interface NovelGenre {
  id: string;
  name: string;
  description?: string | null;
  template?: string | null;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TitleSuggestion {
  title: string;
  clickRate: number;
  style: "literary" | "conflict";
}

export interface StructuredOutlineVolume {
  volumeTitle: string;
  chapters: Array<{
    order: number;
    title: string;
    summary: string;
  }>;
}

export type ChapterGenerationState =
  | "planned"
  | "drafted"
  | "reviewed"
  | "repaired"
  | "approved"
  | "published";

export type PipelineJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface QualityScore {
  coherence: number;
  repetition: number;
  pacing: number;
  voice: number;
  engagement: number;
  overall: number;
}

export interface ReviewIssue {
  severity: "low" | "medium" | "high" | "critical";
  category: "coherence" | "repetition" | "pacing" | "voice" | "engagement" | "logic";
  evidence: string;
  fixSuggestion: string;
}

export interface NovelBible {
  id: string;
  novelId: string;
  coreSetting?: string | null;
  forbiddenRules?: string | null;
  mainPromise?: string | null;
  characterArcs?: string | null;
  worldRules?: string | null;
  rawContent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlotBeat {
  id: string;
  novelId: string;
  chapterOrder?: number | null;
  beatType: string;
  title: string;
  content: string;
  status: "planned" | "completed" | "skipped";
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  id: string;
  novelId: string;
  chapterId: string;
  summary: string;
  keyEvents?: string | null;
  characterStates?: string | null;
  hook?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsistencyFact {
  id: string;
  novelId: string;
  chapterId?: string | null;
  category: "world" | "character" | "timeline" | "plot" | "rule";
  content: string;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineJob {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  status: PipelineJobStatus;
  progress: number;
  completedCount: number;
  totalCount: number;
  retryCount: number;
  maxRetries: number;
  error?: string | null;
  payload?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
