import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoDirectorAction,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  NovelWorkflowMilestone,
  NovelWorkflowMilestoneType,
  NovelWorkflowResumeTarget,
} from "@ai-novel/shared/types/novelWorkflow";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import {
  archiveTask,
  cancelTask,
  executeAutoDirectorFollowUpAction,
  getAutoDirectorFollowUpDetail,
  getTaskDetail,
  listTasks,
  retryTask,
} from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import LLMSelector, { type LLMSelectorValue } from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { resolveInternalNavigationTarget } from "@/lib/internalNavigation";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { syncKnownTaskCaches } from "@/lib/taskQueryCache";
import {
  buildTaskNoticeRoute,
  isChapterTitleDiversitySummary,
  parseDirectorTaskNotice,
  resolveChapterTitleWarning,
} from "@/lib/directorTaskNotice";
import { canContinueFront10AutoExecution, getCandidateSelectionLink, requiresCandidateSelection } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";
import { LlmInvocationDiagnosticCard } from "@/components/common/LlmInvocationDiagnosticCard";
import {
  TaskCenterDetailPane,
  TaskCenterFilters,
  TaskCenterSummaryCards,
  TaskCenterTaskList,
} from "./taskCenterPage.components";
import {
  ACTIVE_STATUSES,
  ANOMALY_STATUSES,
  ARCHIVABLE_STATUSES,
  createIdempotencyKey,
  followUpActionVariant,
  formatCheckpoint,
  formatDate,
  formatFollowUpPriority,
  formatKind,
  formatResumeTarget,
  formatStatus,
  formatTokenCount,
  getTaskListPriority,
  getTimestamp,
  normalizeTaskMeta,
  normalizeTaskSteps,
  serializeListParams,
  type TaskSortMode,
  toStatusVariant,
} from "./taskCenterPage.shared";

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
  const [retryOverride, setRetryOverride] = useState<LLMSelectorValue>({
    provider: llm.provider,
    model: llm.model,
    temperature: llm.temperature,
  });

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

  const allRows = listQuery.data?.data?.items ?? [];
  const visibleRows = useMemo(
    () =>
      (onlyAnomaly ? allRows.filter((item) => ANOMALY_STATUSES.has(item.status)) : allRows)
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
          const priorityDiff = getTaskListPriority(left.item.status) - getTaskListPriority(right.item.status);
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

  const runningCount = allRows.filter((item) => item.status === "running").length;
  const queuedCount = allRows.filter((item) => item.status === "queued").length;
  const failedCount = allRows.filter((item) => item.status === "failed").length;
  const completed24hCount = allRows.filter((item) => {
    if (item.status !== "succeeded") {
      return false;
    }
    const updatedAt = new Date(item.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) {
      return false;
    }
    return Date.now() - updatedAt <= 24 * 60 * 60 * 1000;
  }).length;

  const invalidateTaskQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
    mutationFn: (payload: { taskId: string; mode?: "auto_execute_range" }) => continueNovelWorkflow(
      payload.taskId,
      payload.mode ? { continuationMode: payload.mode } : undefined,
    ),
    onSuccess: async (response, variables) => {
      await invalidateTaskQueries();
      const task = response.data;
      const feedback = resolveWorkflowContinuationFeedback(task, {
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
      if (task?.kind && task.id) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", task.kind);
          next.set("id", task.id);
          return next;
        });
        navigate(task.sourceRoute);
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
  const isActiveAutoDirectorTask = Boolean(
    selectedTask
    && isAutoDirectorTask
    && ACTIVE_STATUSES.has(selectedTask.status),
  );
  const canResumeFront10AutoExecution = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && canContinueFront10AutoExecution(selectedTask),
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
  const canRetryWithSelectedModel = Boolean(retryOverride.provider && retryOverride.model.trim());
  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.tasks.autoDirectorFollowUpDetail(selectedId ?? "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(selectedId as string),
    enabled: Boolean(selectedId && isAutoDirectorTask),
    retry: false,
    refetchInterval: (query) => {
      const followUp = query.state.data?.data;
      return followUp?.task && ACTIVE_STATUSES.has(followUp.task.status) ? 4000 : false;
    },
  });
  const selectedAutoDirectorFollowUp = autoDirectorFollowUpQuery.data?.data ?? null;

  useEffect(() => {
    setRetryOverride({
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
  }, [llm.model, llm.provider, llm.temperature, selectedTask?.id]);

  const executeFollowUpActionMutation = useMutation({
    mutationFn: (payload: { taskId: string; actionCode: AutoDirectorMutationActionCode }) =>
      executeAutoDirectorFollowUpAction(payload.taskId, {
        actionCode: payload.actionCode,
        idempotencyKey: createIdempotencyKey(payload.taskId, payload.actionCode),
      }),
    onSuccess: async (response) => {
      const result = response.data;
      if (result?.task) {
        syncKnownTaskCaches(queryClient, result.task);
      }
      await Promise.all([
        invalidateTaskQueries(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.autoDirectorFollowUpDetail(result?.taskId ?? selectedId ?? "none"),
        }),
      ]);
      if (result?.code === "failed" || result?.code === "forbidden") {
        toast.error(result.message);
        return;
      }
      toast.success(result?.message ?? "操作已执行");
    },
  });

  const handleFollowUpAction = (action: AutoDirectorAction) => {
    if (!selectedTask) {
      return;
    }
    if (action.kind === "navigation") {
      const targetUrl = action.targetUrl ?? selectedTask.sourceRoute;
      const internalTarget = resolveInternalNavigationTarget(targetUrl);
      if (internalTarget) {
        navigate(internalTarget);
        return;
      }
      const externalTarget = targetUrl?.trim();
      if (externalTarget && /^https?:\/\//i.test(externalTarget)) {
        window.location.assign(externalTarget);
      }
      return;
    }
    if (action.requiresConfirm) {
      const confirmed = window.confirm(`确认执行“${action.label}”？`);
      if (!confirmed) {
        return;
      }
    }
    executeFollowUpActionMutation.mutate({
      taskId: selectedTask.id,
      actionCode: action.code as AutoDirectorMutationActionCode,
    });
  };

  return (
    <div className="space-y-4">
      <TaskCenterSummaryCards runningCount={runningCount} queuedCount={queuedCount} failedCount={failedCount} completed24hCount={completed24hCount} />

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <TaskCenterFilters kind={kind} status={status} keyword={keyword} onlyAnomaly={onlyAnomaly} sortMode={sortMode} onKindChange={setKind} onStatusChange={setStatus} onKeywordChange={setKeyword} onOnlyAnomalyChange={setOnlyAnomaly} onSortModeChange={setSortMode} />

        <TaskCenterTaskList visibleRows={visibleRows} selectedKind={selectedKind} selectedId={selectedId} onSelectTask={(task) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("kind", task.kind);
            next.set("id", task.id);
            return next;
          });
        }} />

        <TaskCenterDetailPane selectedTask={selectedTask} selectedTaskSteps={selectedTaskSteps} selectedTaskMeta={selectedTaskMeta} isAutoDirectorTask={isAutoDirectorTask} isActiveAutoDirectorTask={isActiveAutoDirectorTask} canResumeFront10AutoExecution={canResumeFront10AutoExecution} needsCandidateSelection={needsCandidateSelection} selectedTaskNotice={selectedTaskNotice} selectedTaskNoticeRoute={selectedTaskNoticeRoute} selectedTaskChapterTitleWarning={selectedTaskChapterTitleWarning} selectedTaskFailureRepairRoute={selectedTaskFailureRepairRoute} selectedTaskHasChapterTitleFailure={selectedTaskHasChapterTitleFailure} selectedAutoDirectorFollowUp={selectedAutoDirectorFollowUp} llmProvider={llm.provider} llmModel={llm.model} retryOverride={retryOverride} canRetryWithSelectedModel={canRetryWithSelectedModel} retryPending={retryMutation.isPending} continuePending={continueWorkflowMutation.isPending} cancelPending={cancelMutation.isPending} archivePending={archiveMutation.isPending} chapterTitleRepairPending={chapterTitleRepairMutation.isPending} executeFollowUpPending={executeFollowUpActionMutation.isPending} onRetryOverrideChange={setRetryOverride} onNavigate={navigate} onRepairChapterTitle={(task) => chapterTitleRepairMutation.startRepair(task)} onFollowUpAction={handleFollowUpAction} onRetryWithSelectedModel={(task) => retryMutation.mutate({ kind: task.kind, id: task.id, llmOverride: { provider: retryOverride.provider, model: retryOverride.model, temperature: retryOverride.temperature }, resume: true })} onRetryTask={(task) => retryMutation.mutate({ kind: task.kind, id: task.id })} onContinueAutoExecution={(task) => continueWorkflowMutation.mutate({ taskId: task.id, mode: "auto_execute_range" })} onContinueWorkflow={(task) => continueWorkflowMutation.mutate({ taskId: task.id })} onCancelTask={(task) => cancelMutation.mutate({ kind: task.kind, id: task.id })} onArchiveTask={(task) => archiveMutation.mutate({ kind: task.kind, id: task.id })} />
      </div>
    </div>
  );
}
