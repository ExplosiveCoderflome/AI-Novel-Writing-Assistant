import type { BookAnalysisSectionKey } from "./bookAnalysis";
import type { BookContract } from "./novelWorkflow";
import type { NovelWorkflowCheckpoint } from "./novelWorkflow";
import type { NovelStoryMode } from "./storyMode";
import type { TaskStatus, TaskTokenUsageSummary } from "./task";
export type {
  BaseCharacter,
  Character,
  CharacterCastApplyResult,
  CharacterCastOption,
  CharacterCastOptionClearResult,
  CharacterCastOptionDeleteResult,
  CharacterGender,
  CharacterCastOptionMember,
  CharacterCastOptionRelation,
  CharacterCastRole,
  CharacterRelation,
  CharacterTimeline,
  SupplementalCharacterApplyResult,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationMode,
  SupplementalCharacterGenerationResult,
  SupplementalCharacterRelation,
  SupplementalCharacterTargetCastRole,
} from "./novelCharacter";
export type {
  NovelStoryMode,
  StoryModeConflictCeiling,
  StoryModeProfile,
} from "./storyMode";
export type {
  ChapterSceneCard,
  ChapterScenePlan,
  LengthBudgetContract,
} from "./chapterLengthControl";
export type NovelStatus = "draft" | "published";
export type NovelWritingMode = "original" | "continuation";
export type ProjectMode = "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
export type NarrativePov = "first_person" | "third_person" | "mixed";
export type PacePreference = "slow" | "balanced" | "fast";
export type EmotionIntensity = "low" | "medium" | "high";
export type AIFreedom = "low" | "medium" | "high";
export type ProjectProgressStatus = "not_started" | "in_progress" | "completed" | "rework" | "blocked";

export type StorylineVersionStatus = "draft" | "active" | "frozen";
export type VolumePlanVersionStatus = "draft" | "active" | "frozen";
export type VolumeGenerationScope =
  | "strategy"
  | "strategy_critique"
  | "skeleton"
  | "beat_sheet"
  | "chapter_list"
  | "chapter_detail"
  | "rebalance";
export type VolumeGenerationScopeInput = VolumeGenerationScope | "book" | "volume";
export type VolumeChapterListGenerationMode = "full_volume" | "single_beat";
export type StoryPlanLevel = "book" | "arc" | "chapter";
export type StoryPlanRole = "setup" | "progress" | "pressure" | "turn" | "payoff" | "cooldown";
export type AuditType = "continuity" | "character" | "plot" | "mode_fit";
export type AuditIssueStatus = "open" | "resolved" | "ignored";
export type {
  PayoffLedgerItem,
  PayoffLedgerResponse,
  PayoffLedgerScopeType,
  PayoffLedgerSourceRef,
  PayoffLedgerStatus,
  PayoffLedgerSummary,
} from "./payoffLedger";

export type ChapterStatus =
  | "unplanned"
  | "pending_generation"
  | "generating"
  | "pending_review"
  | "needs_repair"
  | "completed";

export type PipelineRunMode = "fast" | "polish";
export type PipelineRepairMode =
  | "detect_only"
  | "light_repair"
  | "heavy_repair"
  | "continuity_only"
  | "character_only"
  | "ending_only";

export interface NovelAutoDirectorTaskSummary {
  id: string;
  status: TaskStatus;
  progress: number;
  currentStage?: string | null;
  currentItemLabel?: string | null;
  executionScopeLabel?: string | null;
  displayStatus?: string | null;
  blockingReason?: string | null;
  resumeAction?: string | null;
  lastHealthyStage?: string | null;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string | null;
  nextActionLabel?: string | null;
  updatedAt: string;
}

export type ModelRouteTaskType =
  | "planner"
  | "writer"
  | "review"
  | "repair"
  | "summary"
  | "fact_extraction"
  | "chat";

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
  volumes?: VolumePlan[];
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

export interface Chapter {
  id: string;
  title: string;
  content?: string | null;
  order: number;
  generationState?: ChapterGenerationState;
  chapterStatus?: ChapterStatus | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  repairHistory?: string | null;
  qualityScore?: number | null;
  continuityScore?: number | null;
  characterScore?: number | null;
  pacingScore?: number | null;
  riskFlags?: string | null;
  hook?: string | null;
  expectation?: string | null;
  novelId: string;
  createdAt: string;
  updatedAt: string;
}

export type ChapterEditorOperation =
  | "polish"
  | "expand"
  | "compress"
  | "emotion"
  | "conflict"
  | "custom";
export type ChapterEditorRevisionSource = "preset" | "freeform";
export type ChapterEditorRevisionScope = "selection" | "chapter";

export interface ChapterEditorTargetRange {
  from: number;
  to: number;
  text: string;
}

export interface ChapterEditorContextWindow {
  beforeParagraphs: string[];
  afterParagraphs: string[];
}

export interface ChapterEditorContextSummary {
  goalSummary?: string | null;
  chapterSummary?: string | null;
  styleSummary?: string | null;
  characterStateSummary?: string | null;
  worldConstraintSummary?: string | null;
}

export interface ChapterEditorRewriteConstraints {
  keepFacts: boolean;
  keepPov: boolean;
  noUnauthorizedSetting: boolean;
  preserveCoreInfo: boolean;
}

export interface ChapterEditorDiffChunk {
  id: string;
  type: "equal" | "insert" | "delete";
  text: string;
}

export interface ChapterEditorCandidate {
  id: string;
  label: string;
  content: string;
  summary?: string | null;
  rationale?: string | null;
  riskNotes?: string[];
  diffChunks: ChapterEditorDiffChunk[];
  semanticTags?: string[];
}

export interface ChapterEditorMacroContext {
  chapterRoleInVolume: string;
  volumeTitle: string;
  volumePositionLabel: string;
  volumePhaseLabel: string;
  paceDirective: string;
  chapterMission: string;
  previousChapterBridge: string;
  nextChapterBridge: string;
  activePlotThreads: string[];
  characterStateSummary: string;
  worldConstraintSummary: string;
  mustKeepConstraints: string[];
}

export interface ChapterEditorDiagnosticCard {
  id: string;
  title: string;
  problemSummary: string;
  whyItMatters: string;
  recommendedAction: ChapterEditorOperation;
  recommendedScope: ChapterEditorRevisionScope;
  anchorRange?: Pick<ChapterEditorTargetRange, "from" | "to"> | null;
  paragraphLabel?: string | null;
  severity: "low" | "medium" | "high" | "critical";
  sourceTags: string[];
}

export interface ChapterEditorRecommendedTask {
  title: string;
  summary: string;
  recommendedAction: ChapterEditorOperation;
  recommendedScope: ChapterEditorRevisionScope;
  anchorRange?: Pick<ChapterEditorTargetRange, "from" | "to"> | null;
  paragraphLabel?: string | null;
}

export interface ChapterEditorWorkspaceResponse {
  chapterMeta: {
    chapterId: string;
    order: number;
    title: string;
    wordCount: number;
    openIssueCount: number;
    styleSummary?: string | null;
    updatedAt: string;
  };
  macroContext: ChapterEditorMacroContext;
  diagnosticCards: ChapterEditorDiagnosticCard[];
  recommendedTask: ChapterEditorRecommendedTask | null;
  refreshReason: string;
}

export interface ChapterEditorAiRevisionIntent {
  editGoal: string;
  toneShift: string;
  paceAdjustment: string;
  conflictAdjustment: string;
  emotionAdjustment: string;
  mustPreserve: string[];
  mustAvoid: string[];
  strength: "light" | "medium" | "strong";
  reasoningSummary: string;
}

export interface ChapterEditorAiRevisionRequest {
  source: ChapterEditorRevisionSource;
  scope: ChapterEditorRevisionScope;
  presetOperation?: ChapterEditorOperation;
  instruction?: string;
  contentSnapshot: string;
  selection?: ChapterEditorTargetRange;
  context?: ChapterEditorContextWindow;
  constraints: ChapterEditorRewriteConstraints;
  provider?: import("./llm").LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterEditorAiRevisionResponse {
  sessionId: string;
  scope: ChapterEditorRevisionScope;
  resolvedIntent: ChapterEditorAiRevisionIntent;
  targetRange: ChapterEditorTargetRange;
  macroAlignmentNote?: string | null;
  candidates: ChapterEditorCandidate[];
  activeCandidateId: string | null;
}

export interface ChapterEditorRewritePreviewRequest {
  operation: ChapterEditorOperation;
  customInstruction?: string;
  contentSnapshot: string;
  targetRange: ChapterEditorTargetRange;
  context: ChapterEditorContextWindow;
  chapterContext: ChapterEditorContextSummary;
  constraints: ChapterEditorRewriteConstraints;
  provider?: import("./llm").LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterEditorRewritePreviewResponse {
  sessionId: string;
  operation: ChapterEditorOperation;
  targetRange: ChapterEditorTargetRange;
  candidates: ChapterEditorCandidate[];
  activeCandidateId: string | null;
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

export interface StorylineVersion {
  id: string;
  novelId: string;
  version: number;
  status: StorylineVersionStatus;
  content: string;
  diffSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorylineDiff {
  id: string;
  novelId: string;
  version: number;
  status: StorylineVersionStatus;
  diffSummary?: string | null;
  changedLines: number;
  affectedCharacters: number;
  affectedChapters: number;
}

export interface CreativeDecision {
  id: string;
  novelId: string;
  chapterId?: string | null;
  category: string;
  content: string;
  importance: string;
  expiresAt?: number | null;
  sourceType?: string | null;
  sourceRefId?: string | null;
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

export interface ChapterPlanScene {
  id: string;
  planId: string;
  sortOrder: number;
  title: string;
  objective?: string | null;
  conflict?: string | null;
  reveal?: string | null;
  emotionBeat?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryPlan {
  id: string;
  novelId: string;
  chapterId?: string | null;
  parentId?: string | null;
  sourceStateSnapshotId?: string | null;
  level: StoryPlanLevel;
  planRole?: StoryPlanRole | null;
  phaseLabel?: string | null;
  title: string;
  objective: string;
  participantsJson?: string | null;
  revealsJson?: string | null;
  riskNotesJson?: string | null;
  mustAdvanceJson?: string | null;
  mustPreserveJson?: string | null;
  sourceIssueIdsJson?: string | null;
  replannedFromPlanId?: string | null;
  hookTarget?: string | null;
  status: string;
  externalRef?: string | null;
  rawPlanJson?: string | null;
  scenes: ChapterPlanScene[];
  createdAt: string;
  updatedAt: string;
}

export interface ReplanResult {
  primaryPlan: StoryPlan;
  generatedPlans: StoryPlan[];
  affectedChapterIds: string[];
  affectedChapterOrders: number[];
  anchorChapterOrder?: number | null;
  sourceIssueIds: string[];
  triggerType: string;
  reason: string;
  triggerReason?: string;
  windowReason?: string;
  whyTheseChapters?: string;
  windowSize: number;
  blockingLedgerKeys?: string[];
  run: {
    id: string;
    outputSummary?: string | null;
    createdAt: string;
  } | null;
}

export interface VolumeChapterPlan {
  id: string;
  volumeId: string;
  chapterOrder: number;
  beatKey?: string | null;
  title: string;
  summary: string;
  purpose?: string | null;
  exclusiveEvent?: string | null;
  endingState?: string | null;
  nextChapterEntryState?: string | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  targetWordCount?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  payoffRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export type VolumeStrategyPlanningMode = "hard" | "soft";
export type VolumeUncertaintyLevel = "low" | "medium" | "high";
export type VolumeBeatSheetStatus = "not_started" | "generated" | "revised";
export type VolumeCritiqueRiskLevel = "low" | "medium" | "high";
export type VolumeRebalanceSeverity = "low" | "medium" | "high";
export type VolumeRebalanceDirection =
  | "pull_forward"
  | "push_back"
  | "tighten_current"
  | "expand_adjacent"
  | "hold";
export type VolumeUncertaintyTargetType = "book" | "volume" | "beat_sheet" | "chapter_list";

export interface VolumeCountRange {
  min: number;
  max: number;
}

export interface VolumeChapterTargetRange {
  min: number;
  ideal: number;
  max: number;
}

export interface VolumeCountGuidance {
  chapterBudget: number;
  targetChapterRange: VolumeChapterTargetRange;
  allowedVolumeCountRange: VolumeCountRange;
  recommendedVolumeCount: number;
  systemRecommendedVolumeCount: number;
  hardPlannedVolumeRange: VolumeCountRange;
  userPreferredVolumeCount?: number | null;
  respectedExistingVolumeCount?: number | null;
}

export interface VolumeStrategyVolume {
  sortOrder: number;
  planningMode: VolumeStrategyPlanningMode;
  roleLabel: string;
  coreReward: string;
  escalationFocus: string;
  uncertaintyLevel: VolumeUncertaintyLevel;
}

export interface VolumeUncertaintyMarker {
  targetType: VolumeUncertaintyTargetType;
  targetRef: string;
  level: VolumeUncertaintyLevel;
  reason: string;
}

export interface VolumeStrategyPlan {
  recommendedVolumeCount: number;
  hardPlannedVolumeCount: number;
  readerRewardLadder: string;
  escalationLadder: string;
  midpointShift: string;
  notes: string;
  volumes: VolumeStrategyVolume[];
  uncertainties: VolumeUncertaintyMarker[];
}

export interface VolumeBeat {
  key: string;
  label: string;
  summary: string;
  chapterSpanHint: string;
  mustDeliver: string[];
}

export interface VolumeBeatSheet {
  volumeId: string;
  volumeSortOrder: number;
  status: VolumeBeatSheetStatus;
  beats: VolumeBeat[];
}

export interface VolumeCritiqueIssue {
  targetRef: string;
  severity: VolumeCritiqueRiskLevel;
  title: string;
  detail: string;
}

export interface VolumeCritiqueReport {
  overallRisk: VolumeCritiqueRiskLevel;
  summary: string;
  issues: VolumeCritiqueIssue[];
  recommendedActions: string[];
}

export interface VolumePlanningReadiness {
  canGenerateStrategy: boolean;
  canGenerateSkeleton: boolean;
  canGenerateBeatSheet: boolean;
  canGenerateChapterList: boolean;
  blockingReasons: string[];
}

export interface VolumeRebalanceDecision {
  anchorVolumeId: string;
  affectedVolumeId: string;
  direction: VolumeRebalanceDirection;
  severity: VolumeRebalanceSeverity;
  summary: string;
  actions: string[];
}

export interface VolumePlan {
  id: string;
  novelId: string;
  sortOrder: number;
  title: string;
  summary?: string | null;
  openingHook?: string | null;
  mainPromise?: string | null;
  primaryPressureSource?: string | null;
  coreSellingPoint?: string | null;
  escalationMode?: string | null;
  protagonistChange?: string | null;
  midVolumeRisk?: string | null;
  climax?: string | null;
  payoffType?: string | null;
  nextVolumeHook?: string | null;
  resetPoint?: string | null;
  openPayoffs: string[];
  status: string;
  sourceVersionId?: string | null;
  chapters: VolumeChapterPlan[];
  createdAt: string;
  updatedAt: string;
}

export interface VolumePlanVersion {
  id: string;
  novelId: string;
  version: number;
  status: VolumePlanVersionStatus;
  contentJson: string;
  diffSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VolumePlanDocument {
  novelId: string;
  workspaceVersion: "v2";
  volumes: VolumePlan[];
  strategyPlan: VolumeStrategyPlan | null;
  critiqueReport: VolumeCritiqueReport | null;
  beatSheets: VolumeBeatSheet[];
  rebalanceDecisions: VolumeRebalanceDecision[];
  readiness: VolumePlanningReadiness;
  derivedOutline: string;
  derivedStructuredOutline: string;
  source: "volume" | "legacy" | "empty";
  activeVersionId: string | null;
}

export interface VolumePlanDiffVolume {
  sortOrder: number;
  title: string;
  changedFields: string[];
  chapterOrders: number[];
}

export interface VolumePlanDiff {
  id: string;
  novelId: string;
  version: number;
  status: VolumePlanVersionStatus;
  diffSummary?: string | null;
  changedLines: number;
  changedVolumeCount: number;
  changedChapterCount: number;
  changedVolumes: VolumePlanDiffVolume[];
  affectedChapterOrders: number[];
}

export interface VolumeImpactResult {
  novelId: string;
  sourceVersion: number | null;
  changedLines: number;
  affectedVolumeCount: number;
  affectedChapterCount: number;
  affectedVolumes: VolumePlanDiffVolume[];
  requiresChapterSync: boolean;
  requiresCharacterReview: boolean;
  recommendedActions: string[];
}

export interface VolumeSyncPreviewItem {
  action: "create" | "update" | "keep" | "delete" | "delete_candidate" | "move";
  volumeTitle: string;
  chapterOrder: number;
  nextTitle: string;
  previousTitle?: string | null;
  hasContent: boolean;
  changedFields: string[];
}

export interface VolumeSyncPreview {
  createCount: number;
  updateCount: number;
  keepCount: number;
  moveCount: number;
  deleteCount: number;
  deleteCandidateCount: number;
  affectedGeneratedCount: number;
  clearContentCount: number;
  affectedVolumeCount: number;
  items: VolumeSyncPreviewItem[];
}

export interface ReplanRecommendation {
  recommended: boolean;
  reason: string;
  blockingIssueIds: string[];
  blockingLedgerKeys?: string[];
  affectedChapterOrders?: number[];
  anchorChapterOrder?: number | null;
  triggerReason?: string;
  windowReason?: string;
  whyTheseChapters?: string;
}

export interface AuditIssue {
  id: string;
  reportId: string;
  auditType: AuditType;
  severity: "low" | "medium" | "high" | "critical";
  code: string;
  description: string;
  evidence: string;
  fixSuggestion: string;
  status: AuditIssueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuditReport {
  id: string;
  novelId: string;
  chapterId: string;
  auditType: AuditType;
  overallScore?: number | null;
  summary?: string | null;
  legacyScoreJson?: string | null;
  issues: AuditIssue[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelRouteConfig {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number | null;
}

export type {
  ChapterRuntimePackage,
  ChapterRuntimeRequest,
  GenerationContextPackage,
} from "./chapterRuntime";
export type {
  StoryWorldSlice,
  StoryWorldSliceBuilderMode,
  StoryWorldSliceElement,
  StoryWorldSliceForce,
  StoryWorldSliceLocation,
  StoryWorldSliceMeta,
  StoryWorldSliceOptionItem,
  StoryWorldSliceOverrides,
  StoryWorldSliceRule,
  StoryWorldSliceView,
} from "./storyWorldSlice";
