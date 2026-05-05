import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectorSessionState } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { useNavigate } from "react-router-dom";
import { continueNovelWorkflow, getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { cancelTask, retryTask } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { getCandidateSelectionLink } from "@/lib/novelWorkflowTaskUi";
import { syncAutoDirectorTaskCache } from "@/lib/taskQueryCache";
import { useLLMStore } from "@/store/llmStore";
import { resolveAutoExecutionScopeLabel } from "../novelEditTakeover.shared";
import { tabFromDirectorProgress, tabFromScope } from "../novelWorkspaceNavigation";
import {
  buildNovelAutoDirectorTakeover,
  buildNovelAutoDirectorTaskDrawerActions,
  resolveDirectorConsistencyIssue,
} from "./novelAutoDirectorWorkspaceActions";

function takeoverDismissStorageKey(novelId: string): string {
  return `novel-edit:takeover-dismissed:${novelId}`;
}

interface UseNovelAutoDirectorWorkspaceInput {
  novelId: string;
  workflowTaskId: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setSelectedChapterId: (chapterId: string) => void;
  setSelectedVolumeId: (volumeId: string) => void;
  chapters: Array<{ id: string; order: number }>;
  characters: Array<{ id: string }>;
  hasUnsavedVolumeDraft: boolean;
  selectedChapterId: string;
  novelTitle: string;
  onOpenStructuredTitleRepair: (showToast?: boolean) => void;
}

export function useNovelAutoDirectorWorkspace(input: UseNovelAutoDirectorWorkspaceInput) {
  const navigate = useNavigate();
  const llm = useLLMStore();
  const queryClient = useQueryClient();

  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [autoOpenedFailedTaskId, setAutoOpenedFailedTaskId] = useState("");
  const [isDirectorExitActionExpanded, setIsDirectorExitActionExpanded] = useState(false);
  const [dismissedTakeoverSignature, setDismissedTakeoverSignature] = useState("");

  const activeAutoDirectorTaskQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTask(input.novelId),
    queryFn: () => getActiveAutoDirectorTask(input.novelId),
    enabled: Boolean(input.novelId),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && (task.status === "queued" || task.status === "running" || task.status === "waiting_approval")
        ? 2000
        : false;
    },
  });

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
    const raw = activeAutoDirectorTask.meta.directorSession;
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

  const invalidateAutoDirectorTaskState = async (taskId?: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.autoDirectorTask(input.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(input.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(input.novelId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(input.novelId) });
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
      syncAutoDirectorTaskCache(queryClient, input.novelId, response.data);
      await invalidateAutoDirectorTaskState(response.data?.id);
      const feedback = resolveWorkflowContinuationFeedback(response.data);
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      toast.success(feedback.message);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "继续自动导演失败。");
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
      syncAutoDirectorTaskCache(queryClient, input.novelId, response.data);
      await invalidateAutoDirectorTaskState(response.data?.id);
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

  const chapterTitleRepairMutation = useDirectorChapterTitleRepair({
    navigateOnSuccess: false,
    onAfterStart: () => {
      input.onOpenStructuredTitleRepair(false);
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
    onSuccess: async (response) => {
      syncAutoDirectorTaskCache(queryClient, input.novelId, response.data);
      await invalidateAutoDirectorTaskState(response.data?.id ?? activeAutoDirectorTask?.id);
      setIsTaskDrawerOpen(true);
      toast.success(`已切换到 ${llm.provider} / ${llm.model} 并重新启动自动导演。`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "切换当前模型重试失败。");
    },
  });

  const retryAutoDirectorWithTaskModelMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可重试的自动导演任务。");
      }
      return retryTask("novel_workflow", activeAutoDirectorTask.id, { resume: true });
    },
    onSuccess: async (response) => {
      syncAutoDirectorTaskCache(queryClient, input.novelId, response.data);
      await invalidateAutoDirectorTaskState(response.data?.id ?? activeAutoDirectorTask?.id);
      setIsTaskDrawerOpen(true);
      toast.success("自动导演已按任务原模型重新启动。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "按原模型重试失败。");
    },
  });

  const cancelAutoDirectorMutation = useMutation({
    mutationFn: async () => {
      if (!activeAutoDirectorTask?.id) {
        throw new Error("当前没有可取消的自动导演任务。");
      }
      return cancelTask("novel_workflow", activeAutoDirectorTask.id);
    },
    onSuccess: async (response) => {
      setIsDirectorExitActionExpanded(false);
      syncAutoDirectorTaskCache(queryClient, input.novelId, response.data);
      await invalidateAutoDirectorTaskState(response.data?.id ?? activeAutoDirectorTask?.id);
      toast.success("已提交自动导演取消请求。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "取消自动导演失败。");
    },
  });

  const openCandidateSelection = () => {
    if (!activeAutoDirectorTask?.id) {
      return;
    }
    navigate(getCandidateSelectionLink(activeAutoDirectorTask.id));
  };

  const openChapterExecution = () => {
    if (activeAutoDirectorTask?.resumeTarget?.chapterId) {
      input.setSelectedChapterId(activeAutoDirectorTask.resumeTarget.chapterId);
    }
    input.setActiveTab("chapter");
    setIsTaskDrawerOpen(false);
  };

  const openQualityRepair = () => {
    if (activeAutoDirectorTask?.resumeTarget?.chapterId) {
      input.setSelectedChapterId(activeAutoDirectorTask.resumeTarget.chapterId);
    }
    input.setActiveTab("pipeline");
    setIsTaskDrawerOpen(false);
  };

  const dismissTakeover = () => {
    if (!activeAutoDirectorRefreshSignature) {
      return;
    }
    setIsDirectorExitActionExpanded(false);
    setDismissedTakeoverSignature(activeAutoDirectorRefreshSignature);
    window.sessionStorage.setItem(
      takeoverDismissStorageKey(input.novelId),
      activeAutoDirectorRefreshSignature,
    );
    toast.success("已完成本轮导演交接，当前工作台已退出导演模式。");
  };

  const reviewScope = activeDirectorSession?.reviewScope ?? null;
  const reviewTab = useMemo(() => tabFromScope(reviewScope), [reviewScope]);
  const openReviewStage = () => {
    if (!reviewTab) {
      return;
    }
    input.setActiveTab(reviewTab);
    setIsTaskDrawerOpen(false);
  };

  useEffect(() => {
    if (activeAutoDirectorTask?.status !== "failed") {
      if (autoOpenedFailedTaskId) {
        setAutoOpenedFailedTaskId("");
      }
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
      setDismissedTakeoverSignature("");
      window.sessionStorage.removeItem(takeoverDismissStorageKey(input.novelId));
      return;
    }
    if (
      activeAutoDirectorTask.status !== "queued"
      && activeAutoDirectorTask.status !== "running"
      && activeAutoDirectorTask.status !== "waiting_approval"
    ) {
      setIsDirectorExitActionExpanded(false);
    }
  }, [activeAutoDirectorTask, input.novelId]);

  useEffect(() => {
    if (!input.novelId || !activeAutoDirectorRefreshSignature) {
      return;
    }
    const storedDismissedSignature = window.sessionStorage.getItem(takeoverDismissStorageKey(input.novelId)) ?? "";
    setDismissedTakeoverSignature(storedDismissedSignature);
  }, [activeAutoDirectorRefreshSignature, input.novelId]);

  useEffect(() => {
    if (!input.novelId || !activeAutoDirectorTask || !activeAutoDirectorRefreshSignature) {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacro(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.storyMacroState(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: ["novels", "payoff-ledger", input.novelId] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCastOptions(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: ["novels", "character-dynamics-overview", input.novelId] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterRelations(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterCandidates(input.novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResources(input.novelId) }),
      ...(input.selectedChapterId
        ? [queryClient.invalidateQueries({ queryKey: queryKeys.novels.characterResourceContext(input.novelId, input.selectedChapterId) })]
        : []),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.worldSlice(input.novelId) }),
    ]);
  }, [
    activeAutoDirectorRefreshSignature,
    activeAutoDirectorTask,
    input.novelId,
    input.selectedChapterId,
    queryClient,
  ]);

  useEffect(() => {
    if (!input.novelId || !activeAutoDirectorTask) {
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(input.novelId) });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeAutoDirectorTask, input.novelId, queryClient]);

  const consistencyIssue = useMemo(
    () => resolveDirectorConsistencyIssue({
      checkpointType: activeAutoDirectorTask?.checkpointType,
      characterCount: input.characters.length,
      chapterCount: input.chapters.length,
    }),
    [activeAutoDirectorTask?.checkpointType, input.chapters.length, input.characters.length],
  );

  const isTakeoverDismissed = Boolean(
    activeAutoDirectorRefreshSignature
    && dismissedTakeoverSignature
    && dismissedTakeoverSignature === activeAutoDirectorRefreshSignature,
  );

  const takeover = useMemo(() => buildNovelAutoDirectorTakeover({
    task: activeAutoDirectorTask,
    novelTitle: input.novelTitle,
    activeTab: input.activeTab,
    reviewScope,
    reviewTab,
    autoExecutionScopeLabel: activeAutoExecutionScopeLabel,
    consistencyIssue,
    activeChapterTitleWarning,
    hasUnsavedVolumeDraft: input.hasUnsavedVolumeDraft,
    isDirectorExitActionExpanded,
    continueAutoDirector: {
      isPending: continueAutoDirectorMutation.isPending,
      run: () => continueAutoDirectorMutation.mutate(),
    },
    continueAutoExecution: {
      isPending: continueAutoExecutionMutation.isPending,
      run: () => continueAutoExecutionMutation.mutate(),
    },
    cancelAutoDirector: {
      isPending: cancelAutoDirectorMutation.isPending,
      run: () => cancelAutoDirectorMutation.mutate(),
    },
    chapterTitleRepair: {
      isPending: chapterTitleRepairMutation.isPending,
      pendingTaskId: chapterTitleRepairMutation.pendingTaskId,
      run: () => {},
      startRepair: (task) => chapterTitleRepairMutation.startRepair(task),
    },
    openCandidateSelection,
    openChapterExecution,
    openQualityRepair,
    dismissTakeover,
    setIsDirectorExitActionExpanded,
    openTaskDrawer: () => setIsTaskDrawerOpen(true),
    openCharacterTab: () => input.setActiveTab("character"),
  }), [
    activeAutoDirectorTask,
    activeAutoExecutionScopeLabel,
    activeChapterTitleWarning,
    cancelAutoDirectorMutation.isPending,
    chapterTitleRepairMutation,
    consistencyIssue,
    continueAutoDirectorMutation.isPending,
    continueAutoExecutionMutation.isPending,
    dismissTakeover,
    input.activeTab,
    input.hasUnsavedVolumeDraft,
    input.novelTitle,
    isDirectorExitActionExpanded,
    openCandidateSelection,
    openChapterExecution,
    openQualityRepair,
    reviewScope,
    reviewTab,
  ]);

  const taskDrawerActions = useMemo(() => buildNovelAutoDirectorTaskDrawerActions({
    task: activeAutoDirectorTask,
    reviewTab,
    autoExecutionScopeLabel: activeAutoExecutionScopeLabel,
    consistencyIssue,
    activeChapterTitleWarning,
    hasUnsavedVolumeDraft: input.hasUnsavedVolumeDraft,
    continueAutoDirector: {
      isPending: continueAutoDirectorMutation.isPending,
      run: () => continueAutoDirectorMutation.mutate(),
    },
    continueAutoExecution: {
      isPending: continueAutoExecutionMutation.isPending,
      run: () => continueAutoExecutionMutation.mutate(),
    },
    cancelAutoDirector: {
      isPending: cancelAutoDirectorMutation.isPending,
      run: () => cancelAutoDirectorMutation.mutate(),
    },
    retryWithCurrentModel: {
      isPending: retryAutoDirectorWithCurrentModelMutation.isPending,
      run: () => retryAutoDirectorWithCurrentModelMutation.mutate(),
    },
    retryWithTaskModel: {
      isPending: retryAutoDirectorWithTaskModelMutation.isPending,
      run: () => retryAutoDirectorWithTaskModelMutation.mutate(),
    },
    chapterTitleRepair: {
      isPending: chapterTitleRepairMutation.isPending,
      pendingTaskId: chapterTitleRepairMutation.pendingTaskId,
      run: () => {},
      startRepair: (task) => chapterTitleRepairMutation.startRepair(task),
    },
    openCandidateSelection,
    openReviewStage,
    openChapterExecution,
    openQualityRepair,
    openCharacterTabAndClose: () => {
      input.setActiveTab("character");
      setIsTaskDrawerOpen(false);
    },
  }), [
    activeAutoDirectorTask,
    activeAutoExecutionScopeLabel,
    activeChapterTitleWarning,
    cancelAutoDirectorMutation.isPending,
    chapterTitleRepairMutation,
    consistencyIssue,
    continueAutoDirectorMutation.isPending,
    continueAutoExecutionMutation.isPending,
    input.hasUnsavedVolumeDraft,
    openCandidateSelection,
    openChapterExecution,
    openQualityRepair,
    openReviewStage,
    retryAutoDirectorWithCurrentModelMutation.isPending,
    retryAutoDirectorWithTaskModelMutation.isPending,
    reviewTab,
  ]);

  const openAutoDirectorTaskCenter = () => {
    const targetId = activeAutoDirectorTask?.id || input.workflowTaskId;
    if (targetId) {
      navigate(`/tasks?kind=novel_workflow&id=${targetId}`);
      return;
    }
    navigate("/tasks");
  };

  return {
    activeAutoDirectorTask,
    activeDirectorSession,
    activeChapterTitleWarning,
    workflowCurrentTab,
    isTaskDrawerOpen,
    setIsTaskDrawerOpen,
    takeover: isTakeoverDismissed ? null : takeover,
    taskDrawerActions,
    openAutoDirectorTaskCenter,
  };
}
