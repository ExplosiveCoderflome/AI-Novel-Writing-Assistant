import type {
  BasicTabProps,
  OutlineTabViewProps,
  StructuredTabViewProps,
} from "./components/NovelEditView.types";
import type { NovelBasicFormState } from "./novelBasicInfo.shared";
import type { VolumeSyncOptions } from "./volumePlan.utils";
import type {
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumeImpactResult,
  VolumePlan,
  VolumePlanDiff,
  VolumePlanVersion,
  VolumePlanningReadiness,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import type { StoryWorldSliceOverrides, StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { ExistingOutlineChapter } from "./volumePlan.utils";

interface BuildNovelEditPlanningTabsInput {
  id: string;
  basicForm: NovelBasicFormState;
  genreOptions: BasicTabProps["genreOptions"];
  storyModeOptions: BasicTabProps["storyModeOptions"];
  worldOptions: BasicTabProps["worldOptions"];
  sourceNovelOptions: BasicTabProps["sourceNovelOptions"];
  sourceKnowledgeOptions: BasicTabProps["sourceKnowledgeOptions"];
  sourceNovelBookAnalysisOptions: BasicTabProps["sourceNovelBookAnalysisOptions"];
  isLoadingSourceNovelBookAnalyses: boolean;
  availableBookAnalysisSections: Array<{ key: BookAnalysisSectionKey; title: string }>;
  worldSliceView?: StoryWorldSliceView | null;
  worldSliceMessage: string;
  isRefreshingWorldSlice: boolean;
  isSavingWorldSliceOverrides: boolean;
  onBasicFormChange: (patch: Partial<NovelBasicFormState>) => void;
  onSaveBasic: () => void;
  onRefreshWorldSlice: () => void;
  onSaveWorldSliceOverrides: (patch: StoryWorldSliceOverrides) => void;
  isSavingBasic: boolean;
  projectQuickStart?: BasicTabProps["projectQuickStart"];
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
  outlineText: string;
  structuredDraftText: string;
  volumes: VolumePlan[];
  onVolumeFieldChange: OutlineTabViewProps["onVolumeFieldChange"];
  onOpenPayoffsChange: OutlineTabViewProps["onOpenPayoffsChange"];
  onAddVolume: () => void;
  onRemoveVolume: (volumeId: string) => void;
  onMoveVolume: (volumeId: string, direction: -1 | 1) => void;
  onSaveOutline: () => void;
  isSavingOutline: boolean;
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
  beatSheets: VolumeBeatSheet[];
  rebalanceDecisions: VolumeRebalanceDecision[];
  isGeneratingBeatSheet: boolean;
  onGenerateBeatSheet: (volumeId: string) => void;
  isGeneratingChapterList: boolean;
  onGenerateChapterList: (volumeId: string) => void;
  isGeneratingChapterDetail: boolean;
  isGeneratingChapterDetailBundle: boolean;
  generatingChapterDetailMode: StructuredTabViewProps["generatingChapterDetailMode"];
  generatingChapterDetailChapterId: string;
  onGenerateChapterDetail: StructuredTabViewProps["onGenerateChapterDetail"];
  onGenerateChapterDetailBundle: StructuredTabViewProps["onGenerateChapterDetailBundle"];
  syncPreview: VolumeSyncPreview;
  syncOptions: VolumeSyncOptions;
  onSyncOptionsChange: (patch: Partial<VolumeSyncOptions>) => void;
  onApplySync: (options: { preserveContent: boolean; applyDeletes: boolean }) => void;
  isApplyingSync: boolean;
  syncMessage: string;
  chapters: ExistingOutlineChapter[];
  onChapterFieldChange: StructuredTabViewProps["onChapterFieldChange"];
  onChapterNumberChange: StructuredTabViewProps["onChapterNumberChange"];
  onChapterPayoffRefsChange: (volumeId: string, chapterId: string, value: string) => void;
  onAddChapter: (volumeId: string) => void;
  onRemoveChapter: (volumeId: string, chapterId: string) => void;
  onMoveChapter: (volumeId: string, chapterId: string, direction: -1 | 1) => void;
  onApplyBatch: (patch: { conflictLevel?: number; targetWordCount?: number; generateTaskSheet?: boolean }) => void;
  onSaveStructured: () => void;
  isSavingStructured: boolean;
}

export function buildNovelEditPlanningTabs(input: BuildNovelEditPlanningTabsInput): {
  basicTab: BasicTabProps;
  outlineTab: OutlineTabViewProps;
  structuredTab: StructuredTabViewProps;
} {
  const basicTab: BasicTabProps = {
    novelId: input.id,
    basicForm: input.basicForm,
    genreOptions: input.genreOptions,
    storyModeOptions: input.storyModeOptions,
    worldOptions: input.worldOptions,
    sourceNovelOptions: input.sourceNovelOptions,
    sourceKnowledgeOptions: input.sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions: input.sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: input.isLoadingSourceNovelBookAnalyses,
    availableBookAnalysisSections: input.availableBookAnalysisSections,
    worldSliceView: input.worldSliceView,
    worldSliceMessage: input.worldSliceMessage,
    isRefreshingWorldSlice: input.isRefreshingWorldSlice,
    isSavingWorldSliceOverrides: input.isSavingWorldSliceOverrides,
    onFormChange: input.onBasicFormChange,
    onSave: input.onSaveBasic,
    onRefreshWorldSlice: input.onRefreshWorldSlice,
    onSaveWorldSliceOverrides: input.onSaveWorldSliceOverrides,
    isSaving: input.isSavingBasic,
    projectQuickStart: input.projectQuickStart,
  };

  const outlineTab: OutlineTabViewProps = {
    worldInjectionSummary: input.worldInjectionSummary,
    hasCharacters: input.hasCharacters,
    hasUnsavedVolumeDraft: input.hasUnsavedVolumeDraft,
    generationNotice: input.generationNotice,
    readiness: input.readiness,
    strategyPlan: input.strategyPlan,
    critiqueReport: input.critiqueReport,
    isGeneratingStrategy: input.isGeneratingStrategy,
    onGenerateStrategy: input.onGenerateStrategy,
    isCritiquingStrategy: input.isCritiquingStrategy,
    onCritiqueStrategy: input.onCritiqueStrategy,
    isGeneratingSkeleton: input.isGeneratingSkeleton,
    onGenerateSkeleton: input.onGenerateSkeleton,
    onGoToCharacterTab: input.onGoToCharacterTab,
    draftText: input.outlineText,
    volumes: input.volumes,
    onVolumeFieldChange: input.onVolumeFieldChange,
    onOpenPayoffsChange: input.onOpenPayoffsChange,
    onAddVolume: input.onAddVolume,
    onRemoveVolume: input.onRemoveVolume,
    onMoveVolume: input.onMoveVolume,
    onSave: input.onSaveOutline,
    isSaving: input.isSavingOutline,
    volumeMessage: input.volumeMessage,
    volumeVersions: input.volumeVersions,
    selectedVersionId: input.selectedVersionId,
    onSelectedVersionChange: input.onSelectedVersionChange,
    onCreateDraftVersion: input.onCreateDraftVersion,
    isCreatingDraftVersion: input.isCreatingDraftVersion,
    onLoadSelectedVersionToDraft: input.onLoadSelectedVersionToDraft,
    onActivateVersion: input.onActivateVersion,
    isActivatingVersion: input.isActivatingVersion,
    onFreezeVersion: input.onFreezeVersion,
    isFreezingVersion: input.isFreezingVersion,
    onLoadVersionDiff: input.onLoadVersionDiff,
    isLoadingVersionDiff: input.isLoadingVersionDiff,
    diffResult: input.diffResult,
    onAnalyzeDraftImpact: input.onAnalyzeDraftImpact,
    isAnalyzingDraftImpact: input.isAnalyzingDraftImpact,
    onAnalyzeVersionImpact: input.onAnalyzeVersionImpact,
    isAnalyzingVersionImpact: input.isAnalyzingVersionImpact,
    impactResult: input.impactResult,
  };

  const structuredTab: StructuredTabViewProps = {
    novelId: input.id,
    ...outlineTab,
    beatSheets: input.beatSheets,
    rebalanceDecisions: input.rebalanceDecisions,
    draftText: input.structuredDraftText,
    isGeneratingBeatSheet: input.isGeneratingBeatSheet,
    onGenerateBeatSheet: input.onGenerateBeatSheet,
    isGeneratingChapterList: input.isGeneratingChapterList,
    onGenerateChapterList: input.onGenerateChapterList,
    isGeneratingChapterDetail: input.isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle: input.isGeneratingChapterDetailBundle,
    generatingChapterDetailMode: input.generatingChapterDetailMode,
    generatingChapterDetailChapterId: input.generatingChapterDetailChapterId,
    onGenerateChapterDetail: input.onGenerateChapterDetail,
    onGenerateChapterDetailBundle: input.onGenerateChapterDetailBundle,
    syncPreview: input.syncPreview,
    syncOptions: input.syncOptions,
    onSyncOptionsChange: input.onSyncOptionsChange,
    onApplySync: input.onApplySync,
    isApplyingSync: input.isApplyingSync,
    syncMessage: input.syncMessage,
    chapters: input.chapters,
    onChapterFieldChange: input.onChapterFieldChange,
    onChapterNumberChange: input.onChapterNumberChange,
    onChapterPayoffRefsChange: input.onChapterPayoffRefsChange,
    onAddChapter: input.onAddChapter,
    onRemoveChapter: input.onRemoveChapter,
    onMoveChapter: input.onMoveChapter,
    onApplyBatch: input.onApplyBatch,
    onSave: input.onSaveStructured,
    isSaving: input.isSavingStructured,
  };

  return {
    basicTab,
    outlineTab,
    structuredTab,
  };
}
