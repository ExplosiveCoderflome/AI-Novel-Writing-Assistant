import type { ChapterPlanScene } from "./chapter";
import type { StoryPlanLevel, StoryPlanRole } from "./core";

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
  styleContract?: string | null;
  payoffRefs: string[];
  createdAt: string;
  updatedAt: string;
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

export interface VolumePlanVersionSummary {
  id: string;
  novelId: string;
  version: number;
  status: VolumePlanVersionStatus;
  diffSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VolumePlanVersion extends VolumePlanVersionSummary {
  contentJson: string;
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
