import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { DirectorLockScope, DirectorSessionState } from "@ai-novel/shared/types/novelDirector";
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
  getLatestStateSnapshot,
  getNovelDetail,
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
import { useLLMStore } from "@/store/llmStore";
import { buildWorldInjectionSummary } from "./novelEdit.utils";
import type { QuickCharacterCreatePayload } from "./components/characterPanel.utils";
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
  if (tab === "basic") return "basic";
  if (tab === "story_macro") return "story_macro";
  if (tab === "character") return "character";
  if (tab === "outline") return "outline";
  if (tab === "structured") return "structured";
  if (tab === "chapter") return "chapter";
  if (tab === "pipeline") return "pipeline";
  return null;
}

function tabFromScope(scope: DirectorLockScope | null | undefined): "basic" | "story_macro" | "character" | "outline" | "structured" | "chapter" | "pipeline" | null {
  if (!scope) {
    return null;
  }
  return scope;
}

function formatTakeoverCheckpoint(checkpoint: string | null | undefined): string {
  if (checkpoint === "candidate_selection_required") {
    return "等待确认书级方向";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract 已就绪";
  }
  if (checkpoint === "character_setup_required") {
    return "角色准备待审核";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "卷战略 / 卷骨架待审核";
  }
  if (checkpoint === "front10_ready") {
    return "前 10 章可开写";
  }
  if (checkpoint === "chapter_batch_ready") {
    return "前 10 章自动执行已暂停";
  }
  if (checkpoint === "workflow_completed") {
    return "主流程完成";
  }
  return "导演流程进行中";
}

function buildTakeoverTitle(input: {
  mode: NovelEditTakeoverState["mode"];
  novelTitle: string;
  checkpointType: string | null | undefined;
}): string {
  if (input.mode === "running" && input.checkpointType === "front10_ready") {
    return `《${input.novelTitle}》正在自动执行前 10 章`;
  }
  if (input.mode === "waiting") {
    if (input.checkpointType === "character_setup_required") {
      return `《${input.novelTitle}》等待审核角色准备`;
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return `《${input.novelTitle}》等待审核卷战略 / 卷骨架`;
    }
    if (input.checkpointType === "front10_ready") {
      return `《${input.novelTitle}》已完成自动导演交接`;
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `《${input.novelTitle}》前 10 章自动执行已暂停`;
    }
    return `《${input.novelTitle}》自动导演已中断`;
  }
  if (input.mode === "loading") {
    return `《${input.novelTitle}》自动导演状态同步中`;
  }
  return `《${input.novelTitle}》正在自动导演`;
}

function buildTakeoverDescription(input: {
  mode: NovelEditTakeoverState["mode"];
  checkpointType: string | null | undefined;
  reviewScope: DirectorLockScope | null | undefined;
}): string {
  if (input.mode === "running" && input.checkpointType === "front10_ready") {
    return "AI 正在后台自动执行前 10 章，并会继续完成审校与修复。当前章节执行和质量修复区会临时锁定，避免与后台写入冲突。";
  }
  if (input.mode === "waiting") {
    if (input.checkpointType === "character_setup_required") {
      return "角色准备已经生成。你可以先检查核心角色、关系和当前目标，确认后再继续自动导演。";
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return "当前可以审核并微调卷战略 / 卷骨架。确认后再继续自动生成第 1 卷节奏板、拆章和前 10 章细化。";
    }
    if (input.checkpointType === "front10_ready") {
      return "自动导演已经完成第 1 卷开写准备。你可以直接进入章节执行，也可以继续让 AI 自动执行前 10 章。";
    }
    if (input.reviewScope) {
      return "自动导演已到达审核点。请先检查当前阶段产物，再决定是否继续推进。";
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return "前 10 章自动执行已暂停。建议先查看任务中心或质量修复区，再决定是否继续自动执行。";
    }
    return "后台导演流程已中断。建议先去任务中心查看失败原因，再决定是否从最近检查点恢复。";
  }
  if (input.mode === "loading") {
    return "正在同步当前自动导演状态与锁定范围。";
  }
  return "AI 正在后台接管这本书的开书流程。为避免和自动写入冲突，当前编辑区域会按阶段临时锁定。";
}

function buildTakeoverOverlayMessage(input: {
  mode: NovelEditTakeoverState["mode"];
  checkpointType: string | null | undefined;
  reviewScope: DirectorLockScope | null | undefined;
}): string {
  if (input.mode === "waiting" && input.reviewScope) {
    return `当前流程正在等待「${tabFromScope(input.reviewScope) === "outline" ? "卷战略 / 卷骨架" : tabFromScope(input.reviewScope) === "character" ? "角色准备" : "当前阶段"}」审核，后续区域暂不开放手动修改。`;
  }
  if (input.mode === "running" && input.checkpointType === "front10_ready") {
    return "AI 正在后台自动执行前 10 章。当前章节执行与质量修复区暂不建议手动修改，避免与批量写入冲突。";
  }
  if (input.checkpointType === "front10_ready") {
    return "自动导演已交接完成，当前区域可以自由编辑。";
  }
  return "AI 正在接管当前模块，暂时不建议手动修改，避免与后台导演结果发生冲突。";
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
    maxRetries: 2,
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
    isGeneratingStrategy,
    isCritiquingStrategy,
    isGeneratingSkeleton,
    isGeneratingBeatSheet,
    isGeneratingChapterList,
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
  const chapterAuditReports = chapterAuditReportsQuery.data?.data ?? [];
  const activeAutoDirectorTask = activeAutoDirectorTaskQuery.data?.data ?? null;
  const activeDirectorSession = useMemo(() => {
    const raw = activeAutoDirectorTask?.meta.directorSession;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return raw as DirectorSessionState;
  }, [activeAutoDirectorTask?.meta.directorSession]);
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("自动导演已继续在后台推进。");
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
        continuationMode: "auto_execute_front10",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(id) });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("自动导演已继续执行前 10 章，并会在后台自动审校与修复。");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "继续自动执行前 10 章失败。";
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
    const activeScope = scopeFromTab(activeTab);
    const lockedScopes = activeDirectorSession?.lockedScopes ?? [];
    const reviewScope = activeDirectorSession?.reviewScope ?? null;
    const isFront10AutoExecutionRunning = Boolean(
      mode === "running"
      && task.checkpointType === "front10_ready"
      && activeDirectorSession?.runMode === "auto_to_execution",
    );
    const overlay = Boolean(
      activeScope
      && lockedScopes.includes(activeScope)
      && reviewScope !== activeScope
      && (task.checkpointType !== "front10_ready" || isFront10AutoExecutionRunning),
    );
    const actions: NonNullable<NovelEditTakeoverState["actions"]> = [];
    const reviewTab = tabFromScope(reviewScope);
    if (
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
        label: continueAutoExecutionMutation.isPending ? "继续执行中..." : "继续自动执行前 10 章",
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
        label: continueAutoExecutionMutation.isPending ? "继续执行中..." : "继续自动执行前 10 章",
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
      actions.push({
        label: cancelAutoDirectorMutation.isPending ? "停止中..." : "停止自动导演",
        onClick: () => cancelAutoDirectorMutation.mutate(),
        variant: "destructive",
        disabled: cancelAutoDirectorMutation.isPending,
      });
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
          }),
      description: consistencyIssue === "missing_characters"
        ? "任务记录显示已完成开书交接，但当前项目里还没有角色资产，所以角色准备和章节执行都不完整。可以直接补齐导演产物，系统会继续修复。"
        : consistencyIssue === "missing_chapters"
          ? "任务记录显示前几章已经可开写，但当前章节执行区还是空的，说明导演产物还没有完整落库。可以直接补齐导演产物继续修复。"
          : buildTakeoverDescription({
            mode,
            checkpointType: task.checkpointType,
            reviewScope,
          }),
      progress: task.progress,
      currentAction: consistencyIssue === "missing_characters"
        ? "检测到角色准备仍为空，当前导演结果需要继续补齐。"
        : consistencyIssue === "missing_chapters"
          ? "检测到章节执行区为空，当前导演结果需要继续同步章节资源。"
          : task.currentItemLabel ?? null,
      checkpointLabel: consistencyIssue
        ? "导演产物待补齐"
        : formatTakeoverCheckpoint(task.checkpointType),
      taskId: task.id,
      overlay: consistencyIssue ? false : overlay,
      overlayMessage: !consistencyIssue && overlay
        ? buildTakeoverOverlayMessage({
          mode,
          checkpointType: task.checkpointType,
          reviewScope,
        })
        : null,
      actions,
    };
  }, [
    activeAutoDirectorTask,
    activeDirectorSession,
    activeTab,
    chapters.length,
    characters.length,
    cancelAutoDirectorMutation,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
    navigate,
    novelDetailQuery.data?.data?.title,
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
      actions.push({
        label: continueAutoExecutionMutation.isPending ? "继续执行中..." : "继续自动执行前 10 章",
        onClick: () => continueAutoExecutionMutation.mutate(),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "进入章节执行",
        onClick: openChapterExecution,
        variant: "outline",
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
      actions.push({
        label: continueAutoExecutionMutation.isPending ? "继续执行中..." : "继续自动执行前 10 章",
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
    cancelAutoDirectorMutation,
    consistencyIssue,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
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
  }, [activeTab, id, selectedChapter?.order, selectedChapterId, selectedVolumeId]);

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
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterDynamicsOverview(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(id) });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-plan", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "chapter-audit-reports", id] });
    await queryClient.invalidateQueries({ queryKey: ["novels", "state-snapshots", id] });
  };

  const chapterSSE = useSSE({
    onDone: async () => {
      await invalidateNovelDetail();
      setActiveChapterStream(null);
    },
  });
  const bibleSSE = useSSE({ onDone: invalidateNovelDetail });
  const beatsSSE = useSSE({ onDone: invalidateNovelDetail });
  const repairSSE = useSSE({
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

  const { basicTab, outlineTab, structuredTab } = buildNovelEditPlanningTabs({
    id,
    basicForm,
    genreOptions: flattenGenreTreeOptions(genreTreeQuery.data?.data ?? []),
    storyModeOptions: flattenStoryModeTreeOptions(storyModeTreeQuery.data?.data ?? []),
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
    projectQuickStart: (
      <NovelExistingProjectTakeoverDialog
        novelId={id}
        basicForm={basicForm}
      />
    ),
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    strategyPlan: volumeStrategyPlan,
    critiqueReport: volumeCritiqueReport,
    isGeneratingStrategy,
    onGenerateStrategy: startStrategyGeneration,
    isCritiquingStrategy,
    onCritiqueStrategy: startStrategyCritique,
    isGeneratingSkeleton,
    onGenerateSkeleton: startSkeletonGeneration,
    onGoToCharacterTab: goToCharacterTab,
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
  const chapterTab = { novelId: id, worldInjectionSummary, hasCharacters, chapters, selectedChapterId, selectedChapter, onSelectChapter: setSelectedChapterId, onGoToCharacterTab: goToCharacterTab, onCreateChapter: () => createChapterMutation.mutate(), isCreatingChapter: createChapterMutation.isPending, chapterOperationMessage, strategy: chapterStrategy, onStrategyChange: (field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom", value: string | number) => setChapterStrategy((prev) => ({ ...prev, [field]: value } as ChapterExecutionStrategy)), onApplyStrategy: chapterExecutionActions.applyStrategy, isApplyingStrategy: chapterExecutionActions.isPatchingChapter, onGenerateSelectedChapter: handleGenerateSelectedChapter, onRewriteChapter: chapterExecutionActions.rewriteChapter, onExpandChapter: chapterExecutionActions.expandChapter, onCompressChapter: chapterExecutionActions.compressChapter, onSummarizeChapter: chapterExecutionActions.summarizeChapter, onGenerateTaskSheet: chapterExecutionActions.generateTaskSheet, onGenerateSceneCards: chapterExecutionActions.generateSceneCards, onGenerateChapterPlan: () => generateChapterPlanMutation.mutate(), onReplanChapter: () => replanChapterMutation.mutate(), onRunFullAudit: () => fullAuditMutation.mutate(), onCheckContinuity: chapterExecutionActions.checkContinuity, onCheckCharacterConsistency: chapterExecutionActions.checkCharacterConsistency, onCheckPacing: chapterExecutionActions.checkPacing, onAutoRepair: chapterExecutionActions.autoRepair, onStrengthenConflict: chapterExecutionActions.strengthenConflict, onEnhanceEmotion: chapterExecutionActions.enhanceEmotion, onUnifyStyle: chapterExecutionActions.unifyStyle, onAddDialogue: chapterExecutionActions.addDialogue, onAddDescription: chapterExecutionActions.addDescription, isReviewingChapter: reviewMutation.isPending, isRepairingChapter: repairSSE.isStreaming, reviewResult, replanRecommendation: reviewResult?.replanRecommendation ?? null, lastReplanResult: replanChapterMutation.data?.data ?? null, chapterPlan, latestStateSnapshot, chapterAuditReports, isGeneratingChapterPlan: generateChapterPlanMutation.isPending, isReplanningChapter: replanChapterMutation.isPending, isRunningFullAudit: fullAuditMutation.isPending, chapterQualityReport, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, repairStreamingChapterId: activeRepairStream?.chapterId ?? null, repairStreamingChapterLabel: activeRepairStream?.chapterLabel ?? null, onAbortRepair: handleAbortRepair, streamContent: chapterSSE.content, isStreaming: chapterSSE.isStreaming, streamingChapterId: activeChapterStream?.chapterId ?? null, streamingChapterLabel: activeChapterStream?.chapterLabel ?? null, onAbortStream: handleAbortChapterStream };
  const pipelineTab = { novelId: id, worldInjectionSummary, hasCharacters, onGoToCharacterTab: goToCharacterTab, pipelineForm, onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode", value: number | boolean | string) => setPipelineForm((prev) => ({ ...prev, [field]: value } as typeof prev)), maxOrder, onGenerateBible: () => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 }), onAbortBible: bibleSSE.abort, isBibleStreaming: bibleSSE.isStreaming, bibleStreamContent: bibleSSE.content, onGenerateBeats: () => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder }), onAbortBeats: beatsSSE.abort, isBeatsStreaming: beatsSSE.isStreaming, beatsStreamContent: beatsSSE.content, onRunPipeline: (patch?: Partial<typeof pipelineForm>) => runPipelineMutation.mutate(patch), isRunningPipeline: runPipelineMutation.isPending, pipelineMessage, pipelineJob: pipelineJobQuery.data?.data, chapters, selectedChapterId, onSelectedChapterChange: setSelectedChapterId, onReviewChapter: () => reviewMutation.mutate(), isReviewing: reviewMutation.isPending, onRepairChapter: () => { setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); setActiveRepairStream(selectedChapter ? { chapterId: selectedChapter.id, chapterLabel: `第${selectedChapter.order}章 ${selectedChapter.title || "未命名章节"}` } : null); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: reviewResult?.issues ?? [], auditIssueIds: openAuditIssueIds }); }, isRepairing: repairSSE.isStreaming, onGenerateHook: () => hookMutation.mutate(), isGeneratingHook: hookMutation.isPending, reviewResult, repairBeforeContent, repairAfterContent, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: handleAbortRepair, qualitySummary, chapterReports: qualityReportQuery.data?.data?.chapterReports ?? [], bible, plotBeats };
  const characterTab = { novelId: id, llmProvider: llm.provider, llmModel: llm.model, characterMessage, quickCharacterForm, onQuickCharacterFormChange: (field: "name" | "role", value: string) => setQuickCharacterForm((prev) => ({ ...prev, [field]: value })), onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => quickCreateCharacterMutation.mutate(payload), isQuickCreating: quickCreateCharacterMutation.isPending, onGenerateSupplementalCharacters: generateSupplementalCharacterMutation.mutateAsync, isGeneratingSupplementalCharacters: generateSupplementalCharacterMutation.isPending, onApplySupplementalCharacter: applySupplementalCharacterMutation.mutateAsync, isApplyingSupplementalCharacter: applySupplementalCharacterMutation.isPending, characters, coreCharacterCount, baseCharacters, selectedBaseCharacterId, onSelectedBaseCharacterChange: setSelectedBaseCharacterId, selectedBaseCharacter, importedBaseCharacterIds, onImportBaseCharacter: () => importBaseCharacterMutation.mutate(), isImportingBaseCharacter: importBaseCharacterMutation.isPending, selectedCharacterId, onSelectedCharacterChange: setSelectedCharacterId, onDeleteCharacter: (characterId: string) => deleteCharacterMutation.mutate(characterId), isDeletingCharacter: deleteCharacterMutation.isPending, deletingCharacterId: deleteCharacterMutation.variables ?? "", onSyncTimeline: () => syncTimelineMutation.mutate(), isSyncingTimeline: syncTimelineMutation.isPending, onSyncAllTimeline: () => syncAllTimelineMutation.mutate(), isSyncingAllTimeline: syncAllTimelineMutation.isPending, onEvolveCharacter: () => evolveCharacterMutation.mutate(), isEvolvingCharacter: evolveCharacterMutation.isPending, onWorldCheck: () => worldCheckMutation.mutate(), isCheckingWorld: worldCheckMutation.isPending, selectedCharacter, characterForm, onCharacterFormChange: (field: "name" | "role" | "gender" | "personality" | "background" | "development" | "currentState" | "currentGoal", value: string) => setCharacterForm((prev) => ({ ...prev, [field]: value })), onSaveCharacter: () => saveCharacterMutation.mutate(), isSavingCharacter: saveCharacterMutation.isPending, timelineEvents: characterTimelineQuery.data?.data ?? [] };

  return (
    <NovelEditView
      id={id}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      basicTab={basicTab}
      storyMacroTab={storyMacroTab}
      outlineTab={outlineTab}
      structuredTab={structuredTab}
      chapterTab={chapterTab}
      pipelineTab={pipelineTab}
      characterTab={characterTab}
      takeover={takeover}
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
