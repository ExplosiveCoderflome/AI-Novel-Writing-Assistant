import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { DirectorLockScope, DirectorSessionState } from "@ai-novel/shared/types/novelDirector";
import type { NovelExportDownloadFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import type {
  PipelineRepairMode,
  PipelineRunMode,
  ReviewIssue,
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumePlan,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import NovelEditView from "./components/NovelEditView";
import { getBaseCharacterList } from "@/api/character";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import { continueNovelWorkflow, getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { cancelTask, retryTask } from "@/api/tasks";
import {
  auditNovelChapter,
  generateChapterPlan,
  getChapterAuditReports,
  getChapterPlan,
  getChapterStateSnapshot,
  getLatestStateSnapshot,
  getNovelPayoffLedger,
  getNovelDetail,
  downloadNovelExport,
  getNovelPipelineJob,
  getNovelVolumeWorkspace,
  getNovelQualityReport,
  replanNovel,
} from "@/api/novel";
import { flattenStoryModeTreeOptions, getStoryModeTree } from "@/api/storyMode";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useSSE } from "@/hooks/useSSE";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { useLLMStore } from "@/store/llmStore";
import { buildWorldInjectionSummary } from "./novelEdit.utils";
import type { QuickCharacterCreatePayload } from "./components/characterPanel.utils";
import type { ChapterExecutionBackgroundActivity } from "./components/chapterExecution.shared";
import type { ChapterExecutionStrategy } from "./chapterExecution.utils";
import { useNovelCharacterMutations } from "./hooks/useNovelCharacterMutations";
import { useChapterExecutionActions } from "./hooks/useChapterExecutionActions";
import { useNovelContinuationSources } from "./hooks/useNovelContinuationSources";
import { useNovelEditChapterRuntime } from "./hooks/useNovelEditChapterRuntime";
import { useNovelEditMutations } from "./hooks/useNovelEditMutations";
import { useNovelEditInitialization } from "./hooks/useNovelEditInitialization";
import { useNovelWorldSlice } from "./hooks/useNovelWorldSlice";
import { useNovelStoryMacro } from "./hooks/useNovelStoryMacro";
import { useNovelVolumePlanning } from "./hooks/useNovelVolumePlanning";
import { useVolumeVersionControl } from "./hooks/useVolumeVersionControl";
import { useNovelEditWorkflow } from "./hooks/useNovelEditWorkflow";
import { buildNovelEditPlanningTabs } from "./novelEditPlanningTabs";
import type { ChapterReviewResult } from "./chapterPlanning.shared";
import type { NovelEditTakeoverState, NovelTaskDrawerState } from "./components/NovelEditView.types";
import NovelExistingProjectTakeoverDialog from "./components/NovelExistingProjectTakeoverDialog";
import { syncNovelWorkflowStageSilently, workflowStageFromTab } from "./novelWorkflow.client";
import { isNovelWorkspaceFlowTab, scopeFromWorkspaceTab, tabFromDirectorProgress, tabFromScope } from "./novelWorkspaceNavigation";
import { resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { getCandidateSelectionLink } from "@/lib/novelWorkflowTaskUi";
import {
  buildContinueAutoExecutionActionLabel,
  buildTakeoverDescription,
  buildTakeoverTitle,
  formatTakeoverCheckpoint,
  resolveAutoExecutionScopeLabel,
} from "./novelEditTakeover.shared";

function parsePipelineBackgroundActivities(payload: string | null | undefined): ChapterExecutionBackgroundActivity[] {
  if (!payload?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as {
      backgroundSync?: {
        activities?: Array<{
          kind?: unknown;
          status?: unknown;
          chapterId?: unknown;
          chapterOrder?: unknown;
          chapterTitle?: unknown;
          updatedAt?: unknown;
          error?: unknown;
        }>;
      };
    };
    return (parsed.backgroundSync?.activities ?? [])
      .flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const kind = item.kind;
        const status = item.status;
        if (
          (kind !== "character_dynamics" && kind !== "state_snapshot" && kind !== "payoff_ledger")
          || (status !== "running" && status !== "failed")
          || typeof item.chapterId !== "string"
          || !item.chapterId.trim()
          || typeof item.updatedAt !== "string"
          || !item.updatedAt.trim()
        ) {
          return [];
        }
        const activity: ChapterExecutionBackgroundActivity = {
          kind,
          status,
          chapterId: item.chapterId.trim(),
          chapterOrder: typeof item.chapterOrder === "number" ? item.chapterOrder : undefined,
          chapterTitle: typeof item.chapterTitle === "string" && item.chapterTitle.trim() ? item.chapterTitle.trim() : undefined,
          updatedAt: item.updatedAt.trim(),
          error: typeof item.error === "string" && item.error.trim() ? item.error.trim() : null,
        };
        return [activity];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
import {
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  createDefaultNovelBasicFormState,
  patchNovelBasicForm,
} from "./novelBasicInfo.shared";
import { useStructuredOutlineWorkspaceStore } from "./stores/useStructuredOutlineWorkspaceStore";
import {
  applyVolumeChapterBatch,
  buildVolumePlanningReadiness,
  buildOutlinePreviewFromVolumes,
  buildStructuredPreviewFromVolumes,
  buildVolumeSyncPreview,
  type ExistingOutlineChapter,
  type VolumeSyncOptions,
} from "./volumePlan.utils";

function scopeFromTab(tab: string): DirectorLockScope | null {
  return scopeFromWorkspaceTab(tab);
}

function resolveDirectorConsistencyIssue(input: {
  checkpointType: string | null | undefined;
  characterCount: number;
  chapterCount: number;
}): "missing_characters" | "missing_chapters" | null {
  if (input.checkpointType !== "front10_ready") {
    return null;
  }
  if (input.characterCount === 0) {
    return "missing_characters";
  }
  if (input.chapterCount === 0) {
    return "missing_chapters";
  }
  return null;
}

export default function NovelEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const {
    activeTab,
    setActiveTab,
    selectedChapterId,
    setSelectedChapterId,
    selectedVolumeId,
    setSelectedVolumeId,
    workflowTaskId,
  } = useNovelEditWorkflow(id);
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [autoOpenedFailedTaskId, setAutoOpenedFailedTaskId] = useState("");
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());
  const [volumeDraft, setVolumeDraft] = useState<VolumePlan[]>([]);
  const [volumeStrategyPlan, setVolumeStrategyPlan] = useState<VolumeStrategyPlan | null>(null);
  const [volumeCritiqueReport, setVolumeCritiqueReport] = useState<VolumeCritiqueReport | null>(null);
  const [volumeBeatSheets, setVolumeBeatSheets] = useState<VolumeBeatSheet[]>([]);
  const [volumeRebalanceDecisions, setVolumeRebalanceDecisions] = useState<VolumeRebalanceDecision[]>([]);
  const [volumeGenerationMessage, setVolumeGenerationMessage] = useState("");
  const [outlineOptimizeInstruction, setOutlineOptimizeInstruction] = useState("");
  const [outlineOptimizePreview, setOutlineOptimizePreview] = useState("");
  const [outlineOptimizeMode, setOutlineOptimizeMode] = useState<"full" | "selection">("full");
  const [outlineOptimizeSourceText, setOutlineOptimizeSourceText] = useState("");
  const [structuredOptimizeInstruction, setStructuredOptimizeInstruction] = useState("");
  const [structuredOptimizePreview, setStructuredOptimizePreview] = useState("");
  const [structuredOptimizeMode, setStructuredOptimizeMode] = useState<"full" | "selection">("full");
  const [structuredOptimizeSourceText, setStructuredOptimizeSourceText] = useState("");
  const [volumeSyncOptions, setVolumeSyncOptions] = useState<VolumeSyncOptions>({
    preserveContent: true,
    applyDeletes: false,
  });
  const [currentJobId, setCurrentJobId] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    startOrder: 1,
    endOrder: DEFAULT_ESTIMATED_CHAPTER_COUNT,
    maxRetries: 1,
    runMode: "fast" as PipelineRunMode,
    autoReview: true,
    autoRepair: true,
    skipCompleted: true,
    qualityThreshold: 75,
    repairMode: "light_repair" as PipelineRepairMode,
  });
  const [reviewResult, setReviewResult] = useState<ChapterReviewResult | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [structuredMessage, setStructuredMessage] = useState("");
  const [chapterOperationMessage, setChapterOperationMessage] = useState("");
  const [chapterStrategy, setChapterStrategy] = useState<ChapterExecutionStrategy>({ runMode: "fast", wordSize: "medium", conflictLevel: 60, pace: "balanced", aiFreedom: "medium" });
  const [activeChapterStream, setActiveChapterStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [activeRepairStream, setActiveRepairStream] = useState<{ chapterId: string; chapterLabel: string } | null>(null);
  const [isDirectorExitActionExpanded, setIsDirectorExitActionExpanded] = useState(false);
  const [characterMessage, setCharacterMessage] = useState("");
  const [repairBeforeContent, setRepairBeforeContent] = useState("");
  const [repairAfterContent, setRepairAfterContent] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedBaseCharacterId, setSelectedBaseCharacterId] = useState("");
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    role: "主角",
  });
  const [characterForm, setCharacterForm] = useState({
    name: "",
    role: "",
    gender: "unknown" as "male" | "female" | "other" | "unknown",
    personality: "",
    background: "",
    development: "",
    currentState: "",
    currentGoal: "",
  });

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });
  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(id),
    queryFn: () => getNovelQualityReport(id),
    enabled: Boolean(id),
  });
  const volumeWorkspaceQuery = useQuery({
    queryKey: queryKeys.novels.volumeWorkspace(id),
    queryFn: () => getNovelVolumeWorkspace(id),
    enabled: Boolean(id),
  });
  const latestStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.latestStateSnapshot(id),
    queryFn: () => getLatestStateSnapshot(id),
    enabled: Boolean(id),
  });
  const chapterStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.chapterStateSnapshot(id, selectedChapterId || "none"),
    queryFn: () => getChapterStateSnapshot(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });
  const payoffLedgerChapterOrder = useMemo(() => {
    const orders = novelDetailQuery.data?.data?.chapters?.map((chapter) => chapter.order) ?? [];
    return orders.length > 0 ? Math.max(...orders) : undefined;
  }, [novelDetailQuery.data?.data?.chapters]);
  const payoffLedgerQuery = useQuery({
    queryKey: queryKeys.novels.payoffLedger(id, payoffLedgerChapterOrder),
    queryFn: () => getNovelPayoffLedger(id, payoffLedgerChapterOrder),
    enabled: Boolean(id),
  });
  const activeAutoDirectorTaskQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTask(id),
    queryFn: () => getActiveAutoDirectorTask(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && (task.status === "queued" || task.status === "running" || task.status === "waiting_approval")
        ? 2000
        : false;
    },
  });
  const chapterPlanQuery = useQuery({
    queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId || "none"),
    queryFn: () => getChapterPlan(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });
  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId || "none"),
    queryFn: () => getChapterAuditReports(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });
  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });
  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });
  const storyModeTreeQuery = useQuery({
    queryKey: queryKeys.storyModes.all,
    queryFn: getStoryModeTree,
  });
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []), [genreTreeQuery.data?.data]);
  const storyModeOptions = useMemo(
    () => flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []),
    [storyModeTreeQuery.data?.data],
  );

  const {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  } = useNovelContinuationSources(id, {
    writingMode: basicForm.writingMode,
    continuationSourceType: basicForm.continuationSourceType,
    sourceNovelId: basicForm.sourceNovelId,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId,
  });

  const { tab: storyMacroTab } = useNovelStoryMacro({
    novelId: id,
    llm,
  });
  const {
    worldSliceMessage,
    worldSliceView,
    isRefreshingWorldSlice,
    isSavingWorldSliceOverrides,
    refreshWorldSlice,
    saveWorldSliceOverrides,
  } = useNovelWorldSlice({
    novelId: id,
    llm,
    queryClient,
  });
  const pipelineJobQuery = useQuery({
    queryKey: queryKeys.novels.pipelineJob(id, currentJobId || "none"),
    queryFn: () => getNovelPipelineJob(id, currentJobId),
    enabled: Boolean(id && currentJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });
  const exportNovelMutation = useMutation({
    mutationFn: async (input: {
      format: NovelExportDownloadFormat;
      scope: NovelExportScope;
      novelTitle: string;
    }) => {
      const exported = await downloadNovelExport(id, input.format, input.scope, input.novelTitle);
      return {
        ...exported,
        scope: input.scope,
        format: input.format,
      };
    },
    onSuccess: ({ blob, fileName, scope }) => {
      createDownload(blob, fileName);
      toast.success(scope === "full" ? "整本书导出已开始。" : "当前步骤导出已开始。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "导出失败。");
    },
  });

  const chapters = useMemo(() => novelDetailQuery.data?.data?.chapters ?? [], [novelDetailQuery.data?.data?.chapters]);
  const outlineSyncChapters = useMemo<ExistingOutlineChapter[]>(
    () => chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      content: chapter.content ?? "",
      expectation: chapter.expectation ?? "",
      targetWordCount: chapter.targetWordCount ?? null,
      conflictLevel: chapter.conflictLevel ?? null,
      revealLevel: chapter.revealLevel ?? null,
      mustAvoid: chapter.mustAvoid ?? null,
      taskSheet: chapter.taskSheet ?? null,
    })),
    [chapters],
  );
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId),
    [chapters, selectedChapterId],
  );
  const characters = novelDetailQuery.data?.data?.characters ?? [];
  const baseCharacters = baseCharacterListQuery.data?.data ?? [];
  const selectedCharacter = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedBaseCharacter = useMemo(
    () => baseCharacters.find((item) => item.id === selectedBaseCharacterId),
    [baseCharacters, selectedBaseCharacterId],
  );
  const exportNovelTitle = useMemo(
    () => basicForm.title.trim() || novelDetailQuery.data?.data?.title?.trim() || id,
    [basicForm.title, novelDetailQuery.data?.data?.title, id],
  );
  const currentExportScope = isNovelWorkspaceFlowTab(activeTab) ? activeTab : null;
  const importedBaseCharacterIds = useMemo(
    () => new Set(
      characters
        .map((item) => item.baseCharacterId)
        .filter((item): item is string => Boolean(item)),
    ),
    [characters],
  );
  const hasCharacters = characters.length > 0;
  const savedVolumeWorkspace = volumeWorkspaceQuery.data?.data ?? null;
  const {
    normalizedVolumeDraft,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    isGeneratingStrategy,
    isCritiquingStrategy,
    isGeneratingSkeleton,
    isGeneratingBeatSheet,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    startStrategyGeneration,
    startStrategyCritique,
    startSkeletonGeneration,
    startBeatSheetGeneration,
    startChapterListGeneration,
    startChapterDetailGeneration,
    startChapterDetailBundleGeneration,
    handleVolumeFieldChange,
    handleOpenPayoffsChange,
    handleAddVolume,
    handleRemoveVolume,
    handleMoveVolume,
    handleChapterFieldChange,
    handleChapterNumberChange,
    handleChapterPayoffRefsChange,
    handleAddChapter,
    handleRemoveChapter,
    handleMoveChapter,
  } = useNovelVolumePlanning({
    novelId: id,
    hasCharacters,
    llm,
    estimatedChapterCount: basicForm.estimatedChapterCount,
    volumeDraft,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    savedWorkspace: savedVolumeWorkspace,
    setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    setVolumeGenerationMessage,
    setStructuredMessage,
  });
  const volumeSyncPreview = useMemo(
    () => buildVolumeSyncPreview(normalizedVolumeDraft, outlineSyncChapters, volumeSyncOptions),
    [normalizedVolumeDraft, outlineSyncChapters, volumeSyncOptions],
  );
  const coreCharacterCount = useMemo(
    () => characters.filter((item) => /主角|反派/.test(item.role)).length,
    [characters],
  );
  const bible = novelDetailQuery.data?.data?.bible;
  const plotBeats = novelDetailQuery.data?.data?.plotBeats ?? [];
  const maxOrder = useMemo(
    () => chapters.reduce((max, chapter) => Math.max(max, chapter.order), 1),
    [chapters],
  );
  const worldInjectionSummary = useMemo(
    () => buildWorldInjectionSummary(novelDetailQuery.data?.data?.world),
    [novelDetailQuery.data?.data?.world],
  );
  const qualitySummary = qualityReportQuery.data?.data?.summary;
  const chapterQualityReport = useMemo(() => (qualityReportQuery.data?.data?.chapterReports ?? []).find((item) => item.chapterId === selectedChapterId), [qualityReportQuery.data?.data?.chapterReports, selectedChapterId]);
  const chapterPlan = chapterPlanQuery.data?.data ?? null;
  const latestStateSnapshot = latestStateSnapshotQuery.data?.data ?? null;
  const chapterStateSnapshot = chapterStateSnapshotQuery.data?.data ?? null;
  const payoffLedger = payoffLedgerQuery.data?.data ?? null;
  const chapterAuditReports = chapterAuditReportsQuery.data?.data ?? [];
  const pipelineBackgroundActivities = useMemo(
    () => parsePipelineBackgroundActivities(pipelineJobQuery.data?.data?.payload ?? null),
    [pipelineJobQuery.data?.data?.payload],
  );
  const latestAutoDirectorTask = activeAutoDirectorTaskQuery.data?.data ?? null;
  const activeAutoDirectorTask = latestAutoDirectorTask?.status === "cancelled"
    ? null
    : latestAutoDirectorTask;
  const activeDirectorSession = useMemo(() => {
    if (
      !activeAutoDirectorTask
      || (
        activeAutoDirectorTask.status !== "queued"
        && activeAutoDirectorTask.status !== "running"
        && activeAutoDirectorTask.status !== "waiting_approval"
      )
    ) {
      return null;
    }
    const raw = activeAutoDirectorTask?.meta.directorSession;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return raw as DirectorSessionState;
  }, [activeAutoDirectorTask]);
  const activeAutoExecutionScopeLabel = resolveAutoExecutionScopeLabel(activeAutoDirectorTask);
  const activeChapterTitleWarning = useMemo(
    () => resolveChapterTitleWarning(activeAutoDirectorTask),
    [activeAutoDirectorTask],
  );
  const workflowCurrentTab = useMemo(
    () => tabFromDirectorProgress({
      currentStage: activeAutoDirectorTask?.currentStage,
      currentItemKey: activeAutoDirectorTask?.currentItemKey,
      checkpointType: activeAutoDirectorTask?.checkpointType,
      reviewScope: activeDirectorSession?.reviewScope ?? null,
    }),
    [
      activeAutoDirectorTask?.checkpointType,
      activeAutoDirectorTask?.currentItemKey,
      activeAutoDirectorTask?.currentStage,
      activeDirectorSession?.reviewScope,
    ],
  );
  const autoDirectorRefreshSignatureRef = useRef("");
  const activeAutoDirectorRefreshSignature = useMemo(() => {
    if (!activeAutoDirectorTask) {
      return "";
    }
    const milestoneCount = Array.isArray(activeAutoDirectorTask.meta?.milestones)
      ? activeAutoDirectorTask.meta.milestones.length
      : 0;
    return [
      activeAutoDirectorTask.status,
      activeAutoDirectorTask.currentStage ?? "",
      activeAutoDirectorTask.currentItemKey ?? "",
      activeAutoDirectorTask.currentItemLabel ?? "",
      activeAutoDirectorTask.checkpointType ?? "",
      milestoneCount,
    ].join("|");
  }, [
    activeAutoDirectorTask,
    activeAutoDirectorTask?.checkpointType,
    activeAutoDirectorTask?.currentItemKey,
    activeAutoDirectorTask?.currentItemLabel,
    activeAutoDirectorTask?.currentStage,
    activeAutoDirectorTask?.meta,
    activeAutoDirectorTask?.status,
  ]);
  const openAuditIssueIds = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => issue.id)),
    [chapterAuditReports],
  );
  const openAutoDirectorTaskCenter = () => {
    const targetId = activeAutoDirectorTask?.id || workflowTaskId;
    if (targetId) {
      navigate(`/tasks?kind=novel_workflow&id=${targetId}`);
      return;
    }
    navigate("/tasks");
  };
  const invalidateAutoDirectorTaskState = async (taskId?: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
    if (taskId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail("novel_workflow", taskId) });
    }
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
  const continueAutoDirectorMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可继续的自动导演任务。");
      }
      return continueNovelWorkflow(activeAutoDirectorTask.id);
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      const feedback = resolveWorkflowContinuationFeedback(response.data);
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      toast.success(feedback.message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "继续自动导演失败。";
      toast.error(message);
    },
  });
  const continueAutoExecutionMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可继续自动执行的自动导演任务。");
      }
      return continueNovelWorkflow(activeAutoDirectorTask.id, {
        continuationMode: "auto_execute_range",
      });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: "auto_execute_range",
        scopeLabel: activeAutoExecutionScopeLabel,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      toast.success(feedback.message);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : `继续自动执行${activeAutoExecutionScopeLabel}失败。`;
      toast.error(message);
    },
  });
  const consistencyIssue = useMemo(
    () => resolveDirectorConsistencyIssue({
      checkpointType: activeAutoDirectorTask?.checkpointType,
      characterCount: characters.length,
      chapterCount: chapters.length,
    }),
    [activeAutoDirectorTask?.checkpointType, chapters.length, characters.length],
  );
  const reviewScope = activeDirectorSession?.reviewScope ?? null;
  const reviewTab = useMemo(() => tabFromScope(reviewScope), [reviewScope]);
  const openReviewStage = () => {
    if (!reviewTab) {
      return;
    }
    setActiveTab(reviewTab);
    setIsTaskDrawerOpen(false);
  };
  const openCandidateSelection = () => {
    if (!activeAutoDirectorTask?.id) {
      return;
    }
    navigate(getCandidateSelectionLink(activeAutoDirectorTask.id));
  };
  const openChapterExecution = () => {
    if (activeAutoDirectorTask?.resumeTarget?.chapterId) {
      setSelectedChapterId(activeAutoDirectorTask.resumeTarget.chapterId);
    }
    setActiveTab("chapter");
    setIsTaskDrawerOpen(false);
  };
  const openQualityRepair = () => {
    if (activeAutoDirectorTask?.resumeTarget?.chapterId) {
      setSelectedChapterId(activeAutoDirectorTask.resumeTarget.chapterId);
    }
    setActiveTab("pipeline");
    setIsTaskDrawerOpen(false);
  };
  const openChapterTitleRepair = (showToast = false) => {
    const targetVolumeId = activeChapterTitleWarning?.volumeId ?? activeAutoDirectorTask?.resumeTarget?.volumeId ?? "";
    setActiveTab("structured");
    setSelectedVolumeId(targetVolumeId);
    setSelectedChapterId("");
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: targetVolumeId || undefined,
      selectedChapterId: "",
      selectedBeatKey: "all",
    });
    setIsTaskDrawerOpen(false);
    if (!showToast) {
      return;
    }
    toast.success(targetVolumeId ? "已定位到当前卷拆章，可直接修复标题。" : "已切到节奏 / 拆章，可直接修复标题。");
  };
  const chapterTitleRepairMutation = useDirectorChapterTitleRepair({
    navigateOnSuccess: false,
    onAfterStart: () => {
      openChapterTitleRepair(false);
    },
  });
  const retryAutoDirectorWithCurrentModelMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可重试的自动导演任务。");
      }
      return retryTask("novel_workflow", activeAutoDirectorTask.id, {
        llmOverride: {
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        resume: true,
      });
    },
    onSuccess: async () => {
      await invalidateAutoDirectorTaskState(activeAutoDirectorTask?.id);
      setIsTaskDrawerOpen(true);
      toast.success(`已切换到 ${llm.provider} / ${llm.model} 并重新启动自动导演。`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "切换当前模型重试失败。";
      toast.error(message);
    },
  });
  const retryAutoDirectorWithTaskModelMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可重试的自动导演任务。");
      }
      return retryTask("novel_workflow", activeAutoDirectorTask.id, { resume: true });
    },
    onSuccess: async () => {
      await invalidateAutoDirectorTaskState(activeAutoDirectorTask?.id);
      setIsTaskDrawerOpen(true);
      toast.success("自动导演已按任务原模型重新启动。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "按原模型重试失败。";
      toast.error(message);
    },
  });
  const cancelAutoDirectorMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可取消的自动导演任务。");
      }
      return cancelTask("novel_workflow", activeAutoDirectorTask.id);
    },
    onSuccess: async () => {
      setIsDirectorExitActionExpanded(false);
      await invalidateAutoDirectorTaskState(activeAutoDirectorTask?.id);
      toast.success("已提交自动导演取消请求。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "取消自动导演失败。";
      toast.error(message);
    },
  });
  useEffect(() => {
    if (activeAutoDirectorTask?.status !== "failed") {
      return;
    }
    if (!activeAutoDirectorTask.id || activeAutoDirectorTask.id === autoOpenedFailedTaskId) {
      return;
    }
    setIsTaskDrawerOpen(true);
    setAutoOpenedFailedTaskId(activeAutoDirectorTask.id);
  }, [activeAutoDirectorTask?.id, activeAutoDirectorTask?.status, autoOpenedFailedTaskId]);
  useEffect(() => {
    if (!activeAutoDirectorTask) {
      setIsDirectorExitActionExpanded(false);
      return;
    }
    if (
      activeAutoDirectorTask.status !== "queued"
      && activeAutoDirectorTask.status !== "running"
      && activeAutoDirectorTask.status !== "waiting_approval"
    ) {
      setIsDirectorExitActionExpanded(false);
    }
  }, [activeAutoDirectorTask]);
  const takeover = useMemo<NovelEditTakeoverState | null>(() => {
    const task = activeAutoDirectorTask;
    if (!task) {
      return null;
    }
    const consistencyIssue = resolveDirectorConsistencyIssue({
      checkpointType: task.checkpointType,
      characterCount: characters.length,
      chapterCount: chapters.length,
    });
    const mode: NovelEditTakeoverState["mode"] = task.status === "failed" || task.status === "cancelled"
      ? "failed"
      : task.status === "queued" || task.status === "running"
        ? "running"
        : "waiting";
    const novelTitle = novelDetailQuery.data?.data?.title?.trim() || task.title?.trim() || "当前项目";
    const reviewScope = activeDirectorSession?.reviewScope ?? null;
    const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
    const actions: NonNullable<NovelEditTakeoverState["actions"]> = [];
    if (activeChapterTitleWarning) {
      actions.push({
        label: chapterTitleRepairMutation.isPending && chapterTitleRepairMutation.pendingTaskId === task.id
          ? "AI 修复中..."
          : activeChapterTitleWarning.label,
        onClick: () => {
          if (hasUnsavedVolumeDraft) {
            toast.error("当前拆章工作区还有未保存修改，请先保存工作区，再发起 AI 修复标题。");
            return;
          }
          chapterTitleRepairMutation.startRepair(task);
        },
        variant: mode === "failed" ? "default" : "outline",
        disabled: chapterTitleRepairMutation.isPending,
      });
    }
    const reviewTab = tabFromScope(reviewScope);
    if (
      mode === "waiting"
      && task.checkpointType === "candidate_selection_required"
    ) {
      actions.push({
        label: "去确认书级方向",
        onClick: openCandidateSelection,
        variant: "default",
      });
    } else if (
      mode === "waiting"
      && reviewTab
      && reviewTab !== activeTab
      && task.checkpointType !== "front10_ready"
      && task.checkpointType !== "chapter_batch_ready"
    ) {
      actions.push({
        label: "去当前审核阶段",
        onClick: () => setActiveTab(reviewTab),
        variant: "outline",
      });
    }
    if (mode === "waiting" && task.checkpointType === "front10_ready") {
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate(),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "进入章节执行",
        onClick: () => {
          if (task.resumeTarget?.chapterId) {
            setSelectedChapterId(task.resumeTarget.chapterId);
          }
          setActiveTab("chapter");
        },
        variant: "outline",
      });
    } else if (mode === "waiting") {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate(),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
    }
    if (mode === "failed" && task.checkpointType === "chapter_batch_ready") {
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate(),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: openQualityRepair,
        variant: "outline",
      });
    }
    if (consistencyIssue) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "修复中..." : "补齐导演产物",
        onClick: () => continueAutoDirectorMutation.mutate(),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
      if (consistencyIssue === "missing_characters") {
        actions.push({
          label: "去角色准备",
          onClick: () => setActiveTab("character"),
          variant: "outline",
        });
      }
    } else if (task.checkpointType === "front10_ready" && mode !== "waiting") {
      actions.push({
        label: "进入章节执行",
        onClick: () => {
          if (task.resumeTarget?.chapterId) {
            setSelectedChapterId(task.resumeTarget.chapterId);
          }
          setActiveTab("chapter");
        },
        variant: mode === "running" ? "outline" : "default",
      });
    }
    if (task.status === "queued" || task.status === "running" || task.status === "waiting_approval") {
      if (isDirectorExitActionExpanded) {
        actions.push({
          label: "继续导演",
          onClick: () => setIsDirectorExitActionExpanded(false),
          variant: "outline",
          disabled: cancelAutoDirectorMutation.isPending,
        });
        actions.push({
          label: cancelAutoDirectorMutation.isPending ? "退出中..." : "退出导演模式",
          onClick: () => cancelAutoDirectorMutation.mutate(),
          variant: "destructive",
          disabled: cancelAutoDirectorMutation.isPending,
        });
      } else {
        actions.push({
          label: "停止导演模式",
          onClick: () => setIsDirectorExitActionExpanded(true),
          variant: "destructive",
          disabled: cancelAutoDirectorMutation.isPending,
        });
      }
    }
    actions.push({
      label: "任务中心",
      onClick: () => setIsTaskDrawerOpen(true),
      variant: mode === "running" ? "outline" : "secondary",
    });

    return {
      mode,
      title: consistencyIssue === "missing_characters"
        ? `《${novelTitle}》导演产物未补齐角色准备`
        : consistencyIssue === "missing_chapters"
          ? `《${novelTitle}》导演产物未同步到章节执行区`
          : buildTakeoverTitle({
            mode,
            novelTitle,
            checkpointType: task.checkpointType,
            scopeLabel: autoExecutionScopeLabel,
          }),
      description: consistencyIssue === "missing_characters"
        ? "任务记录显示已完成开书交接，但当前项目里还没有角色资产，所以角色准备和章节执行都不完整。可以直接补齐导演产物，系统会继续修复。"
        : consistencyIssue === "missing_chapters"
          ? "任务记录显示前几章已经可开写，但当前章节执行区还是空的，说明导演产物还没有完整落库。可以直接补齐导演产物继续修复。"
          : buildTakeoverDescription({
            mode,
            checkpointType: task.checkpointType,
            reviewScope,
            scopeLabel: autoExecutionScopeLabel,
          }),
      progress: task.progress,
      currentAction: consistencyIssue === "missing_characters"
        ? "检测到角色准备仍为空，当前导演结果需要继续补齐。"
        : consistencyIssue === "missing_chapters"
          ? "检测到章节执行区为空，当前导演结果需要继续同步章节资源。"
          : mode === "running" && task.checkpointType === "chapter_batch_ready" && task.currentItemLabel?.includes("已暂停")
            ? `正在继续自动执行${autoExecutionScopeLabel}`
            : task.currentItemLabel ?? null,
      checkpointLabel: consistencyIssue
        ? "导演产物待补齐"
        : mode === "running" && task.checkpointType === "chapter_batch_ready"
          ? `${autoExecutionScopeLabel}自动执行中`
          : formatTakeoverCheckpoint(task.checkpointType, task),
      taskId: task.id,
      actions,
    };
  }, [
    activeAutoDirectorTask,
    activeChapterTitleWarning,
    activeDirectorSession,
    activeTab,
    chapters.length,
    chapterTitleRepairMutation,
    characters.length,
    cancelAutoDirectorMutation,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
    hasUnsavedVolumeDraft,
    isDirectorExitActionExpanded,
    novelDetailQuery.data?.data?.title,
    openCandidateSelection,
    openQualityRepair,
    setActiveTab,
    setSelectedChapterId,
    workflowTaskId,
  ]);
  const taskDrawerActions = useMemo<NovelTaskDrawerState["actions"]>(() => {
    const task = activeAutoDirectorTask;
    if (!task) {
      return [];
    }
    const actions: NovelTaskDrawerState["actions"] = [];
    if (activeChapterTitleWarning) {
      actions.push({
        label: chapterTitleRepairMutation.isPending && chapterTitleRepairMutation.pendingTaskId === task.id
          ? "AI 修复中..."
          : activeChapterTitleWarning.label,
        onClick: () => {
          if (hasUnsavedVolumeDraft) {
            toast.error("当前拆章工作区还有未保存修改，请先保存工作区，再发起 AI 修复标题。");
            return;
          }
          chapterTitleRepairMutation.startRepair(task);
        },
        variant: "default",
        disabled: chapterTitleRepairMutation.isPending,
      });
    }
    if (consistencyIssue) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "补齐中..." : "补齐导演产物",
        onClick: () => continueAutoDirectorMutation.mutate(),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
      if (consistencyIssue === "missing_characters") {
        actions.push({
          label: "去角色准备",
          onClick: () => {
            setActiveTab("character");
            setIsTaskDrawerOpen(false);
          },
          variant: "outline",
        });
      }
    } else if (task.status === "waiting_approval" && task.checkpointType === "front10_ready") {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate(),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "进入章节执行",
        onClick: openChapterExecution,
        variant: "outline",
      });
    } else if (task.status === "waiting_approval" && task.checkpointType === "candidate_selection_required") {
      actions.push({
        label: "去确认书级方向",
        onClick: openCandidateSelection,
        variant: "default",
      });
    } else if (
      task.status === "waiting_approval"
      && reviewTab
      && task.checkpointType !== "front10_ready"
      && task.checkpointType !== "chapter_batch_ready"
    ) {
      actions.push({
        label: "去当前审核阶段",
        onClick: openReviewStage,
        variant: "default",
      });
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate(),
        variant: "outline",
        disabled: continueAutoDirectorMutation.isPending,
      });
    } else if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate(),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: openQualityRepair,
        variant: "outline",
      });
    } else if (task.checkpointType === "front10_ready") {
      actions.push({
        label: "进入章节执行",
        onClick: openChapterExecution,
        variant: "default",
      });
    }

    if (task.status === "failed" || task.status === "cancelled") {
      actions.push({
        label: retryAutoDirectorWithCurrentModelMutation.isPending ? "切换中..." : "用当前模型重试",
        onClick: () => retryAutoDirectorWithCurrentModelMutation.mutate(),
        variant: "default",
        disabled: retryAutoDirectorWithCurrentModelMutation.isPending,
      });
      actions.push({
        label: retryAutoDirectorWithTaskModelMutation.isPending ? "重试中..." : "用原模型重试",
        onClick: () => retryAutoDirectorWithTaskModelMutation.mutate(),
        variant: "outline",
        disabled: retryAutoDirectorWithTaskModelMutation.isPending,
      });
    }

    if (task.status === "queued" || task.status === "running" || task.status === "waiting_approval") {
      actions.push({
        label: cancelAutoDirectorMutation.isPending ? "取消中..." : "取消任务",
        onClick: () => cancelAutoDirectorMutation.mutate(),
        variant: "destructive",
        disabled: cancelAutoDirectorMutation.isPending,
      });
    }
    return actions;
  }, [
    activeAutoDirectorTask,
    activeChapterTitleWarning,
    cancelAutoDirectorMutation,
    chapterTitleRepairMutation,
    consistencyIssue,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
    hasUnsavedVolumeDraft,
    openCandidateSelection,
    openReviewStage,
    openChapterExecution,
    openQualityRepair,
    retryAutoDirectorWithCurrentModelMutation,
    retryAutoDirectorWithTaskModelMutation,
    reviewTab,
    setActiveTab,
  ]);

  useNovelEditInitialization({
    detail: novelDetailQuery.data?.data,
    chapters,
    characters,
    baseCharacters,
    basicForm,
    selectedCharacter,
    selectedChapterId,
    selectedCharacterId,
    selectedBaseCharacterId,
    sourceNovelBookAnalysisOptions,
    sourceBookAnalysesLoading: sourceBookAnalysesQuery.isLoading,
    sourceBookAnalysesFetching: sourceBookAnalysesQuery.isFetching,
    setBasicForm,
    setVolumeDraft,
    setPipelineForm,
    setSelectedChapterId,
    setSelectedCharacterId,
    setSelectedBaseCharacterId,
    setCharacterForm,
  });

  useEffect(() => {
    const workspace = volumeWorkspaceQuery.data?.data;
    if (!workspace) {
      return;
    }
    setVolumeDraft(workspace.volumes ?? []);
    setVolumeStrategyPlan(workspace.strategyPlan ?? null);
    setVolumeCritiqueReport(workspace.critiqueReport ?? null);
    setVolumeBeatSheets(workspace.beatSheets ?? []);
    setVolumeRebalanceDecisions(workspace.rebalanceDecisions ?? []);
  }, [volumeWorkspaceQuery.data?.data]);

  useEffect(() => {
    if (!id) {
      return;
    }
    useStructuredOutlineWorkspaceStore.getState().patchWorkspace(id, {
      selectedVolumeId: selectedVolumeId || undefined,
      selectedChapterId: selectedChapterId || undefined,
    });
  }, [id, selectedChapterId, selectedVolumeId]);

  useEffect(() => {
    if (!id) {
      return;
    }
    if (
      activeAutoDirectorTask
      && (
        activeAutoDirectorTask.status === "queued"
        || activeAutoDirectorTask.status === "running"
        || activeAutoDirectorTask.status === "waiting_approval"
      )
    ) {
      return;
    }
    const labels: Record<string, string> = {
      basic: "项目设定已打开",
      story_macro: "故事宏观规划已打开",
      character: "角色准备已打开",
      outline: "卷战略 / 卷骨架已打开",
      structured: "节奏 / 拆章已打开",
      chapter: selectedChapter ? `正在查看第${selectedChapter.order}章执行面板` : "章节执行已打开",
      pipeline: "质量修复 / 流水线已打开",
    };
    void syncNovelWorkflowStageSilently({
      novelId: id,
      stage: workflowStageFromTab(activeTab),
      itemLabel: labels[activeTab] ?? "小说主流程已打开",
      chapterId: activeTab === "chapter" ? selectedChapterId || undefined : undefined,
      volumeId: activeTab === "structured" || activeTab === "outline" ? selectedVolumeId || undefined : undefined,
      status: "waiting_approval",
    });
  }, [activeAutoDirectorTask, activeTab, id, selectedChapter?.order, selectedChapterId, selectedVolumeId]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask || !activeAutoDirectorRefreshSignature) {
      autoDirectorRefreshSignatureRef.current = activeAutoDirectorRefreshSignature;
      return;
    }
    if (!autoDirectorRefreshSignatureRef.current) {
      autoDirectorRefreshSignatureRef.current = activeAutoDirectorRefreshSignature;
      return;
    }
    if (autoDirectorRefreshSignatureRef.current === activeAutoDirectorRefreshSignature) {
      return;
    }
    autoDirectorRefreshSignatureRef.current = activeAutoDirectorRefreshSignature;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacro(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacroState(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) }),
      queryClient.invalidateQueries({ queryKey: ["novels", "payoff-ledger", id] }),
      queryClient.invalidateQueries({ queryKey: ["novels", "character-dynamics-overview", id] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(id) }),
    ]);
  }, [activeAutoDirectorRefreshSignature, activeAutoDirectorTask, id, queryClient]);

  useEffect(() => {
    if (!id || !activeAutoDirectorTask) {
      return;
    }
    if (
      activeAutoDirectorTask.status !== "queued"
      && activeAutoDirectorTask.status !== "running"
      && activeAutoDirectorTask.status !== "waiting_approval"
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeAutoDirectorTask, id, queryClient]);

  const outlineText = useMemo(
    () => buildOutlinePreviewFromVolumes(normalizedVolumeDraft),
    [normalizedVolumeDraft],
  );
  const structuredDraftText = useMemo(
    () => buildStructuredPreviewFromVolumes(normalizedVolumeDraft),
    [normalizedVolumeDraft],
  );
  const draftVolumeDocument = useMemo(() => ({
    novelId: id,
    workspaceVersion: "v2" as const,
    volumes: normalizedVolumeDraft,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    readiness: buildVolumePlanningReadiness({
      volumes: normalizedVolumeDraft,
      strategyPlan: volumeStrategyPlan,
      beatSheets: volumeBeatSheets,
    }),
    derivedOutline: outlineText,
    derivedStructuredOutline: structuredDraftText,
    source: savedVolumeWorkspace?.source ?? "volume",
    activeVersionId: savedVolumeWorkspace?.activeVersionId ?? null,
  }), [
    id,
    normalizedVolumeDraft,
    outlineText,
    savedVolumeWorkspace?.activeVersionId,
    savedVolumeWorkspace?.source,
    structuredDraftText,
    volumeBeatSheets,
    volumeCritiqueReport,
    volumeRebalanceDecisions,
    volumeStrategyPlan,
  ]);

  const invalidateNovelDetail = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) });
    await queryClient.invalidateQueries({ queryKey: ["novels", "payoff-ledger", id] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(id) });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-plan", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-audit-reports", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "state-snapshots", id] });
  };

  const chapterSSE = useSSE({
    onRunStatus: (payload) => {
      if ((payload.phase === "finalizing" || payload.phase === "completed") && payload.message) {
        setChapterOperationMessage(payload.message);
      }
    },
    onDone: async () => {
      await invalidateNovelDetail();
      setActiveChapterStream(null);
    },
  });
  const bibleSSE = useSSE({ onDone: invalidateNovelDetail });
  const beatsSSE = useSSE({ onDone: invalidateNovelDetail });
  const repairSSE = useSSE({
    onRunStatus: (payload) => {
      if ((payload.phase === "finalizing" || payload.phase === "completed") && payload.message) {
        setChapterOperationMessage(payload.message);
      }
    },
    onDone: async (fullContent) => {
      setRepairAfterContent(fullContent);
      await invalidateNovelDetail();
      setActiveRepairStream(null);
    },
  });

  const {
    saveBasicMutation,
    saveOutlineMutation,
    saveStructuredMutation,
    optimizeOutlineMutation,
    optimizeStructuredMutation,
    syncStructuredChaptersMutation,
    createChapterMutation,
    runPipelineMutation,
    reviewMutation,
    hookMutation,
  } = useNovelEditMutations({
    id,
    basicForm,
    hasCharacters,
    outlineText,
    outlineOptimizeInstruction,
    setOutlineOptimizePreview,
    setOutlineOptimizeMode,
    setOutlineOptimizeSourceText,
    structuredDraftText,
    structuredOptimizeInstruction,
    setStructuredOptimizePreview,
    setStructuredOptimizeMode,
    setStructuredOptimizeSourceText,
    volumeDocument: draftVolumeDocument,
    llm,
    pipelineForm,
    selectedChapterId,
    chapterCount: novelDetailQuery.data?.data?.chapters?.length ?? 0,
    setActiveTab,
    setSelectedChapterId,
    setCurrentJobId,
    setPipelineMessage,
    setStructuredMessage,
    setReviewResult,
    queryClient,
    invalidateNovelDetail,
  });

  const {
    characterTimelineQuery,
    syncTimelineMutation,
    syncAllTimelineMutation,
    evolveCharacterMutation,
    worldCheckMutation,
    saveCharacterMutation,
    importBaseCharacterMutation,
    quickCreateCharacterMutation,
    deleteCharacterMutation,
    generateSupplementalCharacterMutation,
    applySupplementalCharacterMutation,
  } = useNovelCharacterMutations({
    id,
    selectedCharacterId,
    selectedBaseCharacter,
    characters,
    pipelineForm,
    llm,
    characterForm,
    quickCharacterForm,
    queryClient,
    setCharacterMessage,
    setSelectedCharacterId,
    setQuickCharacterForm,
  });

  const {
    volumeMessage,
    volumeVersions,
    selectedVersionId,
    setSelectedVersionId,
    diffResult,
    impactResult,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  } = useVolumeVersionControl({
    novelId: id,
    draftDocument: draftVolumeDocument,
    setDraftVolumes: setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    queryClient,
    invalidateNovelDetail,
  });

  const goToCharacterTab = () => setActiveTab("character");
  const {
    generateChapterPlanMutation,
    replanChapterMutation,
    fullAuditMutation,
    reviewActionKind,
    runChapterReview,
    handleGenerateSelectedChapter,
    handleAbortChapterStream,
    handleAbortRepair,
    chapterExecutionActions,
  } = useNovelEditChapterRuntime({
    novelId: id,
    llm,
    selectedChapterId,
    selectedChapter,
    chapterStrategy,
    reviewResult,
    openAuditIssueIds,
    queryClient,
    invalidateNovelDetail,
    setChapterOperationMessage,
    setReviewResult,
    setRepairBeforeContent,
    setRepairAfterContent,
    setActiveChapterStream,
    setActiveRepairStream,
    chapterSSE,
    repairSSE,
  });

  const renderTakeoverEntry = (
    step: "basic" | "story_macro" | "character" | "outline" | "structured" | "chapter" | "pipeline",
    variant: "default" | "outline" | "secondary" = "default",
  ) => (
    <NovelExistingProjectTakeoverDialog
      novelId={id}
      basicForm={basicForm}
      genreOptions={genreOptions}
      storyModeOptions={storyModeOptions}
      worldOptions={worldListQuery.data?.data ?? []}
      triggerVariant={variant}
      defaultEntryStep={step}
    />
  );

  const { basicTab, outlineTab, structuredTab } = buildNovelEditPlanningTabs({
    id,
    basicForm,
    genreOptions,
    storyModeOptions,
    worldOptions: worldListQuery.data?.data ?? [],
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: sourceBookAnalysesQuery.isLoading,
    availableBookAnalysisSections: [...BOOK_ANALYSIS_SECTIONS],
    worldSliceView,
    worldSliceMessage,
    isRefreshingWorldSlice,
    isSavingWorldSliceOverrides,
    onBasicFormChange: (patch) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
    onSaveBasic: () => saveBasicMutation.mutate(),
    onRefreshWorldSlice: refreshWorldSlice,
    onSaveWorldSliceOverrides: saveWorldSliceOverrides,
    isSavingBasic: saveBasicMutation.isPending,
    projectQuickStart: undefined,
    basicDirectorTakeoverEntry: undefined,
    storyMacroDirectorTakeoverEntry: undefined,
    outlineDirectorTakeoverEntry: undefined,
    structuredDirectorTakeoverEntry: undefined,
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    isGeneratingStrategy,
    onGenerateStrategy: startStrategyGeneration,
    isCritiquingStrategy,
    onCritiqueStrategy: startStrategyCritique,
    isGeneratingSkeleton,
    onGenerateSkeleton: startSkeletonGeneration,
    onGoToCharacterTab: goToCharacterTab,
    latestStateSnapshot,
    payoffLedger,
    outlineText,
    structuredDraftText,
    volumes: normalizedVolumeDraft,
    onVolumeFieldChange: handleVolumeFieldChange,
    onOpenPayoffsChange: handleOpenPayoffsChange,
    onAddVolume: handleAddVolume,
    onRemoveVolume: handleRemoveVolume,
    onMoveVolume: handleMoveVolume,
    onSaveOutline: () => saveOutlineMutation.mutate(),
    isSavingOutline: saveOutlineMutation.isPending,
    volumeMessage: volumeGenerationMessage || volumeMessage,
    volumeVersions,
    selectedVersionId,
    onSelectedVersionChange: setSelectedVersionId,
    onCreateDraftVersion: () => createDraftVersionMutation.mutate(),
    isCreatingDraftVersion: createDraftVersionMutation.isPending,
    onLoadSelectedVersionToDraft: loadSelectedVersionToDraft,
    onActivateVersion: () => activateVersionMutation.mutate(),
    isActivatingVersion: activateVersionMutation.isPending,
    onFreezeVersion: () => freezeVersionMutation.mutate(),
    isFreezingVersion: freezeVersionMutation.isPending,
    onLoadVersionDiff: () => diffMutation.mutate(),
    isLoadingVersionDiff: diffMutation.isPending,
    diffResult,
    onAnalyzeDraftImpact: () => analyzeDraftImpactMutation.mutate(),
    isAnalyzingDraftImpact: analyzeDraftImpactMutation.isPending,
    onAnalyzeVersionImpact: () => analyzeVersionImpactMutation.mutate(),
    isAnalyzingVersionImpact: analyzeVersionImpactMutation.isPending,
    impactResult,
    beatSheets: volumeBeatSheets,
    rebalanceDecisions: volumeRebalanceDecisions,
    isGeneratingBeatSheet,
    onGenerateBeatSheet: startBeatSheetGeneration,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    onGenerateChapterList: startChapterListGeneration,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail: startChapterDetailGeneration,
    onGenerateChapterDetailBundle: startChapterDetailBundleGeneration,
    syncPreview: volumeSyncPreview,
    syncOptions: volumeSyncOptions,
    onSyncOptionsChange: (patch) => setVolumeSyncOptions((prev) => ({ ...prev, ...patch })),
    onApplySync: (options) => syncStructuredChaptersMutation.mutate(options),
    isApplyingSync: syncStructuredChaptersMutation.isPending,
    syncMessage: structuredMessage,
    chapters: outlineSyncChapters,
    onChapterFieldChange: handleChapterFieldChange,
    onChapterNumberChange: handleChapterNumberChange,
    onChapterPayoffRefsChange: handleChapterPayoffRefsChange,
    onAddChapter: handleAddChapter,
    onRemoveChapter: handleRemoveChapter,
    onMoveChapter: handleMoveChapter,
    onApplyBatch: (patch) => {
      setVolumeDraft((prev) => applyVolumeChapterBatch(prev, patch));
    },
    onSaveStructured: () => saveStructuredMutation.mutate(),
    isSavingStructured: saveStructuredMutation.isPending,
  });
  const chapterTab = {
    novelId: id,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter: setSelectedChapterId,
    onGoToCharacterTab: goToCharacterTab,
    onCreateChapter: () => createChapterMutation.mutate(),
    isCreatingChapter: createChapterMutation.isPending,
    chapterOperationMessage,
    strategy: chapterStrategy,
    onStrategyChange: (field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom", value: string | number) =>
      setChapterStrategy((prev) => ({ ...prev, [field]: value } as ChapterExecutionStrategy)),
    onApplyStrategy: chapterExecutionActions.applyStrategy,
    isApplyingStrategy: chapterExecutionActions.isPatchingChapter,
    onGenerateSelectedChapter: handleGenerateSelectedChapter,
    onRewriteChapter: chapterExecutionActions.rewriteChapter,
    onExpandChapter: chapterExecutionActions.expandChapter,
    onCompressChapter: chapterExecutionActions.compressChapter,
    onSummarizeChapter: chapterExecutionActions.summarizeChapter,
    onGenerateTaskSheet: chapterExecutionActions.generateTaskSheet,
    onGenerateSceneCards: chapterExecutionActions.generateSceneCards,
    onGenerateChapterPlan: () => generateChapterPlanMutation.mutate(),
    onReplanChapter: () => replanChapterMutation.mutate(),
    onRunFullAudit: () => runChapterReview("full_audit"),
    onCheckContinuity: chapterExecutionActions.checkContinuity,
    onCheckCharacterConsistency: chapterExecutionActions.checkCharacterConsistency,
    onCheckPacing: chapterExecutionActions.checkPacing,
    onAutoRepair: chapterExecutionActions.autoRepair,
    onStrengthenConflict: chapterExecutionActions.strengthenConflict,
    onEnhanceEmotion: chapterExecutionActions.enhanceEmotion,
    onUnifyStyle: chapterExecutionActions.unifyStyle,
    onAddDialogue: chapterExecutionActions.addDialogue,
    onAddDescription: chapterExecutionActions.addDescription,
    isGeneratingTaskSheet: chapterExecutionActions.isGeneratingTaskSheet,
    isGeneratingSceneCards: chapterExecutionActions.isGeneratingSceneCards,
    isSummarizingChapter: chapterExecutionActions.isSummarizingChapter,
    reviewActionKind,
    repairActionKind: chapterExecutionActions.repairActionKind,
    generationActionKind: chapterExecutionActions.generationActionKind,
    isReviewingChapter: fullAuditMutation.isPending,
    isRepairingChapter: repairSSE.isStreaming,
    reviewResult,
    replanRecommendation: reviewResult?.replanRecommendation ?? null,
    lastReplanResult: replanChapterMutation.data?.data ?? null,
    chapterPlan,
    latestStateSnapshot,
    chapterStateSnapshot,
    chapterAuditReports,
    backgroundSyncActivities: pipelineBackgroundActivities,
    isGeneratingChapterPlan: generateChapterPlanMutation.isPending,
    isReplanningChapter: replanChapterMutation.isPending,
    isRunningFullAudit: fullAuditMutation.isPending && reviewActionKind === "full_audit",
    chapterQualityReport,
    chapterRuntimePackage: chapterSSE.runtimePackage,
    repairStreamContent: repairSSE.content,
    isRepairStreaming: repairSSE.isStreaming,
    repairStreamingChapterId: activeRepairStream?.chapterId ?? null,
    repairStreamingChapterLabel: activeRepairStream?.chapterLabel ?? null,
    repairRunStatus: repairSSE.latestRun,
    onAbortRepair: handleAbortRepair,
    streamContent: chapterSSE.content,
    isStreaming: chapterSSE.isStreaming,
    streamingChapterId: activeChapterStream?.chapterId ?? null,
    streamingChapterLabel: activeChapterStream?.chapterLabel ?? null,
    chapterRunStatus: chapterSSE.latestRun,
    onAbortStream: handleAbortChapterStream,
    directorTakeoverEntry: undefined,
  };
  const pipelineTab = { novelId: id, worldInjectionSummary, hasCharacters, onGoToCharacterTab: goToCharacterTab, pipelineForm, onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode", value: number | boolean | string) => setPipelineForm((prev) => ({ ...prev, [field]: value } as typeof prev)), maxOrder, onGenerateBible: () => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 }), onAbortBible: bibleSSE.abort, isBibleStreaming: bibleSSE.isStreaming, bibleStreamContent: bibleSSE.content, onGenerateBeats: () => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder }), onAbortBeats: beatsSSE.abort, isBeatsStreaming: beatsSSE.isStreaming, beatsStreamContent: beatsSSE.content, onRunPipeline: (patch?: Partial<typeof pipelineForm>) => runPipelineMutation.mutate(patch), isRunningPipeline: runPipelineMutation.isPending, pipelineMessage, pipelineJob: pipelineJobQuery.data?.data, chapters, selectedChapterId, onSelectedChapterChange: setSelectedChapterId, onReviewChapter: () => reviewMutation.mutate(), isReviewing: reviewMutation.isPending, onRepairChapter: () => { setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); setActiveRepairStream(selectedChapter ? { chapterId: selectedChapter.id, chapterLabel: `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}` } : null); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: reviewResult?.issues ?? [], auditIssueIds: openAuditIssueIds }); }, isRepairing: repairSSE.isStreaming, onGenerateHook: () => hookMutation.mutate(), isGeneratingHook: hookMutation.isPending, reviewResult, repairBeforeContent, repairAfterContent, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: handleAbortRepair, qualitySummary, chapterReports: qualityReportQuery.data?.data?.chapterReports ?? [], bible, plotBeats };
  const characterTab = { novelId: id, llmProvider: llm.provider, llmModel: llm.model, characterMessage, quickCharacterForm, onQuickCharacterFormChange: (field: "name" | "role", value: string) => setQuickCharacterForm((prev) => ({ ...prev, [field]: value })), onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => quickCreateCharacterMutation.mutate(payload), isQuickCreating: quickCreateCharacterMutation.isPending, onGenerateSupplementalCharacters: generateSupplementalCharacterMutation.mutateAsync, isGeneratingSupplementalCharacters: generateSupplementalCharacterMutation.isPending, onApplySupplementalCharacter: applySupplementalCharacterMutation.mutateAsync, isApplyingSupplementalCharacter: applySupplementalCharacterMutation.isPending, characters, coreCharacterCount, baseCharacters, selectedBaseCharacterId, onSelectedBaseCharacterChange: setSelectedBaseCharacterId, selectedBaseCharacter, importedBaseCharacterIds, onImportBaseCharacter: () => importBaseCharacterMutation.mutate(), isImportingBaseCharacter: importBaseCharacterMutation.isPending, selectedCharacterId, onSelectedCharacterChange: setSelectedCharacterId, onDeleteCharacter: (characterId: string) => deleteCharacterMutation.mutate(characterId), isDeletingCharacter: deleteCharacterMutation.isPending, deletingCharacterId: deleteCharacterMutation.variables ?? "", onSyncTimeline: () => syncTimelineMutation.mutate(), isSyncingTimeline: syncTimelineMutation.isPending, onSyncAllTimeline: () => syncAllTimelineMutation.mutate(), isSyncingAllTimeline: syncAllTimelineMutation.isPending, onEvolveCharacter: () => evolveCharacterMutation.mutate(), isEvolvingCharacter: evolveCharacterMutation.isPending, onWorldCheck: () => worldCheckMutation.mutate(), isCheckingWorld: worldCheckMutation.isPending, selectedCharacter, characterForm, onCharacterFormChange: (field: "name" | "role" | "gender" | "personality" | "background" | "development" | "currentState" | "currentGoal", value: string) => setCharacterForm((prev) => ({ ...prev, [field]: value })), onSaveCharacter: () => saveCharacterMutation.mutate(), isSavingCharacter: saveCharacterMutation.isPending, timelineEvents: characterTimelineQuery.data?.data ?? [] };

  const activeStepTakeoverEntry = renderTakeoverEntry(
    activeTab === "story_macro"
      ? "story_macro"
      : activeTab === "character"
        ? "character"
        : activeTab === "outline"
          ? "outline"
          : activeTab === "structured"
            ? "structured"
            : activeTab === "chapter"
              ? "chapter"
              : activeTab === "pipeline"
                ? "pipeline"
                : "basic",
  );
  const exportVariables = exportNovelMutation.variables;
  const isExportingCurrentMarkdown = exportNovelMutation.isPending
    && exportVariables?.scope === currentExportScope
    && exportVariables?.format === "markdown";
  const isExportingCurrentJson = exportNovelMutation.isPending
    && exportVariables?.scope === currentExportScope
    && exportVariables?.format === "json";
  const isExportingFullMarkdown = exportNovelMutation.isPending
    && exportVariables?.scope === "full"
    && exportVariables?.format === "markdown";
  const isExportingFullJson = exportNovelMutation.isPending
    && exportVariables?.scope === "full"
    && exportVariables?.format === "json";

  return (
    <NovelEditView
      id={id}
      activeTab={activeTab}
      workflowCurrentTab={workflowCurrentTab}
      onActiveTabChange={setActiveTab}
      exportControls={{
        canExportCurrentStep: Boolean(currentExportScope),
        isExportingCurrentMarkdown,
        isExportingCurrentJson,
        isExportingFullMarkdown,
        isExportingFullJson,
        onExportCurrent: (format) => {
          if (!currentExportScope) {
            return;
          }
          exportNovelMutation.mutate({
            format,
            scope: currentExportScope,
            novelTitle: exportNovelTitle,
          });
        },
        onExportFull: (format) => {
          exportNovelMutation.mutate({
            format,
            scope: "full",
            novelTitle: exportNovelTitle,
          });
        },
      }}
      basicTab={basicTab}
      storyMacroTab={storyMacroTab}
      outlineTab={outlineTab}
      structuredTab={structuredTab}
      chapterTab={chapterTab}
      pipelineTab={pipelineTab}
      characterTab={characterTab}
      takeover={takeover}
      activeStepTakeoverEntry={activeStepTakeoverEntry}
      taskDrawer={{
        open: isTaskDrawerOpen,
        onOpenChange: setIsTaskDrawerOpen,
        task: activeAutoDirectorTask,
        currentUiModel: {
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        actions: taskDrawerActions,
        onOpenFullTaskCenter: openAutoDirectorTaskCenter,
      }}
    />
  );
}
