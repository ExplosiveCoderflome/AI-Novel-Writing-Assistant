import type {
  AIFreedom,
  EmotionIntensity,
  NarrativePov,
  Novel,
  PacePreference,
  PipelineJobStatus,
  ProjectMode,
  ProjectProgressStatus,
  StoryPlanLevel,
} from "./novel";
import type { LLMProvider } from "./llm";
import type { BookAnalysisSectionKey } from "./bookAnalysis";
import type { NovelWorkflowResumeTarget } from "./novelWorkflow";
import type { StoryMacroPlan } from "./storyMacro";
import type { BookContract, BookContractDraft } from "./novelWorkflow";
import type { TitleFactorySuggestion } from "./title";

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

export const DIRECTOR_CANDIDATE_SETUP_STEPS = [
  {
    key: "candidate_seed_alignment",
    label: "整理项目设定",
    description: "先把灵感、题材、目标读者和章节规模压成稳定输入。",
  },
  {
    key: "candidate_project_framing",
    label: "对齐书级 framing",
    description: "把书级卖点、前 30 章承诺和气质约束转成候选生成参考。",
  },
  {
    key: "candidate_direction_batch",
    label: "生成书级方案",
    description: "产出当前可继续推进整本规划的候选方向。",
  },
  {
    key: "candidate_title_pack",
    label: "强化标题组",
    description: "为每套候选补一组更适合封面展示和点击测试的书名。",
  },
] as const;

export type DirectorCandidateSetupStepKey = typeof DIRECTOR_CANDIDATE_SETUP_STEPS[number]["key"];

export const DIRECTOR_RUN_MODES = [
  "auto_to_ready",
  "auto_to_execution",
  "stage_review",
] as const;

export type DirectorRunMode = typeof DIRECTOR_RUN_MODES[number];

export type DirectorContinuationMode = "resume" | "auto_execute_front10";

export interface DirectorAutoExecutionState {
  enabled: boolean;
  startOrder?: number;
  endOrder?: number;
  totalChapterCount?: number;
  pipelineJobId?: string | null;
  pipelineStatus?: PipelineJobStatus | null;
}

export const DIRECTOR_TAKEOVER_START_PHASES = [
  "story_macro",
  "character_setup",
  "volume_strategy",
  "structured_outline",
] as const;

export type DirectorTakeoverStartPhase = typeof DIRECTOR_TAKEOVER_START_PHASES[number];

export const DIRECTOR_LOCK_SCOPES = [
  "basic",
  "story_macro",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
] as const;

export type DirectorLockScope = typeof DIRECTOR_LOCK_SCOPES[number];

export interface DirectorSessionState {
  runMode: DirectorRunMode;
  isBackgroundRunning: boolean;
  lockedScopes: DirectorLockScope[];
  phase:
    | "candidate_selection"
    | "story_macro"
    | "character_setup"
    | "volume_strategy"
    | "structured_outline"
    | "front10_ready";
  reviewScope?: DirectorLockScope | null;
}

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
  titleOptions?: TitleFactorySuggestion[];
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
  runMode?: DirectorRunMode;
}

export interface DirectorTakeoverStageReadiness {
  phase: DirectorTakeoverStartPhase;
  label: string;
  description: string;
  available: boolean;
  recommended: boolean;
  reason: string;
}

export interface DirectorTakeoverReadinessResponse {
  novelId: string;
  novelTitle: string;
  hasActiveTask: boolean;
  activeTaskId?: string | null;
  snapshot: {
    hasStoryMacroPlan: boolean;
    hasBookContract: boolean;
    characterCount: number;
    chapterCount: number;
    volumeCount: number;
    firstVolumeChapterCount: number;
  };
  stages: DirectorTakeoverStageReadiness[];
}

export interface DirectorTakeoverRequest extends DirectorLLMOptions {
  novelId: string;
  startPhase: DirectorTakeoverStartPhase;
}

export interface DirectorTakeoverResponse {
  novelId: string;
  workflowTaskId: string;
  startPhase: DirectorTakeoverStartPhase;
  directorSession: DirectorSessionState;
  resumeTarget?: NovelWorkflowResumeTarget | null;
}

export interface DirectorProjectContextInput {
  title?: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
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
  workflowTaskId?: string;
}

export interface DirectorRefinementRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
  previousBatches: DirectorCandidateBatch[];
  presets?: DirectorCorrectionPreset[];
  feedback?: string;
  workflowTaskId?: string;
}

export interface DirectorCandidatePatchRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
  previousBatches: DirectorCandidateBatch[];
  batchId: string;
  candidateId: string;
  presets?: DirectorCorrectionPreset[];
  feedback: string;
  workflowTaskId?: string;
}

export interface DirectorCandidateTitleRefineRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
  previousBatches: DirectorCandidateBatch[];
  batchId: string;
  candidateId: string;
  feedback: string;
  workflowTaskId?: string;
}

export interface DirectorConfirmRequest extends DirectorProjectContextInput, DirectorLLMOptions {
  idea: string;
  batchId?: string;
  round?: number;
  candidate: DirectorCandidate;
  workflowTaskId?: string;
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
  storyMacroPlan: StoryMacroPlan | null;
  bookContract?: BookContract;
  bookSpec: BookSpec;
  batch: {
    id?: string;
    round?: number;
  };
  createdChapterCount: number;
  createdArcCount: number;
  workflowTaskId?: string;
  directorSession?: DirectorSessionState;
  resumeTarget?: NovelWorkflowResumeTarget | null;
  plans: {
    book: DirectorPlanDigest | null;
    arcs: DirectorPlanDigest[];
    chapters: DirectorPlanDigest[];
  };
}

export interface DirectorCandidatesResponse {
  batch: DirectorCandidateBatch;
  workflowTaskId?: string;
}

export interface DirectorRefineResponse {
  batch: DirectorCandidateBatch;
  workflowTaskId?: string;
}

export interface DirectorCandidatePatchResponse {
  batch: DirectorCandidateBatch;
  candidate: DirectorCandidate;
  workflowTaskId?: string;
}

export interface DirectorCandidateTitleRefineResponse {
  batch: DirectorCandidateBatch;
  candidate: DirectorCandidate;
  workflowTaskId?: string;
}

export interface DirectorConfirmApiResponse extends DirectorConfirmResponse {
  seededPlans: {
    book: DirectorPlanDigest | null;
    arcs: DirectorPlanDigest[];
    chapters: DirectorPlanDigest[];
  };
}

export interface DirectorBookContractDraft extends BookContractDraft {}
