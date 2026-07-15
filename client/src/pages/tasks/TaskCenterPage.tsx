import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type { TaskKind, TaskStatus, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import { getDirectorTaskSnapshot } from "@/api/novelDirector";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import {
  archiveTask,
  cancelTask,
  getTaskDetail,
  getTaskOverview,
  listRecoveryCandidates,
  listTasks,
  retryTask,
} from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { Activity, ListChecks, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader, WorkspaceNextAction } from "@/components/workspace";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { syncKnownTaskCaches } from "@/lib/taskQueryCache";
import { buildTaskNoticeRoute, isChapterTitleDiversitySummary, parseDirectorTaskNotice, resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { canCancelDirectorTask, canContinueChapterBatchAutoExecution, getCandidateSelectionLink, requiresCandidateSelection } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";
import TaskCenterFilterPanel from "./components/TaskCenterFilterPanel";
import TaskCenterDetailPanel, { type TaskCenterActionSpec } from "./components/TaskCenterDetailPanel";
import TaskCenterListPanel from "./components/TaskCenterListPanel";
import TaskCenterSummaryCards from "./components/TaskCenterSummaryCards";
import {
  ACTIVE_STATUSES,
  ARCHIVABLE_STATUSES,
  formatCheckpoint,
  formatStatus,
  getTaskListPriority,
  getTaskNoticeSeverity,
  getTaskNoticeTitle,
  getTaskQueueSeverity,
  getTaskQueueTone,
  isTaskFailureQualityReminder,
  isTaskMustHandle,
  isTaskReplanRequired,
  getTimestamp,
  serializeListParams,
  type TaskSortMode,
} from "./taskCenterUtils";

function normalizeTaskMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }
  return meta as Record<string, unknown>;
}

function normalizeTaskSteps(steps: unknown): UnifiedTaskStep[] {
  return Array.isArray(steps) ? (steps as UnifiedTaskStep[]) : [];
}

export default function TaskCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kind, setKind] = useState<TaskKind | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>("updated_desc");

  const selectedKind = (searchParams.get("kind") as TaskKind | null) ?? null;
  const selectedId = searchParams.get("id");
  const listParamsKey = serializeListParams({ kind, status, keyword });

  const listQuery = useQuery({
    queryKey: queryKeys.tasks.list(listParamsKey),
    queryFn: () =>
      listTasks({
        kind: kind || undefined,
        status: status || undefined,
        keyword: keyword.trim() || undefined,
        limit: 80,
      }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data?.items ?? [];
      return rows.some((item) => ACTIVE_STATUSES.has(item.status)) ? 4000 : false;
    },
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      if (!overview) return false;
      return overview.runningCount
        + overview.queuedCount
        + overview.waitingApprovalCount
        + overview.recoveryCandidateCount > 0
        ? 4000
        : false;
    },
  });

  const recoveryCandidatesQuery = useQuery({
    queryKey: queryKeys.tasks.recoveryCandidates,
    queryFn: listRecoveryCandidates,
    refetchInterval: (query) => (query.state.data?.data?.items.length ?? 0) > 0 ? 4000 : false,
  });

  const allRows = listQuery.data?.data?.items ?? [];
  const visibleRows = useMemo(
    () =>
      (onlyAnomaly ? allRows.filter(isTaskMustHandle) : allRows)
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
          if (sortMode !== "default") {
            const leftTime = sortMode.startsWith("heartbeat")
              ? getTimestamp(left.item.heartbeatAt)
              : getTimestamp(left.item.updatedAt);
            const rightTime = sortMode.startsWith("heartbeat")
              ? getTimestamp(right.item.heartbeatAt)
              : getTimestamp(right.item.updatedAt);
            const leftResolved = Number.isNaN(leftTime) ? -Infinity : leftTime;
            const rightResolved = Number.isNaN(rightTime) ? -Infinity : rightTime;
            const timeDiff = sortMode.endsWith("_asc")
              ? leftResolved - rightResolved
              : rightResolved - leftResolved;
            if (timeDiff !== 0) {
              return timeDiff;
            }
          }
          const priorityDiff = getTaskListPriority(left.item) - getTaskListPriority(right.item);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return left.index - right.index;
        })
        .map(({ item }) => item),
    [allRows, onlyAnomaly, sortMode],
  );

  const detailQuery = useQuery({
    queryKey: queryKeys.tasks.detail(selectedKind ?? "none", selectedId ?? "none"),
    queryFn: () => getTaskDetail(selectedKind as TaskKind, selectedId as string),
    enabled: Boolean(selectedKind && selectedId),
    retry: false,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && ACTIVE_STATUSES.has(task.status) ? 4000 : false;
    },
  });

  useEffect(() => {
    if (!selectedKind || !selectedId) {
      if (visibleRows.length > 0) {
        const fallback = visibleRows[0];
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", fallback.kind);
          next.set("id", fallback.id);
          return next;
        });
      }
      return;
    }
    const exists = visibleRows.some((item) => item.kind === selectedKind && item.id === selectedId);
    if (!exists && visibleRows.length > 0) {
      const fallback = visibleRows[0];
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("kind", fallback.kind);
        next.set("id", fallback.id);
        return next;
      });
    }
  }, [selectedKind, selectedId, setSearchParams, visibleRows]);

  const taskOverview = overviewQuery.data?.data;
  const runningCount = taskOverview?.runningCount ?? allRows.filter((item) => item.status === "running").length;
  const queuedCount = taskOverview?.queuedCount ?? allRows.filter((item) => item.status === "queued").length;
  const waitingActionCount = taskOverview?.waitingApprovalCount
    ?? allRows.filter((item) => item.status === "waiting_approval").length;
  const failedTaskCount = taskOverview?.failedCount
    ?? allRows.filter((item) => item.status === "failed" && isTaskMustHandle(item)).length;
  const recoveryCandidateCount = taskOverview?.recoveryCandidateCount
    ?? recoveryCandidatesQuery.data?.data?.items.length
    ?? allRows.filter((item) => item.pendingManualRecovery).length;
  const blockingCount = allRows.filter((item) => getTaskQueueTone(item) === "danger").length;
  const visibleReplanCount = allRows.filter(isTaskReplanRequired).length;
  const mustHandleCount = failedTaskCount + recoveryCandidateCount + visibleReplanCount;
  const qualityReminderCount = allRows.filter((item) => getTaskQueueSeverity(item) === "quality").length;

  const invalidateTaskQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    if (selectedId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(selectedId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorTaskSnapshot(selectedId) });
    }
  };

  const retryMutation = useMutation({
    mutationFn: (payload: {
      kind: TaskKind;
      id: string;
      llmOverride?: {
        provider?: typeof llm.provider;
        model?: string;
        temperature?: number;
      };
      resume?: boolean;
    }) => retryTask(payload.kind, payload.id, {
      llmOverride: payload.llmOverride,
      resume: payload.resume,
    }),
    onSuccess: async (response, variables) => {
      const task = response.data;
      syncKnownTaskCaches(queryClient, task);
      await invalidateTaskQueries();
      if (task) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", task.kind);
          next.set("id", task.id);
          return next;
        });
      }
      toast.success(
        variables.llmOverride
          ? `已切换到 ${variables.llmOverride.provider ?? "当前提供商"} / ${variables.llmOverride.model ?? "当前模型"} 并重试任务`
          : "任务已重新入队",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => cancelTask(payload.kind, payload.id),
    onSuccess: async () => {
      await invalidateTaskQueries();
      toast.success("任务取消请求已提交");
    },
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: (payload: { taskId: string; mode?: DirectorContinuationMode }) => continueNovelWorkflow(
      payload.taskId,
      payload.mode ? { continuationMode: payload.mode } : undefined,
    ),
    onSuccess: async (response, variables) => {
      await invalidateTaskQueries();
      const command = response.data;
      const feedback = resolveWorkflowContinuationFeedback(command, {
        mode: variables.mode,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      if (variables.mode === "auto_execute_range") {
        toast.success(feedback.message);
        return;
      }
      if (selectedTask?.kind && selectedTask.id) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", selectedTask.kind);
          next.set("id", selectedTask.id);
          return next;
        });
        navigate(selectedTask!.sourceRoute);
        return;
      }
      toast.success(feedback.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => archiveTask(payload.kind, payload.id),
    onSuccess: async (_, payload) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.tasks.detail(payload.kind, payload.id),
      });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("kind");
        next.delete("id");
        return next;
      });
      await invalidateTaskQueries();
      toast.success("任务已归档并从任务中心隐藏");
    },
  });

  const selectedTask = detailQuery.data?.data;
  const selectedTaskMeta = useMemo(
    () => normalizeTaskMeta(selectedTask?.meta),
    [selectedTask?.meta],
  );
  const selectedTaskSteps = useMemo(
    () => normalizeTaskSteps(selectedTask?.steps),
    [selectedTask?.steps],
  );
  const isAutoDirectorTask = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && selectedTaskMeta.lane === "auto_director",
  );
  const canResumeFront10AutoExecution = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && canContinueChapterBatchAutoExecution(selectedTask),
  );
  const needsCandidateSelection = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && requiresCandidateSelection(selectedTask),
  );
  const selectedTaskNotice = useMemo(
    () => parseDirectorTaskNotice(selectedTask ? selectedTaskMeta : null),
    [selectedTask, selectedTaskMeta],
  );
  const selectedTaskNoticeRoute = useMemo(
    () => (selectedTask ? buildTaskNoticeRoute(selectedTask, selectedTaskNotice) : null),
    [selectedTask, selectedTaskNotice],
  );
  const selectedTaskChapterTitleWarning = useMemo(
    () => (isAutoDirectorTask ? resolveChapterTitleWarning(selectedTask ?? null) : null),
    [isAutoDirectorTask, selectedTask],
  );
  const chapterTitleRepairMutation = useDirectorChapterTitleRepair();
  const selectedTaskFailureRepairRoute = selectedTaskChapterTitleWarning?.route ?? null;
  const selectedTaskHasChapterTitleFailure = Boolean(
    selectedTask
    && isChapterTitleDiversitySummary(
      selectedTask.failureSummary ?? selectedTask.lastError ?? null,
    ),
  );
  const selectedTaskHasQualityFailure = Boolean(
    selectedTask && isTaskFailureQualityReminder(selectedTask),
  );
  const directorRuntimeQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskSnapshot(selectedId ?? "none"),
    queryFn: () => getDirectorTaskSnapshot(selectedId as string),
    enabled: Boolean(selectedId && isAutoDirectorTask),
    retry: false,
    refetchInterval: (query) => {
      const snapshot = query.state.data?.data?.snapshot;
      const projection = snapshot?.projection;
      return (
        (selectedTask && ACTIVE_STATUSES.has(selectedTask.status))
        || snapshot?.dashboardView.mode === "running"
        || snapshot?.dashboardView.mode === "queued"
        || projection?.status === "running"
        || projection?.status === "waiting_approval"
      )
        ? 4000
        : false;
    },
  });
  const selectedDirectorTaskSnapshot = directorRuntimeQuery.data?.data?.snapshot ?? null;
  const selectedDirectorDashboardView = selectedDirectorTaskSnapshot?.dashboardView ?? null;
  const selectedDirectorRuntimeProjection = selectedDirectorTaskSnapshot?.projection ?? null;
  const staleActionProjection = Boolean(
    selectedDirectorDashboardView?.mode === "running"
    && (
      selectedDirectorRuntimeProjection?.requiresUserAction
      || selectedDirectorRuntimeProjection?.status === "blocked"
      || selectedDirectorRuntimeProjection?.status === "waiting_approval"
      || selectedDirectorRuntimeProjection?.status === "failed"
    ),
  );
  const selectedDirectorRuntimeProjectionForDisplay = staleActionProjection
    ? null
    : selectedDirectorRuntimeProjection;
  const runtimeHardBlocked = selectedDirectorDashboardView?.mode === "failed"
    || selectedDirectorDashboardView?.mode === "recovering"
    || (
      selectedDirectorDashboardView?.mode !== "running"
      && selectedDirectorDashboardView?.mode !== "queued"
      && selectedDirectorRuntimeProjection?.status === "blocked"
    );

  const detailActions: TaskCenterActionSpec[] = [];
  if (selectedTask && !isAutoDirectorTask && needsCandidateSelection) {
    detailActions.push({
      key: "candidate-selection",
      title: "确认书级方向",
      label: selectedTask.resumeAction ?? "继续确认书级方向",
      consequence: "打开候选确认页；只有确认后，后续小说生产才会继续。",
      tone: "warning",
      variant: "default",
      onClick: () => navigate(getCandidateSelectionLink(selectedTask.id)),
    });
  }
  if (selectedTask && !isAutoDirectorTask && canResumeFront10AutoExecution) {
    detailActions.push({
      key: "continue-range",
      title: "继续当前章节范围",
      label: selectedTask.resumeAction ?? `继续自动执行${selectedTask.executionScopeLabel ?? "当前章节范围"}`,
      consequence: selectedTask.status === "failed" || selectedTask.status === "cancelled"
        ? "任务会从可恢复位置重新入队，并继续当前章节范围。"
        : "系统会提交继续执行命令，并从当前检查点推进该章节范围。",
      tone: "info",
      variant: "default",
      disabled: continueWorkflowMutation.isPending || retryMutation.isPending || runtimeHardBlocked,
      onClick: () => {
        if (selectedTask.status === "failed" || selectedTask.status === "cancelled") {
          retryMutation.mutate({ kind: selectedTask.kind, id: selectedTask.id, resume: true });
          return;
        }
        continueWorkflowMutation.mutate({ taskId: selectedTask.id, mode: "auto_execute_range" });
      },
    });
  }
  if (
    selectedTask
    && !isAutoDirectorTask
    && selectedTask.kind === "novel_workflow"
    && !needsCandidateSelection
    && !canResumeFront10AutoExecution
    && (selectedTask.status === "waiting_approval" || selectedTask.status === "queued" || selectedTask.status === "running")
  ) {
    detailActions.push({
      key: "continue-workflow",
      title: selectedTask.status === "waiting_approval" ? "继续小说主流程" : "查看或推进当前任务",
      label: selectedTask.resumeAction ?? (selectedTask.status === "waiting_approval" ? "继续" : "查看进度"),
      consequence: selectedTask.status === "waiting_approval"
        ? "系统会按当前检查点提交继续命令。"
        : "系统会读取并推进当前任务，不会切换到其他任务身份。",
      tone: "info",
      variant: "default",
      disabled: continueWorkflowMutation.isPending || runtimeHardBlocked,
      onClick: () => continueWorkflowMutation.mutate({
        taskId: selectedTask.id,
        mode: selectedTask.status === "waiting_approval" ? "resume" : undefined,
      }),
    });
  }
  if (selectedTask && (selectedTask.status === "failed" || selectedTask.status === "cancelled") && !isAutoDirectorTask) {
    detailActions.push({
      key: "retry",
      title: "重新执行任务",
      label: "重试",
      consequence: "任务会按现有任务配置重新入队；已保存的来源内容不会由重试按钮删除。",
      tone: "danger",
      variant: "default",
      disabled: retryMutation.isPending,
      onClick: () => retryMutation.mutate({ kind: selectedTask.kind, id: selectedTask.id }),
    });
  }
  if (selectedTask && (
    (selectedTask.kind === "novel_workflow" && canCancelDirectorTask(selectedTask))
    || (selectedTask.kind !== "novel_workflow" && ACTIVE_STATUSES.has(selectedTask.status))
  )) {
    detailActions.push({
      key: "cancel",
      title: "停止后续执行",
      label: "取消任务",
      consequence: "系统会请求停止后续步骤；已保存的产物仍保留在来源页面。",
      tone: "warning",
      disabled: cancelMutation.isPending,
      onClick: () => cancelMutation.mutate({ kind: selectedTask.kind, id: selectedTask.id }),
    });
  }
  if (selectedTask && ARCHIVABLE_STATUSES.has(selectedTask.status)) {
    detailActions.push({
      key: "archive",
      title: "从任务中心收起记录",
      label: "归档",
      consequence: "只隐藏任务中心记录，不删除小说正文、规划或其他生成资产。",
      disabled: archiveMutation.isPending,
      onClick: () => archiveMutation.mutate({ kind: selectedTask.kind, id: selectedTask.id }),
    });
  }

  const noticeAction = selectedTask && (selectedTaskChapterTitleWarning || selectedTaskNoticeRoute)
    ? {
        label: selectedTaskChapterTitleWarning?.label ?? selectedTaskNotice?.action?.label ?? "打开当前卷拆章",
        disabled: chapterTitleRepairMutation.isPending,
        onClick: () => {
          if (selectedTaskChapterTitleWarning) {
            chapterTitleRepairMutation.startRepair(selectedTask);
            return;
          }
          if (selectedTaskNoticeRoute) navigate(selectedTaskNoticeRoute);
        },
      }
    : null;
  const failureAction = selectedTask && (selectedTaskChapterTitleWarning || selectedTaskFailureRepairRoute)
    ? {
        label: selectedTaskChapterTitleWarning?.label ?? "快速修复章节标题",
        disabled: chapterTitleRepairMutation.isPending,
        onClick: () => {
          if (selectedTaskChapterTitleWarning) {
            chapterTitleRepairMutation.startRepair(selectedTask);
            return;
          }
          if (selectedTaskFailureRepairRoute) navigate(selectedTaskFailureRepairRoute);
        },
      }
    : null;

  const listErrorMessage = listQuery.error instanceof Error ? listQuery.error.message : listQuery.isError ? "任务列表读取失败，请重试。" : null;
  const overviewErrorMessage = overviewQuery.error instanceof Error
    ? overviewQuery.error.message
    : overviewQuery.isError ? "任务概览读取失败，请重试。" : null;
  const detailErrorMessage = detailQuery.error instanceof Error ? detailQuery.error.message : detailQuery.isError ? "任务详情读取失败，请重试。" : null;
  const recommendedBlockingTask = allRows.find(isTaskMustHandle) ?? null;
  const hasMustHandleTask = mustHandleCount > 0 || blockingCount > 0;
  const recommendedRecoveryCandidate = failedTaskCount === 0
    ? recoveryCandidatesQuery.data?.data?.items[0] ?? null
    : null;
  const recommendedTask = recommendedBlockingTask
    ?? recommendedRecoveryCandidate
    ?? (!hasMustHandleTask
      ? allRows.find((item) => item.status === "waiting_approval")
        ?? allRows.find((item) => getTaskQueueSeverity(item) === "quality")
        ?? allRows.find((item) => item.status === "running")
        ?? allRows[0]
        ?? null
      : null);
  const shouldOpenFailedFilter = hasMustHandleTask && !recommendedBlockingTask && failedTaskCount > 0;
  const shouldRetryRecoveryLookup = hasMustHandleTask
    && !recommendedTask
    && !shouldOpenFailedFilter
    && !recoveryCandidatesQuery.isLoading;
  const hasRecommendedAction = Boolean(recommendedTask || shouldOpenFailedFilter || shouldRetryRecoveryLookup);

  return (
    <div className="space-y-5">
      <WorkspaceHeader
        icon={ListChecks}
        context="执行历史与恢复"
        title="运行记录"
        description="按需查询创作、拆书、知识索引和图片任务的历史、异常与恢复信息；实时生成请从顶部“AI 实况”查看。"
        meta={(
          <>
            <span>当前显示 {visibleRows.length} 项</span>
            <span>全局执行 {runningCount + queuedCount} 项</span>
            <span>等待操作 {waitingActionCount} 项</span>
            <span>失败 {failedTaskCount} 项</span>
            <span>可恢复 {recoveryCandidateCount} 项</span>
            <span>质量提醒 {qualityReminderCount} 项</span>
          </>
        )}
        actions={(
          <Button
            type="button"
            variant="outline"
            onClick={() => void Promise.all([overviewQuery.refetch(), recoveryCandidatesQuery.refetch(), listQuery.refetch()])}
            disabled={overviewQuery.isFetching || recoveryCandidatesQuery.isFetching || listQuery.isFetching}
          >
            <RefreshCw className={overviewQuery.isFetching || recoveryCandidatesQuery.isFetching || listQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            刷新记录
          </Button>
        )}
      />

      <WorkspaceNextAction
        icon={overviewErrorMessage ? RefreshCw : hasMustHandleTask ? ShieldAlert : Activity}
        tone={overviewQuery.isLoading ? "info" : overviewErrorMessage ? "danger" : hasMustHandleTask ? "danger" : waitingActionCount > 0 ? "info" : qualityReminderCount > 0 ? "warning" : runningCount + queuedCount > 0 ? "info" : allRows.length > 0 ? "success" : "neutral"}
        title={overviewQuery.isLoading ? "正在读取全局任务状态" : overviewErrorMessage ? "重新读取任务概览" : hasMustHandleTask ? "先查看必须处理的任务" : waitingActionCount > 0 ? "完成等待中的操作" : qualityReminderCount > 0 ? "查看质量提醒" : runningCount + queuedCount > 0 ? "关注正在推进的任务" : allRows.length > 0 ? "当前没有阻塞任务" : "任务会在执行后汇总到这里"}
        description={overviewQuery.isLoading
          ? "正在汇总执行、等待操作、失败和可恢复任务，请稍候。"
          : overviewErrorMessage
            ? `${overviewErrorMessage} 当前不会据此判断是否存在阻塞任务。`
            : hasMustHandleTask
              ? recoveryCandidatesQuery.isLoading && !recommendedBlockingTask && failedTaskCount === 0
                ? "正在定位可恢复任务；读取完成后会提供对应入口。"
                : "阻塞状态可能影响对应来源流程；先查看原因和恢复位置，再决定恢复、重试或重规划。"
              : waitingActionCount > 0
                ? "候选确认、章节批次继续等节点需要你的操作，但不代表任务发生故障。"
                : qualityReminderCount > 0
                  ? "这些提醒不会阻止全书继续执行，可以按影响范围安排局部修复。"
                  : runningCount + queuedCount > 0
                    ? "系统会持续刷新进度，普通运行状态不需要手动干预。"
                    : allRows.length > 0
                      ? "已完成记录可按需归档，质量提醒仍会保留在任务详情中。"
                      : "从小说、拆书、知识库或图片工作区发起任务后，可在这里查看状态。"}
        consequence={overviewErrorMessage
          ? "只重新读取任务概览，不会恢复、重试或取消任务。"
          : !overviewQuery.isLoading && hasRecommendedAction
            ? recommendedTask
              ? "只定位到推荐任务，不会自动继续、重试或取消。"
              : shouldOpenFailedFilter
                ? "只筛选失败任务，不会自动恢复、重试或取消任务。"
                : "只重新读取恢复候选，不会自动执行恢复。"
            : undefined}
        action={overviewErrorMessage ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void overviewQuery.refetch()}>
            重新读取
          </Button>
        ) : !overviewQuery.isLoading && hasRecommendedAction ? (
          <Button
            type="button"
            size="sm"
            variant={hasMustHandleTask ? "destructive" : "outline"}
            onClick={() => {
              if (!recommendedTask) {
                setKind("");
                setKeyword("");
                if (shouldOpenFailedFilter) {
                  setStatus("failed");
                  setOnlyAnomaly(false);
                } else if (shouldRetryRecoveryLookup) {
                  void recoveryCandidatesQuery.refetch();
                }
                return;
              }
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("kind", recommendedTask.kind);
                next.set("id", recommendedTask.id);
                return next;
              });
            }}
          >
            {shouldRetryRecoveryLookup ? "重新读取恢复任务" : hasMustHandleTask ? "查看需处理任务" : "查看推荐任务"}
          </Button>
        ) : undefined}
      />

      <TaskCenterSummaryCards
        activeCount={runningCount + queuedCount}
        waitingActionCount={waitingActionCount}
        mustHandleCount={mustHandleCount}
        qualityReminderCount={qualityReminderCount}
      />

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <TaskCenterFilterPanel
          kind={kind}
          status={status}
          keyword={keyword}
          onlyAnomaly={onlyAnomaly}
          sortMode={sortMode}
          onKindChange={setKind}
          onStatusChange={setStatus}
          onKeywordChange={setKeyword}
          onOnlyAnomalyChange={setOnlyAnomaly}
          onSortModeChange={setSortMode}
        />

        <TaskCenterListPanel
          tasks={visibleRows}
          selectedKind={selectedKind}
          selectedId={selectedId}
          loading={listQuery.isLoading}
          errorMessage={listErrorMessage}
          onRetry={() => void listQuery.refetch()}
          onSelectTask={(task) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("kind", task.kind);
              next.set("id", task.id);
              return next;
            });
          }}
        />

        <TaskCenterDetailPanel
          task={selectedTask}
          loading={Boolean(selectedKind && selectedId && detailQuery.isLoading)}
          errorMessage={detailErrorMessage}
          onRetryLoad={() => void detailQuery.refetch()}
          isAutoDirectorTask={isAutoDirectorTask}
          currentModelLabel={`${llm.provider} / ${llm.model}`}
          dashboardView={selectedDirectorDashboardView}
          runtimeProjection={selectedDirectorRuntimeProjectionForDisplay}
          noticeAction={noticeAction}
          noticeSeverity={selectedTask ? getTaskNoticeSeverity(selectedTask) : "normal"}
          noticeTitle={selectedTask ? getTaskNoticeTitle(selectedTask) : "任务提醒"}
          failureAction={failureAction}
          failureIsQualityReminder={selectedTaskHasQualityFailure}
          actions={detailActions}
          steps={selectedTaskSteps}
          milestones={selectedTask?.kind === "novel_workflow" && Array.isArray(selectedTaskMeta.milestones)
            ? selectedTaskMeta.milestones as NovelWorkflowMilestone[]
            : []}
        />
      </div>
    </div>
  );
}
