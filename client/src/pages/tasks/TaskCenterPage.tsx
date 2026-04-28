import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutoDirectorAction, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import { getDirectorRuntimeSnapshot } from "@/api/novelDirector";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { archiveTask, cancelTask, executeAutoDirectorFollowUpAction, getAutoDirectorFollowUpDetail, getTaskDetail, listTasks, retryTask } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import DirectorRuntimeProjectionCard from "@/components/autoDirector/DirectorRuntimeProjectionCard";
import LLMSelector, { type LLMSelectorValue } from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { syncKnownTaskCaches } from "@/lib/taskQueryCache";
import { buildTaskNoticeRoute, isChapterTitleDiversitySummary, parseDirectorTaskNotice, resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import { canContinueFront10AutoExecution, getCandidateSelectionLink, requiresCandidateSelection } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";
import TaskCenterFilterPanel from "./components/TaskCenterFilterPanel";
import TaskCenterDetailSummary from "./components/TaskCenterDetailSummary";
import TaskCenterListPanel from "./components/TaskCenterListPanel";
import TaskCenterManualEditImpactCard from "./components/TaskCenterManualEditImpactCard";
import TaskCenterMilestoneHistory from "./components/TaskCenterMilestoneHistory";
import TaskCenterRuntimePolicyCard from "./components/TaskCenterRuntimePolicyCard";
import TaskCenterSummaryCards from "./components/TaskCenterSummaryCards";
import {
  ACTIVE_STATUSES,
  ANOMALY_STATUSES,
  ARCHIVABLE_STATUSES,
  createIdempotencyKey,
  followUpActionVariant,
  formatCheckpoint,
  formatFollowUpPriority,
  formatStatus,
  getTaskListPriority,
  getTimestamp,
  serializeListParams,
  toStatusVariant,
  type TaskSortMode,
} from "./taskCenterUtils";

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
    if (selectedId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(selectedId) });
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
  const isAutoDirectorTask = Boolean(
    selectedTask
    && selectedTask.kind === "novel_workflow"
    && selectedTask.meta.lane === "auto_director",
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
    () => parseDirectorTaskNotice(selectedTask?.meta),
    [selectedTask?.meta],
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
  const directorRuntimeQuery = useQuery({
    queryKey: queryKeys.tasks.directorRuntime(selectedId ?? "none"),
    queryFn: () => getDirectorRuntimeSnapshot(selectedId as string),
    enabled: Boolean(selectedId && isAutoDirectorTask),
    retry: false,
    refetchInterval: (query) => {
      const projection = query.state.data?.data?.projection;
      return (
        (selectedTask && ACTIVE_STATUSES.has(selectedTask.status))
        || projection?.status === "running"
        || projection?.status === "waiting_approval"
      )
        ? 4000
        : false;
    },
  });
  const selectedDirectorRuntimeSnapshot = directorRuntimeQuery.data?.data?.snapshot ?? null;
  const selectedDirectorRuntimeProjection = directorRuntimeQuery.data?.data?.projection ?? null;

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
      navigate(action.targetUrl ?? selectedTask.sourceRoute);
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
            <CardTitle className="text-base">任务详情</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedTask ? (
              <>
                <TaskCenterDetailSummary
                  task={selectedTask}
                  isAutoDirectorTask={isAutoDirectorTask}
                  currentModelLabel={`${llm.provider} / ${llm.model}`}
                />
                {selectedTask.noticeCode || selectedTask.noticeSummary ? (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                    <div className="font-medium">
                      {selectedTaskChapterTitleWarning ? "当前提醒" : (selectedTask.noticeCode ?? "结果提醒")}
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
                          {selectedTaskChapterTitleWarning?.label ?? selectedTaskNotice?.action?.label ?? "打开当前卷拆章"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {selectedTask.failureCode || selectedTask.failureSummary ? (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                    <div className="font-medium">
                      {selectedTaskHasChapterTitleFailure ? "当前提醒" : (selectedTask.failureCode ?? "任务异常")}
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
                          {selectedTaskChapterTitleWarning?.label ?? "快速修复章节标题"}
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
                  <DirectorRuntimeProjectionCard projection={selectedDirectorRuntimeProjection} />
                ) : null}
                {isAutoDirectorTask ? (
                  <TaskCenterRuntimePolicyCard taskId={selectedTask.id} snapshot={selectedDirectorRuntimeSnapshot} />
                ) : null}
                {isAutoDirectorTask ? (
                  <TaskCenterManualEditImpactCard task={selectedTask} />
                ) : null}
                {selectedAutoDirectorFollowUp ? (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">当前待处理动作</div>
                      <Badge variant="outline">{selectedAutoDirectorFollowUp.reasonLabel}</Badge>
                      <Badge variant={selectedAutoDirectorFollowUp.priority === "P0" ? "destructive" : "secondary"}>
                        {formatFollowUpPriority(selectedAutoDirectorFollowUp.priority)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {selectedAutoDirectorFollowUp.followUpSummary}
                    </div>
                    {selectedAutoDirectorFollowUp.blockingReason ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        阻塞原因：{selectedAutoDirectorFollowUp.blockingReason}
                      </div>
                    ) : null}
                    {selectedAutoDirectorFollowUp.currentModel ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        当前任务模型：{selectedAutoDirectorFollowUp.currentModel}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedAutoDirectorFollowUp.availableActions.map((action) => (
                        <Button
                          key={action.code}
                          size="sm"
                          variant={followUpActionVariant(action)}
                          onClick={() => handleFollowUpAction(action)}
                          disabled={executeFollowUpActionMutation.isPending}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && isAutoDirectorTask ? (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">使用其他模型重试</div>
                    <div className="mt-2 flex flex-col gap-2">
                      <LLMSelector
                        value={retryOverride}
                        onChange={setRetryOverride}
                        compact
                        showBadge={false}
                        showHelperText={false}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            retryMutation.mutate({
                              kind: selectedTask.kind,
                              id: selectedTask.id,
                              llmOverride: {
                                provider: retryOverride.provider,
                                model: retryOverride.model,
                                temperature: retryOverride.temperature,
                              },
                              resume: true,
                            })
                          }
                          disabled={retryMutation.isPending || !canRetryWithSelectedModel}
                        >
                          使用所选模型重试
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {!selectedAutoDirectorFollowUp && needsCandidateSelection ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(getCandidateSelectionLink(selectedTask.id))}
                    >
                      {selectedTask.resumeAction ?? "继续确认书级方向"}
                    </Button>
                  ) : null}
                  {!selectedAutoDirectorFollowUp && canResumeFront10AutoExecution ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        continueWorkflowMutation.mutate({
                          taskId: selectedTask.id,
                          mode: "auto_execute_range",
                        })}
                      disabled={continueWorkflowMutation.isPending}
                    >
                      {selectedTask.resumeAction ?? `继续自动执行${selectedTask.executionScopeLabel ?? "当前章节范围"}`}
                    </Button>
                  ) : null}
                  {!selectedAutoDirectorFollowUp
                  && selectedTask.kind === "novel_workflow"
                  && !needsCandidateSelection
                  && !canResumeFront10AutoExecution
                  && (selectedTask.status === "waiting_approval" || selectedTask.status === "queued" || selectedTask.status === "running") ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        continueWorkflowMutation.mutate({
                          taskId: selectedTask.id,
                        })}
                      disabled={continueWorkflowMutation.isPending}
                    >
                      {selectedTask.resumeAction ?? (isActiveAutoDirectorTask ? "查看进度" : "继续")}
                    </Button>
                  ) : null}
                  {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && (!isAutoDirectorTask || !selectedAutoDirectorFollowUp) ? (
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
                        {isAutoDirectorTask ? "按任务原模型重试" : "重试"}
                      </Button>
                    </>
                  ) : null}
                  {(selectedTask.status === "queued" || selectedTask.status === "running" || selectedTask.status === "waiting_approval") ? (
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
                    <Link to={selectedTask.sourceRoute}>打开来源页面</Link>
                  </Button>
                  <OpenInCreativeHubButton
                    bindings={{ taskId: selectedTask.id }}
                    label="在创作中枢诊断"
                  />
                </div>
                <div className="space-y-2">
                  <div className="font-medium">步骤状态</div>
                  {selectedTask.steps.map((step) => (
                    <div key={step.key} className="flex items-center justify-between rounded-md border p-2">
                      <div>{step.label}</div>
                      <Badge variant="outline">{step.status}</Badge>
                    </div>
                  ))}
                </div>
                {selectedTask.kind === "novel_workflow" && Array.isArray(selectedTask.meta.milestones) ? (
                  <TaskCenterMilestoneHistory milestones={selectedTask.meta.milestones as NovelWorkflowMilestone[]} />
                ) : null}
              </>
            ) : (
              <div className="text-muted-foreground">请选择任务查看详情。</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
