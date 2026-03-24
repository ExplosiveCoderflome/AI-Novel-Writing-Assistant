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
  StorylineDiff,
  StorylineVersion,
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
import type { QuickCharacterCreatePayload } from "./characterPanel.utils";
import type { ChapterReviewResult } from "../chapterPlanning.shared";
import type { OutlineSyncChapter, StructuredSyncOptions, StructuredVolume } from "../novelEdit.utils";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";

export interface BasicTabProps {
  novelId: string;
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; label: string; path: string }>;
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
  isGenerating: boolean;
  streamContent: string;
  onGenerate: () => void;
  onStop: () => void;
  onAbortStream: () => void;
  onGoToCharacterTab: () => void;
  generationPrompt: string;
  onGenerationPromptChange: (next: string) => void;
  draftText: string;
  onDraftTextChange: (next: string) => void;
  onSave: () => void;
  isSaving: boolean;
  optimizeInstruction: string;
  onOptimizeInstructionChange: (next: string) => void;
  onOptimizeFull: () => void;
  onOptimizeSelection: (selectedText: string) => void;
  isOptimizing: boolean;
  optimizePreview: string;
  onApplyOptimizePreview: () => void;
  onCancelOptimizePreview: () => void;
  storylineMessage: string;
  storylineVersions: StorylineVersion[];
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
  diffResult: StorylineDiff | null;
  onAnalyzeDraftImpact: () => void;
  isAnalyzingDraftImpact: boolean;
  onAnalyzeVersionImpact: () => void;
  isAnalyzingVersionImpact: boolean;
  impactResult: {
    novelId: string;
    sourceVersion: number | null;
    affectedCharacters: number;
    affectedChapters: number;
    changedLines: number;
    requiresOutlineRebuild: boolean;
    recommendations: {
      shouldSyncOutline: boolean;
      shouldRecheckCharacters: boolean;
      suggestedStrategy: "rebuild_outline" | "incremental_sync";
    };
  } | null;
}

export interface StructuredTabViewProps extends Omit<
  OutlineTabViewProps,
  | "onGenerate"
  | "onStop"
  | "onSave"
  | "isSaving"
  | "generationPrompt"
  | "onGenerationPromptChange"
  | "storylineMessage"
  | "storylineVersions"
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
  isGenerating: boolean;
  streamContent: string;
  onGenerate: () => void;
  onStop: () => void;
  onApplySync: (options: StructuredSyncOptions) => void;
  isApplyingSync: boolean;
  syncMessage: string;
  draftText: string;
  onDraftTextChange: (next: string) => void;
  onSave: () => void;
  isSaving: boolean;
  structuredVolumes: StructuredVolume[];
  chapters: OutlineSyncChapter[];
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
  onAbortRepair: () => void;
  streamContent: string;
  isStreaming: boolean;
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
    personality: string;
    background: string;
    development: string;
    currentState: string;
    currentGoal: string;
  };
  onCharacterFormChange: (
    field: "name" | "role" | "personality" | "background" | "development" | "currentState" | "currentGoal",
    value: string,
  ) => void;
  onSaveCharacter: () => void;
  isSavingCharacter: boolean;
  timelineEvents: CharacterTimeline[];
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
}
