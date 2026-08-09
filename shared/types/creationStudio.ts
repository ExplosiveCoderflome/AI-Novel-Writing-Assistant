import type { WritingPlatform, WritingPlatformPreference } from "./writingPlatform";
import type { NovelCreateResourceRecommendation } from "./novelResourceRecommendation";

export type NarrativeForm = "short_story" | "long_novel";

export type CreationIntentVersionStatus = "proposed" | "active" | "superseded" | "applied";
export type CreationIntentSource = "initial" | "regenerated" | "revision" | "derived";
export type CreationRevisionStrategy = "local_patch" | "rewrite_downstream" | "full_replan";

export interface CreationDirection {
  id: string;
  title: string;
  premise: string;
  coreExperience: string;
  protagonist: string;
  centralConflict: string;
  endingPromise: string;
  styleKeywords: string[];
}

export interface CreationIntentInterpretation {
  understanding: string;
  recommendedNarrativeForm: NarrativeForm;
  recommendedTargetWordCount: number;
  confidence: number;
  recommendationReason: string;
  recommendedWritingPlatform: WritingPlatform;
  writingPlatformConfidence: number;
  writingPlatformReason: string;
  productionFoundation?: NovelCreateResourceRecommendation;
  directions: [CreationDirection, CreationDirection];
}

export interface CreationStudioInterpretRequest {
  idea: string;
  preferredNarrativeForm?: NarrativeForm;
  targetWordCount?: number;
  writingPlatformPreference?: WritingPlatformPreference;
}

export interface CreationStudioRegenerateRequest {
  narrativeForm: NarrativeForm;
  targetWordCount: number;
  feedback?: string;
  writingPlatformPreference?: WritingPlatformPreference;
}

export interface CreationStudioConfirmRequest {
  directionId: string;
  narrativeForm: NarrativeForm;
  targetWordCount: number;
  idempotencyKey: string;
  writingPlatform: WritingPlatform;
}

export interface CreationStudioTaskProjection {
  taskId: string;
  status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
  progress: number;
  currentAction: string | null;
  idea: string;
  interpretation: CreationIntentInterpretation | null;
  selectedDirectionId: string | null;
  novelId: string | null;
  productionTaskId: string | null;
  resumeRoute: string;
  error: string | null;
}

export type ShortStoryPlanStatus = "planning" | "ready" | "writing" | "reviewing" | "completed" | "failed";
export type ShortStorySegmentStatus = "pending" | "generating" | "completed" | "failed";

export interface ShortStoryPlanSegment {
  order: number;
  purpose: string;
  targetWordCount: number;
  openingState: string;
  openingHook: string;
  immediateGoal: string;
  progressionBeats: string[];
  turningPoint: string;
  payoff: string;
  closingPull: string;
  closingState: string;
}

export interface ShortStoryPlanContract {
  title: string;
  targetWordCount: number;
  endingPromise: string;
  segments: ShortStoryPlanSegment[];
  causalContract?: {
    protagonistGoal: string;
    centralQuestion: string;
    fixedFacts: string[];
    causeEffectChain: string[];
    setupPayoffs: Array<{
      setup: string;
      setupSegmentOrder: number;
      payoff: string;
      payoffSegmentOrder: number;
    }>;
  };
}

export interface ShortStoryQualityResult {
  decision: "accepted" | "patchable" | "replan_required";
  summary: string;
  issues: Array<{
    code: string;
    severity?: "critical" | "standard";
    description: string;
    affectedSegmentOrders: number[];
    repairInstruction?: string;
  }>;
}

export interface ShortStorySegmentProjection {
  id: string;
  order: number;
  content: string;
  status: ShortStorySegmentStatus;
  version: number;
  targetWordCount: number;
  wordCount: number;
  humanEdited: boolean;
  qualityResult: ShortStoryQualityResult | null;
  updatedAt: string;
}

export interface ShortStoryProjection {
  novel: {
    id: string;
    title: string;
    narrativeForm: NarrativeForm;
    targetWordCount: number;
    derivedFromNovelId: string | null;
    writingPlatform: WritingPlatform | null;
    writingPlatformProfileVersion: number | null;
  };
  intent: {
    id: string;
    version: number;
    originalExpression: string;
    understanding: string;
    direction: CreationDirection;
  } | null;
  plan: {
    id: string;
    status: ShortStoryPlanStatus;
    endingPromise: string;
    qualityDebt: string[];
    schemaVersion: number;
  } | null;
  segments: ShortStorySegmentProjection[];
  continuousContent: string;
  production: {
    taskId: string | null;
    status: CreationStudioTaskProjection["status"] | null;
    progress: number;
    currentAction: string | null;
    error: string | null;
  };
}

export interface ShortStorySegmentUpdateRequest {
  content: string;
  expectedVersion: number;
}

export interface ShortStoryRevisionPreviewRequest {
  instruction: string;
}

export interface ShortStoryRevisionImpact {
  intentVersionId: string;
  understoodGoal: string;
  affectedSegmentIds: string[];
  changesEnding: boolean;
  changesScale: boolean;
  changesCoreIntent: boolean;
  recommendedTargetWordCount: number;
  recommendedStrategy: CreationRevisionStrategy;
  summary: string;
}

export interface ShortStoryRevisionApplyRequest {
  confirmed: true;
}

export interface DeriveLongFormResponse {
  taskId: string;
  resumeRoute: `/create?taskId=${string}`;
}
