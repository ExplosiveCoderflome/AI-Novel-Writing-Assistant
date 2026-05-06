import type { BookAnalysisSectionKey } from "../bookAnalysis";
import type { BookContract } from "../novelWorkflow";
import type { TaskTokenUsageSummary } from "../task";

export type NovelStatus = "draft" | "published";
export type NovelWritingMode = "original" | "continuation";
export type ProjectMode = "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
export type NarrativePov = "first_person" | "third_person" | "mixed";
export type PacePreference = "slow" | "balanced" | "fast";
export type EmotionIntensity = "low" | "medium" | "high";
export type AIFreedom = "low" | "medium" | "high";
export type ProjectProgressStatus = "not_started" | "in_progress" | "completed" | "rework" | "blocked";

export type ModelRouteTaskType =
  | "planner"
  | "writer"
  | "review"
  | "repair"
  | "summary"
  | "fact_extraction"
  | "chat";

export type PipelineRunMode = "fast" | "polish";
export type PipelineRepairMode =
  | "detect_only"
  | "light_repair"
  | "heavy_repair"
  | "continuity_only"
  | "character_only"
  | "ending_only";

export type PipelineJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AuditType = "continuity" | "character" | "plot" | "mode_fit";
export type AuditIssueStatus = "open" | "resolved" | "ignored";

export type StoryPlanLevel = "book" | "arc" | "chapter";
export type StoryPlanRole = "setup" | "progress" | "pressure" | "turn" | "payoff" | "cooldown";

export const MODEL_ROUTE_REQUEST_PROTOCOLS = [
  "auto",
  "openai_compatible",
  "anthropic",
] as const;

export type ModelRouteRequestProtocol = typeof MODEL_ROUTE_REQUEST_PROTOCOLS[number];

export const MODEL_ROUTE_STRUCTURED_RESPONSE_FORMATS = [
  "auto",
  "json_schema",
  "json_object",
  "prompt_json",
] as const;

export type ModelRouteStructuredResponseFormat = typeof MODEL_ROUTE_STRUCTURED_RESPONSE_FORMATS[number];

export interface Novel {
  id: string;
  title: string;
  description?: string | null;
  targetAudience?: string | null;
  bookSellingPoint?: string | null;
  competingFeel?: string | null;
  first30ChapterPromise?: string | null;
  commercialTags: string[];
  status: NovelStatus;
  writingMode: NovelWritingMode;
  projectMode?: ProjectMode | null;
  narrativePov?: NarrativePov | null;
  pacePreference?: PacePreference | null;
  styleTone?: string | null;
  emotionIntensity?: EmotionIntensity | null;
  aiFreedom?: AIFreedom | null;
  defaultChapterLength?: number | null;
  estimatedChapterCount?: number | null;
  projectStatus?: ProjectProgressStatus | null;
  storylineStatus?: ProjectProgressStatus | null;
  outlineStatus?: ProjectProgressStatus | null;
  resourceReadyScore?: number | null;
  sourceNovelId?: string | null;
  sourceKnowledgeDocumentId?: string | null;
  continuationBookAnalysisId?: string | null;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[] | null;
  outline?: string | null;
  structuredOutline?: string | null;
  volumes?: import("./volume").VolumePlan[];
  volumeSource?: "volume" | "legacy" | "empty";
  activeVolumeVersionId?: string | null;
  bookContract?: BookContract | null;
  genreId?: string | null;
  primaryStoryModeId?: string | null;
  secondaryStoryModeId?: string | null;
  worldId?: string | null;
  tokenUsage?: TaskTokenUsageSummary | null;
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

export interface ModelRouteConfig {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number | null;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredResponseFormat?: ModelRouteStructuredResponseFormat;
}

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

export interface NovelSnapshot {
  id: string;
  novelId: string;
  label?: string | null;
  snapshotData: string;
  triggerType: "manual" | "auto_milestone" | "before_pipeline";
  createdAt: string;
}

export interface PipelineJob {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  runMode?: PipelineRunMode | null;
  autoReview?: boolean | null;
  autoRepair?: boolean | null;
  skipCompleted?: boolean | null;
  qualityThreshold?: number | null;
  repairMode?: PipelineRepairMode | null;
  status: PipelineJobStatus;
  progress: number;
  completedCount: number;
  totalCount: number;
  retryCount: number;
  maxRetries: number;
  heartbeatAt?: string | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  cancelRequestedAt?: string | null;
  displayStatus?: string | null;
  noticeCode?: string | null;
  noticeSummary?: string | null;
  qualityAlertDetails?: string[];
  error?: string | null;
  lastErrorType?: string | null;
  payload?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterState {
  id: string;
  snapshotId: string;
  characterId: string;
  currentGoal?: string | null;
  emotion?: string | null;
  stressLevel?: number | null;
  secretExposure?: string | null;
  knownFactsJson?: string | null;
  misbeliefsJson?: string | null;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelationState {
  id: string;
  snapshotId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  trustScore?: number | null;
  intimacyScore?: number | null;
  conflictScore?: number | null;
  dependencyScore?: number | null;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InformationState {
  id: string;
  snapshotId: string;
  holderType: string;
  holderRefId?: string | null;
  fact: string;
  status: string;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ForeshadowState {
  id: string;
  snapshotId: string;
  title: string;
  summary?: string | null;
  status: string;
  setupChapterId?: string | null;
  payoffChapterId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryStateSnapshot {
  id: string;
  novelId: string;
  sourceChapterId?: string | null;
  summary?: string | null;
  rawStateJson?: string | null;
  characterStates: CharacterState[];
  relationStates: RelationState[];
  informationStates: InformationState[];
  foreshadowStates: ForeshadowState[];
  createdAt: string;
  updatedAt: string;
}

export interface OpenConflict {
  id: string;
  novelId: string;
  chapterId?: string | null;
  sourceSnapshotId?: string | null;
  sourceIssueId?: string | null;
  sourceType: string;
  conflictType: string;
  conflictKey: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  evidenceJson?: string | null;
  affectedCharacterIdsJson?: string | null;
  resolutionHint?: string | null;
  lastSeenChapterOrder?: number | null;
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
