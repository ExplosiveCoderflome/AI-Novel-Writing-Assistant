import type {
  AIFreedom,
  EmotionIntensity,
  NarrativePov,
  Novel,
  PacePreference,
  ProjectMode,
  ProjectProgressStatus,
  StoryPlanLevel,
} from "./novel";
import type { LLMProvider } from "./llm";
import type { BookAnalysisSectionKey } from "./bookAnalysis";
import type { StoryMacroPlan } from "./storyMacro";

export const DIRECTOR_CORRECTION_PRESETS = [
  {
    value: "more_hooky",
    label: "更抓人一点",
    description: "提高开篇钩子和阶段性反馈，让故事更有追更驱动力。",
    promptHint: "强化开篇抓力、爽感回报和追更钩子。",
  },
  {
    value: "stronger_conflict",
    label: "冲突更强",
    description: "让主角目标与阻力更直接对撞，减少温吞推进。",
    promptHint: "提升主线矛盾强度，让推进更紧更直接。",
  },
  {
    value: "sharper_protagonist",
    label: "主角更鲜明",
    description: "突出主角身份、欲望和人格标签，让人物更好记。",
    promptHint: "增强主角辨识度、欲望驱动和人物标签。",
  },
  {
    value: "more_grounded",
    label: "更偏现实感",
    description: "增强行为合理性和生活质感，减少悬浮设定感。",
    promptHint: "补强现实质感、生活细节和行为逻辑。",
  },
  {
    value: "lighter_ending",
    label: "结局别太沉重",
    description: "保留力度，但避免过度压抑或纯悲观收束。",
    promptHint: "让结尾保留希望感，不要过度沉重。",
  },
] as const;

export type DirectorCorrectionPreset = typeof DIRECTOR_CORRECTION_PRESETS[number]["value"];

export interface BookSpec {
  storyInput: string;
  positioning: string;
  sellingPoint: string;
  coreConflict: string;
  protagonistPath: string;
  endingDirection: string;
  hookStrategy: string;
  progressionLoop: string;
  targetChapterCount: number;
}

export interface DirectorCandidate {
  id: string;
  workingTitle: string;
  logline: string;
  positioning: string;
  sellingPoint: string;
  coreConflict: string;
  protagonistPath: string;
  endingDirection: string;
  hookStrategy: string;
  progressionLoop: string;
  whyItFits: string;
  toneKeywords: string[];
  targetChapterCount: number;
}

export interface DirectorCandidateBatch {
  id: string;
  round: number;
  roundLabel: string;
  idea: string;
  refinementSummary?: string | null;
  presets: DirectorCorrectionPreset[];
  candidates: DirectorCandidate[];
  createdAt: string;
}

export interface DirectorLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface DirectorProjectContextInput {
  title?: string;
  description?: string;
  genreId?: string;
  worldId?: string;
  writingMode?: "original" | "continuation";
  projectMode?: ProjectMode;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  defaultChapterLength?: number;
  estimatedChapterCount?: number;
  projectStatus?: ProjectProgressStatus;
  storylineStatus?: ProjectProgressStatus;
  outlineStatus?: ProjectProgressStatus;
  resourceReadyScore?: number;
  sourceNovelId?: string;
  sourceKnowledgeDocumentId?: string;
  continuationBookAnalysisId?: string;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[];
}

export interface DirectorCandidatesRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
}

export interface DirectorRefinementRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
  previousBatches: DirectorCandidateBatch[];
  presets?: DirectorCorrectionPreset[];
  feedback?: string;
}

export interface DirectorConfirmRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
  batchId?: string;
  round?: number;
  candidate: DirectorCandidate;
}

export interface DirectorPlanScene {
  title: string;
  objective: string;
  conflict?: string;
  reveal?: string;
  emotionBeat?: string;
}

export interface DirectorChapterSeed {
  title: string;
  objective: string;
  expectation: string;
  planRole: "setup" | "progress" | "pressure" | "turn" | "payoff" | "cooldown";
  hookTarget?: string;
  participants: string[];
  reveals: string[];
  riskNotes: string[];
  mustAdvance: string[];
  mustPreserve: string[];
  scenes: DirectorPlanScene[];
}

export interface DirectorArcSeed {
  title: string;
  objective: string;
  summary: string;
  phaseLabel: string;
  hookTarget?: string;
  participants: string[];
  reveals: string[];
  riskNotes: string[];
  chapters: DirectorChapterSeed[];
}

export interface DirectorPlanBlueprint {
  bookPlan: {
    title: string;
    objective: string;
    hookTarget?: string;
    participants: string[];
    reveals: string[];
    riskNotes: string[];
  };
  arcs: DirectorArcSeed[];
}

export interface DirectorPlanDigest {
  level: StoryPlanLevel;
  id: string;
  title: string;
  objective: string;
  chapterId?: string | null;
  externalRef?: string | null;
  rawPlanJson?: string | null;
}

export interface DirectorConfirmResponse {
  novel: Novel;
  storyMacroPlan: StoryMacroPlan;
  bookSpec: BookSpec;
  batch: {
    id?: string;
    round?: number;
  };
  createdChapterCount: number;
  createdArcCount: number;
  plans: {
    book: DirectorPlanDigest | null;
    arcs: DirectorPlanDigest[];
    chapters: DirectorPlanDigest[];
  };
}

export interface DirectorCandidatesResponse {
  batch: DirectorCandidateBatch;
}

export interface DirectorRefineResponse {
  batch: DirectorCandidateBatch;
}

export interface DirectorConfirmApiResponse extends DirectorConfirmResponse {
  seededPlans: {
    book: DirectorPlanDigest | null;
    arcs: DirectorPlanDigest[];
    chapters: DirectorPlanDigest[];
  };
}
