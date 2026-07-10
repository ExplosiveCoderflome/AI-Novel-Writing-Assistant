import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type { TaskKind, TaskStatus, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import { getDirectorTaskSnapshot } from "@/api/novelDirector";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { archiveTask, cancelTask, getTaskDetail, listTasks, retryTask } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import DirectorRuntimeProjectionCard from "@/components/autoDirector/DirectorRuntimeProjectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { syncKnownTaskCaches } from "@/lib/taskQueryCache";
import { buildTaskNoticeRoute, isChapterTitleDiversitySummary, parseDirectorTaskNotice, resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { canCancelDirectorTask, canContinueChapterBatchAutoExecution, getCandidateSelectionLink, requiresCandidateSelection } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";
import TaskCenterFilterPanel from "./components/TaskCenterFilterPanel";
import TaskCenterDetailSummary from "./components/TaskCenterDetailSummary";
import TaskCenterListPanel from "./components/TaskCenterListPanel";
import TaskCenterMilestoneHistory from "./components/TaskCenterMilestoneHistory";
import TaskCenterSummaryCards from "./components/TaskCenterSummaryCards";
import {
  ACTIVE_STATUSES,
  ANOMALY_STATUSES,
  ARCHIVABLE_STATUSES,
  formatCheckpoint,
  formatStatus,
  getTaskListPriority,
  getTimestamp,
  serializeListParams,
  toStatusVariant,
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
          ? `已切换到 ${variables.llmOverride.provider ?? t("gen.pages.tasks.TaskCenterPage.gen_2b63b0a1")} / ${variables.llmOverride.model ?? t("gen.pages.tasks.TaskCenterPage.gen_e18ae875")} 并重试任务`
          : t("gen.pages.tasks.TaskCenterPage.taskRequeued"),
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => cancelTask(payload.kind, payload.id),
    onSuccess: async () => {
      await invalidateTaskQueries();
      toast.success(t("gen.pages.tasks.TaskCenterPage.cancelRequestSubmitted"));
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
      toast.success(t("gen.pages.tasks.TaskCenterPage.taskArchivedAndHiddenFromTaskCenter"));
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



  return (
    <div className="space-y-4">
      <TaskCenterSummaryCards
        runningCount={runningCount}
        queuedCount={queuedCount}
        failedCount={failedCount}
        completed24hCount={completed24hCount}
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
          onSelectTask={(task) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("kind", task.kind);
              next.set("id", task.id);
              return next;
            });
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("gen.pages.tasks.TaskCenterPage.taskIdDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedTask ? (
              <>
                <TaskCenterDetailSummary
                  task={selectedTask}
                  isAutoDirectorTask={isAutoDirectorTask}
                  currentModelLabel={`${llm.provider} / ${llm.model}`}
                  dashboardView={selectedDirectorDashboardView}
                />
                {selectedTask.noticeCode || selectedTask.noticeSummary ? (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                    <div className="font-medium">
                      {selectedTaskChapterTitleWarning ? t("gen.pages.tasks.TaskCenterPage.gen_d7df9e41") : (selectedTask.noticeCode ?? t("gen.pages.tasks.TaskCenterPage.gen_5aad7da1"))}
                    </div>
                    {selectedTask.noticeSummary ? (
                      <div className="mt-1 text-sm">{selectedTask.noticeSummary}</div>
                    ) : null}
                    {selectedTaskChapterTitleWarning || selectedTaskNoticeRoute ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (selectedTaskChapterTitleWarning) {
                              chapterTitleRepairMutation.startRepair(selectedTask ?? null);
                              return;
                            }
                            if (selectedTaskNoticeRoute) {
                              navigate(selectedTaskNoticeRoute);
                            }
                          }}
                          disabled={chapterTitleRepairMutation.isPending}
                        >
                          {selectedTaskChapterTitleWarning?.label ?? selectedTaskNotice?.action?.label ?? t("gen.pages.tasks.TaskCenterPage.gen_db866099")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedTask.failureCode || selectedTask.failureSummary ? (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                    <div className="font-medium">
                      {selectedTaskHasChapterTitleFailure ? t("gen.pages.tasks.TaskCenterPage.gen_d7df9e41") : (selectedTask.failureCode ?? t("gen.pages.tasks.TaskCenterPage.taskException"))}
                    </div>
                    {selectedTask.failureSummary ? (
                      <div className="mt-1 text-sm">{selectedTask.failureSummary}</div>
                    ) : null}
                    {selectedTaskChapterTitleWarning || selectedTaskFailureRepairRoute ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (selectedTaskChapterTitleWarning) {
                              chapterTitleRepairMutation.startRepair(selectedTask ?? null);
                              return;
                            }
                            if (selectedTaskFailureRepairRoute) {
                              navigate(selectedTaskFailureRepairRoute);
                            }
                          }}
                          disabled={chapterTitleRepairMutation.isPending}
                        >
                          {selectedTaskChapterTitleWarning?.label ?? t("gen.pages.tasks.TaskCenterPage.gen_62c615c2")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedTask.lastError && !selectedTaskHasChapterTitleFailure ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                    {selectedTask.lastError}
                  </div>
                ) : null}
                {selectedTask.kind === "novel_workflow" && selectedTask.checkpointSummary ? (
                  <div className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
                    {selectedTask.checkpointSummary}
                  </div>
                ) : null}
                {isAutoDirectorTask ? (
                  <DirectorRuntimeProjectionCard projection={selectedDirectorRuntimeProjectionForDisplay} />
                ) : null}
                {isAutoDirectorTask ? (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                    继续导演、恢复任务、切换模型、推进策略和改动影响检查，请回到小说页面右侧的执行详情面板处理。这里保留任务记录、状态摘要以及取消、归档、打开来源页等基础操作。
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {!isAutoDirectorTask && needsCandidateSelection ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(getCandidateSelectionLink(selectedTask.id))}
                    >
                      {selectedTask.resumeAction ?? t("gen.pages.tasks.TaskCenterPage.gen_4763a24b")}
                    </Button>
                  ) : null}
                  {!isAutoDirectorTask && canResumeFront10AutoExecution ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (selectedTask.status === "failed" || selectedTask.status === "cancelled") {
                          retryMutation.mutate({
                            kind: selectedTask.kind,
                            id: selectedTask.id,
                            resume: true,
                          });
                          return;
                        }
                        continueWorkflowMutation.mutate({
                          taskId: selectedTask.id,
                          mode: "auto_execute_range",
                        });
                      }}
                      disabled={continueWorkflowMutation.isPending || retryMutation.isPending || runtimeHardBlocked}
                    >
                      {selectedTask.resumeAction ?? `继续自动执行${selectedTask.executionScopeLabel ?? t("gen.pages.tasks.TaskCenterPage.gen_d7432bb5")}`}
                    </Button>
                  ) : null}
                  {!isAutoDirectorTask
                  && selectedTask.kind === "novel_workflow"
                  && !needsCandidateSelection
                  && !canResumeFront10AutoExecution
                  && (selectedTask.status === "waiting_approval" || selectedTask.status === "queued" || selectedTask.status === "running") ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        continueWorkflowMutation.mutate({
                          taskId: selectedTask.id,
                          mode: selectedTask.status === "waiting_approval" ? "resume" : undefined,
                        })}
                      disabled={continueWorkflowMutation.isPending || runtimeHardBlocked}
                    >
                      {selectedTask.resumeAction ?? (isActiveAutoDirectorTask ? t("gen.pages.tasks.TaskCenterPage.gen_9600c918") : t("gen.pages.tasks.TaskCenterPage.gen_27ca568b"))}
                    </Button>
                  ) : null}
                  {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && !isAutoDirectorTask ? (
                    <>
                      <Button
                        size="sm"
                        variant={isAutoDirectorTask ? "outline" : "default"}
                        onClick={() =>
                          retryMutation.mutate({
                            kind: selectedTask.kind,
                            id: selectedTask.id,
                            resume: isAutoDirectorTask ? true : undefined,
                          })
                        }
                        disabled={retryMutation.isPending}
                      >
                        {isAutoDirectorTask ? t("gen.pages.tasks.TaskCenterPage.gen_51405c41") : t("gen.pages.tasks.TaskCenterPage.gen_132c5cdc")}
                      </Button>
                    </>
                  ) : null}
                  {(
                    (selectedTask.kind === "novel_workflow" && canCancelDirectorTask(selectedTask))
                    || (selectedTask.kind !== "novel_workflow"
                      && (selectedTask.status === "queued"
                        || selectedTask.status === "running"
                        || selectedTask.status === "waiting_approval"))
                  ) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        cancelMutation.mutate({
                          kind: selectedTask.kind,
                          id: selectedTask.id,
                        })}
                      disabled={cancelMutation.isPending}
                      >
                      取消
                    </Button>
                  ) : null}
                  {ARCHIVABLE_STATUSES.has(selectedTask.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        archiveMutation.mutate({
                          kind: selectedTask.kind,
                          id: selectedTask.id,
                        })}
                      disabled={archiveMutation.isPending}
                    >
                      归档
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link to={selectedTask!.sourceRoute}>{t("gen.pages.tasks.TaskCenterPage.gen_492476d9")}</Link>
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="font-medium">{t("gen.pages.tasks.TaskCenterPage.gen_d96a7b07")}</div>
                  {selectedTaskSteps.length === 0 ? (
                    <div className="rounded-md border border-dashed p-2 text-muted-foreground">{t("gen.pages.tasks.TaskCenterPage.gen_fd13e45f")}</div>
                  ) : selectedTaskSteps.map((step) => (
                    <div key={step.key} className="flex items-center justify-between rounded-md border p-2">
                      <div>{step.label}</div>
                      <Badge variant="outline">{step.status}</Badge>
                    </div>
                  ))}
                </div>
                {selectedTask.kind === "novel_workflow" && Array.isArray(selectedTaskMeta.milestones) && selectedTaskMeta.milestones.length > 0 ? (
                  <TaskCenterMilestoneHistory milestones={selectedTaskMeta.milestones as NovelWorkflowMilestone[]} />
                ) : null}
              </>
            ) : (
              <div className="text-muted-foreground">{t("gen.pages.tasks.TaskCenterPage.gen_2823aeb0")}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
