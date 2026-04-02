import type {
  BaseCharacter,
  AuditReport,
  Chapter,
  ReplanRecommendation,
  ReplanResult,
  StoryPlan,
  StoryStateSnapshot,
  Character,
  CharacterTimeline,
  NovelBible,
  PipelineJob,
  PlotBeat,
  QualityScore,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerateInput,
  SupplementalCharacterGenerationResult,
  VolumeImpactResult,
  VolumeBeatSheet,
  VolumePlan,
  VolumePlanningReadiness,
  VolumePlanDiff,
  VolumePlanVersion,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
  VolumeCritiqueReport,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import type {
  StoryConstraintEngine,
  StoryMacroFieldValue,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroIssue,
  StoryMacroLocks,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StoryWorldSliceOverrides, StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { QuickCharacterCreatePayload } from "./characterPanel.utils";
import type { ChapterReviewResult } from "../chapterPlanning.shared";
import type { ChapterDetailBundleRequest } from "../chapterDetailPlanning.shared";
import type { StructuredSyncOptions } from "../novelEdit.utils";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import type { ExistingOutlineChapter } from "../volumePlan.utils";
import type { AITakeoverAction } from "@/components/workflow/AITakeoverContainer";
import type { ReactNode } from "react";

export interface BasicTabProps {
  novelId: string;
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; label: string; path: string }>;
  storyModeOptions: Array<{
    id: string;
    name: string;
    label: string;
    path: string;
    description?: string | null;
    profile: {
      coreDrive: string;
      readerReward: string;
    };
  }>;
  worldOptions: Array<{ id: string; name: string }>;
  sourceNovelOptions: Array<{ id: string; title: string }>;
  sourceKnowledgeOptions: Array<{ id: string; title: string }>;
  sourceNovelBookAnalysisOptions: Array<{
    id: string;
    title: string;
    documentTitle: string;
    documentVersionNumber: number;
  }>;
  isLoadingSourceNovelBookAnalyses: boolean;
  availableBookAnalysisSections: Array<{ key: BookAnalysisSectionKey; title: string }>;
  worldSliceView?: StoryWorldSliceView | null;
  worldSliceMessage: string;
  isRefreshingWorldSlice: boolean;
  isSavingWorldSliceOverrides: boolean;
  onFormChange: (patch: Partial<BasicTabProps["basicForm"]>) => void;
  onSave: () => void;
  onRefreshWorldSlice: () => void;
  onSaveWorldSliceOverrides: (patch: StoryWorldSliceOverrides) => void;
  isSaving: boolean;
  projectQuickStart?: ReactNode;
}

export interface StoryMacroTabProps {
  storyInput: string;
  onStoryInputChange: (value: string) => void;
  expansion: StoryExpansion | null;
  decomposition: StoryDecomposition;
  constraints: string[];
  issues: StoryMacroIssue[];
  lockedFields: StoryMacroLocks;
  constraintEngine: StoryConstraintEngine | null;
  state: StoryMacroState;
  message: string;
  hasPlan: boolean;
  onFieldChange: (field: StoryMacroField, value: StoryMacroFieldValue) => void;
  onToggleLock: (field: StoryMacroField) => void;
  onDecompose: () => void;
  onRegenerateField: (field: StoryMacroField) => void;
  regeneratingField: StoryMacroField | "";
  onBuildConstraintEngine: () => void;
  onSaveEdits: () => void;
  onStateChange: (field: keyof StoryMacroState, value: string | number) => void;
  onSaveState: () => void;
  isDecomposing: boolean;
  isBuilding: boolean;
  isSaving: boolean;
  isSavingState: boolean;
}

export interface OutlineTabViewProps {
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  hasUnsavedVolumeDraft: boolean;
  generationNotice: string;
  readiness: VolumePlanningReadiness;
  strategyPlan: VolumeStrategyPlan | null;
  critiqueReport: VolumeCritiqueReport | null;
  isGeneratingStrategy: boolean;
  onGenerateStrategy: () => void;
  isCritiquingStrategy: boolean;
  onCritiqueStrategy: () => void;
  isGeneratingSkeleton: boolean;
  onGenerateSkeleton: () => void;
  onGoToCharacterTab: () => void;
  draftText: string;
  volumes: VolumePlan[];
  onVolumeFieldChange: (volumeId: string, field: keyof Pick<VolumePlan, "title" | "summary" | "openingHook" | "mainPromise" | "primaryPressureSource" | "coreSellingPoint" | "escalationMode" | "protagonistChange" | "midVolumeRisk" | "climax" | "payoffType" | "nextVolumeHook" | "resetPoint">, value: string) => void;
  onOpenPayoffsChange: (volumeId: string, value: string) => void;
  onAddVolume: () => void;
  onRemoveVolume: (volumeId: string) => void;
  onMoveVolume: (volumeId: string, direction: -1 | 1) => void;
  onSave: () => void;
  isSaving: boolean;
  volumeMessage: string;
  volumeVersions: VolumePlanVersion[];
  selectedVersionId: string;
  onSelectedVersionChange: (id: string) => void;
  onCreateDraftVersion: () => void;
  isCreatingDraftVersion: boolean;
  onLoadSelectedVersionToDraft: () => void;
  onActivateVersion: () => void;
  isActivatingVersion: boolean;
  onFreezeVersion: () => void;
  isFreezingVersion: boolean;
  onLoadVersionDiff: () => void;
  isLoadingVersionDiff: boolean;
  diffResult: VolumePlanDiff | null;
  onAnalyzeDraftImpact: () => void;
  isAnalyzingDraftImpact: boolean;
  onAnalyzeVersionImpact: () => void;
  isAnalyzingVersionImpact: boolean;
  impactResult: VolumeImpactResult | null;
}

export interface StructuredTabViewProps extends Omit<
  OutlineTabViewProps,
  | "volumeMessage"
  | "volumeVersions"
  | "selectedVersionId"
  | "onSelectedVersionChange"
  | "onCreateDraftVersion"
  | "isCreatingDraftVersion"
  | "onLoadSelectedVersionToDraft"
  | "onActivateVersion"
  | "isActivatingVersion"
  | "onFreezeVersion"
  | "isFreezingVersion"
  | "onLoadVersionDiff"
  | "isLoadingVersionDiff"
  | "diffResult"
  | "onAnalyzeDraftImpact"
  | "isAnalyzingDraftImpact"
  | "onAnalyzeVersionImpact"
  | "isAnalyzingVersionImpact"
  | "impactResult"
> {
  novelId: string;
  beatSheets: VolumeBeatSheet[];
  rebalanceDecisions: VolumeRebalanceDecision[];
  draftText: string;
  isGeneratingBeatSheet: boolean;
  onGenerateBeatSheet: (volumeId: string) => void;
  isGeneratingChapterList: boolean;
  onGenerateChapterList: (volumeId: string) => void;
  isGeneratingChapterDetail: boolean;
  isGeneratingChapterDetailBundle: boolean;
  generatingChapterDetailMode: "purpose" | "boundary" | "task_sheet" | "";
  generatingChapterDetailChapterId: string;
  onGenerateChapterDetail: (
    volumeId: string,
    chapterId: string,
    mode: "purpose" | "boundary" | "task_sheet",
  ) => void;
  onGenerateChapterDetailBundle: (
    volumeId: string,
    request: ChapterDetailBundleRequest,
  ) => void;
  syncPreview: VolumeSyncPreview;
  syncOptions: StructuredSyncOptions;
  onSyncOptionsChange: (patch: Partial<StructuredSyncOptions>) => void;
  onApplySync: (options: StructuredSyncOptions) => void;
  isApplyingSync: boolean;
  syncMessage: string;
  chapters: ExistingOutlineChapter[];
  onChapterFieldChange: (
    volumeId: string,
    chapterId: string,
    field: keyof Pick<VolumePlan["chapters"][number], "title" | "summary" | "purpose" | "mustAvoid" | "taskSheet">,
    value: string,
  ) => void;
  onChapterNumberChange: (
    volumeId: string,
    chapterId: string,
    field: keyof Pick<VolumePlan["chapters"][number], "conflictLevel" | "revealLevel" | "targetWordCount">,
    value: number | null,
  ) => void;
  onChapterPayoffRefsChange: (volumeId: string, chapterId: string, value: string) => void;
  onAddChapter: (volumeId: string) => void;
  onRemoveChapter: (volumeId: string, chapterId: string) => void;
  onMoveChapter: (volumeId: string, chapterId: string, direction: -1 | 1) => void;
  onApplyBatch: (patch: { conflictLevel?: number; targetWordCount?: number; generateTaskSheet?: boolean }) => void;
  onSave: () => void;
  isSaving: boolean;
}

export interface ChapterTabViewProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  chapters: Chapter[];
  selectedChapterId: string;
  selectedChapter?: Chapter;
  onSelectChapter: (chapterId: string) => void;
  onGoToCharacterTab: () => void;
  onCreateChapter: () => void;
  isCreatingChapter: boolean;
  chapterOperationMessage: string;
  strategy: {
    runMode: "fast" | "polish";
    wordSize: "short" | "medium" | "long";
    conflictLevel: number;
    pace: "slow" | "balanced" | "fast";
    aiFreedom: "low" | "medium" | "high";
  };
  onStrategyChange: (
    field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom",
    value: string | number,
  ) => void;
  onApplyStrategy: () => void;
  isApplyingStrategy: boolean;
  onGenerateSelectedChapter: () => void;
  onRewriteChapter: () => void;
  onExpandChapter: () => void;
  onCompressChapter: () => void;
  onSummarizeChapter: () => void;
  onGenerateTaskSheet: () => void;
  onGenerateSceneCards: () => void;
  onGenerateChapterPlan: () => void;
  onReplanChapter: () => void;
  onRunFullAudit: () => void;
  onCheckContinuity: () => void;
  onCheckCharacterConsistency: () => void;
  onCheckPacing: () => void;
  onAutoRepair: () => void;
  onStrengthenConflict: () => void;
  onEnhanceEmotion: () => void;
  onUnifyStyle: () => void;
  onAddDialogue: () => void;
  onAddDescription: () => void;
  isReviewingChapter: boolean;
  isRepairingChapter: boolean;
  reviewResult: ChapterReviewResult | null;
  replanRecommendation?: ReplanRecommendation | null;
  lastReplanResult?: ReplanResult | null;
  chapterPlan?: StoryPlan | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterAuditReports: AuditReport[];
  isGeneratingChapterPlan: boolean;
  isReplanningChapter: boolean;
  isRunningFullAudit: boolean;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  };
  repairStreamContent: string;
  isRepairStreaming: boolean;
  repairStreamingChapterId?: string | null;
  repairStreamingChapterLabel?: string | null;
  onAbortRepair: () => void;
  streamContent: string;
  isStreaming: boolean;
  streamingChapterId?: string | null;
  streamingChapterLabel?: string | null;
  onAbortStream: () => void;
}

export interface PipelineTabViewProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  onGoToCharacterTab: () => void;
  pipelineForm: {
    startOrder: number;
    endOrder: number;
    maxRetries: number;
    runMode: "fast" | "polish";
    autoReview: boolean;
    autoRepair: boolean;
    skipCompleted: boolean;
    qualityThreshold: number;
    repairMode: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
  };
  onPipelineFormChange: (
    field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode",
    value: number | boolean | string,
  ) => void;
  maxOrder: number;
  onGenerateBible: () => void;
  onAbortBible: () => void;
  isBibleStreaming: boolean;
  bibleStreamContent: string;
  onGenerateBeats: () => void;
  onAbortBeats: () => void;
  isBeatsStreaming: boolean;
  beatsStreamContent: string;
  onRunPipeline: (patch?: Partial<PipelineTabViewProps["pipelineForm"]>) => void;
  isRunningPipeline: boolean;
  pipelineMessage: string;
  pipelineJob?: PipelineJob;
  chapters: Chapter[];
  selectedChapterId: string;
  onSelectedChapterChange: (chapterId: string) => void;
  onReviewChapter: () => void;
  isReviewing: boolean;
  onRepairChapter: () => void;
  isRepairing: boolean;
  onGenerateHook: () => void;
  isGeneratingHook: boolean;
  reviewResult: ChapterReviewResult | null;
  repairBeforeContent: string;
  repairAfterContent: string;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  onAbortRepair: () => void;
  qualitySummary?: QualityScore;
  chapterReports: Array<{
    chapterId?: string | null;
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  }>;
  bible?: NovelBible | null;
  plotBeats: PlotBeat[];
}

export interface CharacterTabViewProps {
  novelId: string;
  llmProvider?: LLMProvider;
  llmModel?: string;
  characterMessage: string;
  quickCharacterForm: { name: string; role: string };
  onQuickCharacterFormChange: (field: "name" | "role", value: string) => void;
  onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => void;
  isQuickCreating: boolean;
  onGenerateSupplementalCharacters: (payload: SupplementalCharacterGenerateInput) => Promise<{
    data?: SupplementalCharacterGenerationResult;
    message?: string;
  }>;
  isGeneratingSupplementalCharacters: boolean;
  onApplySupplementalCharacter: (candidate: SupplementalCharacterCandidate) => Promise<{
    data?: { character?: Character; relationCount?: number };
    message?: string;
  }>;
  isApplyingSupplementalCharacter: boolean;
  characters: Character[];
  coreCharacterCount: number;
  baseCharacters: BaseCharacter[];
  selectedBaseCharacterId: string;
  onSelectedBaseCharacterChange: (id: string) => void;
  selectedBaseCharacter?: BaseCharacter;
  importedBaseCharacterIds: Set<string>;
  onImportBaseCharacter: () => void;
  isImportingBaseCharacter: boolean;
  selectedCharacterId: string;
  onSelectedCharacterChange: (id: string) => void;
  onDeleteCharacter: (id: string) => void;
  isDeletingCharacter: boolean;
  deletingCharacterId: string;
  onSyncTimeline: () => void;
  isSyncingTimeline: boolean;
  onSyncAllTimeline: () => void;
  isSyncingAllTimeline: boolean;
  onEvolveCharacter: () => void;
  isEvolvingCharacter: boolean;
  onWorldCheck: () => void;
  isCheckingWorld: boolean;
  selectedCharacter?: Character;
  characterForm: {
    name: string;
    role: string;
    gender: "male" | "female" | "other" | "unknown";
    personality: string;
    background: string;
    development: string;
    currentState: string;
    currentGoal: string;
  };
  onCharacterFormChange: (
    field: "name" | "role" | "gender" | "personality" | "background" | "development" | "currentState" | "currentGoal",
    value: string,
  ) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
}

export interface NovelEditTakeoverState {
  mode: "loading" | "running" | "waiting" | "failed";
  title: string;
  description: string;
  progress?: number | null;
  currentAction?: string | null;
  checkpointLabel?: string | null;
  taskId?: string | null;
  overlay?: boolean;
  overlayMessage?: string | null;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary" | "destructive";
    disabled?: boolean;
  }>;
}

export interface NovelTaskDrawerState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: UnifiedTaskDetail | null;
  currentUiModel: {
    provider: string;
    model: string;
    temperature: number;
  };
  actions: AITakeoverAction[];
  onOpenFullTaskCenter: () => void;
}

export interface NovelEditViewProps {
  id: string;
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  basicTab: BasicTabProps;
  storyMacroTab: StoryMacroTabProps;
  outlineTab: OutlineTabViewProps;
  structuredTab: StructuredTabViewProps;
  chapterTab: ChapterTabViewProps;
  pipelineTab: PipelineTabViewProps;
  characterTab: CharacterTabViewProps;
  takeover?: NovelEditTakeoverState | null;
  taskDrawer?: NovelTaskDrawerState | null;
}
