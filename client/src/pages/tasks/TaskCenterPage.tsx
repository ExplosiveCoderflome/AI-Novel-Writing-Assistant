import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { NovelWorkflowCheckpoint, NovelWorkflowResumeTarget } from "@ai-novel/shared/types/novelWorkflow";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { archiveTask, cancelTask, getTaskDetail, listTasks, retryTask } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { canContinueFront10AutoExecution, getCandidateSelectionLink, requiresCandidateSelection } from "@/lib/novelWorkflowTaskUi";
import { useLLMStore } from "@/store/llmStore";

const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);
const ANOMALY_STATUSES = new Set<TaskStatus>(["failed", "cancelled"]);
const ARCHIVABLE_STATUSES = new Set<TaskStatus>(["succeeded", "failed", "cancelled"]);

function getTaskListPriority(status: TaskStatus): number {
  return status === "failed" ? 0 : 1;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString();
}

function formatTokenCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));
}

function formatKind(kind: TaskKind): string {
  if (kind === "book_analysis") {
    return "拆书分析";
  }
  if (kind === "novel_workflow") {
    return "小说创作";
  }
  if (kind === "novel_pipeline") {
    return "小说流水线";
  }
  if (kind === "knowledge_document") {
    return "知识库索引";
  }
  if (kind === "agent_run") {
    return "Agent 运行";
  }
  return "图片生成";
}

function formatCheckpoint(checkpoint: NovelWorkflowCheckpoint | null | undefined): string {
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
    return "卷战略已就绪";
  }
  if (checkpoint === "front10_ready") {
    return "前 10 章可开写";
  }
  if (checkpoint === "chapter_batch_ready") {
    return "章节批量资源已就绪";
  }
  if (checkpoint === "replan_required") {
    return "需要重规划";
  }
  if (checkpoint === "workflow_completed") {
    return "主流程完成";
  }
  return "暂无";
}

function formatResumeTarget(target: NovelWorkflowResumeTarget | null | undefined): string {
  if (!target) {
    return "暂无";
  }
  if (target.route === "/novels/create") {
    return target.mode === "director" ? "创建页 / AI 自动导演" : "创建页";
  }
  if (target.stage === "story_macro") {
    return "小说编辑页 / 故事宏观规划";
  }
  if (target.stage === "character") {
    return "小说编辑页 / 角色准备";
  }
  if (target.stage === "outline") {
    return "小说编辑页 / 卷战略";
  }
  if (target.stage === "structured") {
    return "小说编辑页 / 节奏拆章";
  }
  if (target.stage === "chapter") {
    return "小说编辑页 / 章节执行";
  }
  if (target.stage === "pipeline") {
    return "小说编辑页 / 质量修复";
  }
  return "小说编辑页 / 项目设定";
}

function formatStatus(status: TaskStatus): string {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "running") {
    return "运行中";
  }
  if (status === "waiting_approval") {
    return "等待审批";
  }
  if (status === "succeeded") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  return "已取消";
}

function toStatusVariant(status: TaskStatus): "default" | "outline" | "secondary" | "destructive" {
  if (status === "running") {
    return "default";
  }
  if (status === "waiting_approval") {
    return "secondary";
  }
  if (status === "queued") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

function serializeListParams(input: {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
}): string {
  return JSON.stringify({
    kind: input.kind || null,
    status: input.status || null,
    keyword: input.keyword.trim() || null,
  });
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
          const priorityDiff = getTaskListPriority(left.item.status) - getTaskListPriority(right.item.status);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return left.index - right.index;
        })
        .map(({ item }) => item),
    [allRows, onlyAnomaly],
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
    mutationFn: (payload: { taskId: string; mode?: "auto_execute_front10" }) => continueNovelWorkflow(
      payload.taskId,
      payload.mode ? { continuationMode: payload.mode } : undefined,
    ),
    onSuccess: async (response, variables) => {
      await invalidateTaskQueries();
      const task = response.data;
      if (variables.mode === "auto_execute_front10") {
        toast.success("已继续自动执行前 10 章。");
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
      toast.success("已恢复小说主流程。");
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">运行中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{runningCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">排队中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{queuedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">失败</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{failedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">24h 完成</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{completed24hCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">筛选</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={kind}
              onChange={(event) => setKind(event.target.value as TaskKind | "")}
            >
              <option value="">全部类型</option>
              <option value="book_analysis">拆书分析</option>
              <option value="novel_workflow">小说创作</option>
              <option value="novel_pipeline">小说流水线</option>
              <option value="knowledge_document">知识库索引</option>
              <option value="image_generation">图片生成</option>
              <option value="agent_run">Agent 运行</option>
            </select>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus | "")}
            >
              <option value="">全部状态</option>
              <option value="queued">排队中</option>
              <option value="running">运行中</option>
              <option value="waiting_approval">等待审批</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
              <option value="succeeded">已完成</option>
            </select>
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="标题或关联对象"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyAnomaly}
                onChange={(event) => setOnlyAnomaly(event.target.checked)}
              />
              仅看异常任务
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">任务列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleRows.map((task) => {
              const isSelected = task.kind === selectedKind && task.id === selectedId;
              return (
                <button
                  key={`${task.kind}:${task.id}`}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                  onClick={() => {
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("kind", task.kind);
                      next.set("id", task.id);
                      return next;
                    });
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{task.title}</div>
                  <Badge variant={toStatusVariant(task.status)}>{formatStatus(task.status)}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {formatKind(task.kind)} | 进度 {Math.round(task.progress * 100)}%
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  阶段：{task.currentStage ?? "暂无"} | 当前项：{task.currentItemLabel ?? "暂无"}
                </div>
                {task.displayStatus || task.lastHealthyStage ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    状态：{task.displayStatus ?? formatStatus(task.status)} | 最近健康阶段：{task.lastHealthyStage ?? "暂无"}
                  </div>
                ) : null}
                {task.kind === "novel_workflow" ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    检查点：{formatCheckpoint(task.checkpointType)} | 建议继续：{task.resumeAction ?? task.nextActionLabel ?? "继续主流程"}
                  </div>
                ) : null}
                {task.blockingReason ? (
                  <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    原因：{task.blockingReason}
                  </div>
                ) : null}
                <div className="mt-1 text-xs text-muted-foreground">
                  最近心跳：{formatDate(task.heartbeatAt)} | 更新时间：{formatDate(task.updatedAt)}
                </div>
              </button>
              );
            })}
            {visibleRows.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                当前没有符合条件的任务。
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">任务详情</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedTask ? (
              <>
                <div className="space-y-1">
                  <div className="font-medium">{selectedTask.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatKind(selectedTask.kind)} | 归属：{selectedTask.ownerLabel}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={toStatusVariant(selectedTask.status)}>{formatStatus(selectedTask.status)}</Badge>
                  <Badge variant="outline">进度 {Math.round(selectedTask.progress * 100)}%</Badge>
                </div>
                <div className="space-y-1 text-muted-foreground">
                  <div>展示状态：{selectedTask.displayStatus ?? formatStatus(selectedTask.status)}</div>
                  <div>当前阶段：{selectedTask.currentStage ?? "暂无"}</div>
                  <div>当前项：{selectedTask.currentItemLabel ?? "暂无"}</div>
                  {selectedTask.kind === "novel_workflow" ? (
                    <>
                      <div>最近检查点：{formatCheckpoint(selectedTask.checkpointType)}</div>
                      <div>恢复目标页：{formatResumeTarget(selectedTask.resumeTarget)}</div>
                      <div>建议继续：{selectedTask.resumeAction ?? selectedTask.nextActionLabel ?? "继续小说主流程"}</div>
                      <div>最近健康阶段：{selectedTask.lastHealthyStage ?? "暂无"}</div>
                    </>
                  ) : null}
                  {selectedTask.blockingReason ? (
                    <div>阻塞原因：{selectedTask.blockingReason}</div>
                  ) : null}
                  <div>最近心跳：{formatDate(selectedTask.heartbeatAt)}</div>
                  <div>开始时间：{formatDate(selectedTask.startedAt)}</div>
                  <div>结束时间：{formatDate(selectedTask.finishedAt)}</div>
                  <div>重试计数：{selectedTask.retryCountLabel}</div>
                  {isAutoDirectorTask ? (
                    <>
                      <div>任务绑定模型：{selectedTask.provider ?? "暂无"} / {selectedTask.model ?? "暂无"}</div>
                      <div>当前界面模型：{llm.provider} / {llm.model}</div>
                    </>
                  ) : null}
                  {selectedTask.tokenUsage ? (
                    <>
                      <div>累计调用：{formatTokenCount(selectedTask.tokenUsage.llmCallCount)}</div>
                      <div>输入 Tokens：{formatTokenCount(selectedTask.tokenUsage.promptTokens)}</div>
                      <div>输出 Tokens：{formatTokenCount(selectedTask.tokenUsage.completionTokens)}</div>
                      <div>累计总 Tokens：{formatTokenCount(selectedTask.tokenUsage.totalTokens)}</div>
                      <div>最近记录：{formatDate(selectedTask.tokenUsage.lastRecordedAt)}</div>
                    </>
                  ) : null}
                </div>
                {selectedTask.noticeCode || selectedTask.noticeSummary ? (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                    <div className="font-medium">
                      {selectedTask.noticeCode ?? "结果提醒"}
                    </div>
                    {selectedTask.noticeSummary ? (
                      <div className="mt-1 text-sm">{selectedTask.noticeSummary}</div>
                    ) : null}
                  </div>
                ) : null}
                {selectedTask.failureCode || selectedTask.failureSummary ? (
                  <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                    <div className="font-medium">
                      {selectedTask.failureCode ?? "任务异常"}
                    </div>
                    {selectedTask.failureSummary ? (
                      <div className="mt-1 text-sm">{selectedTask.failureSummary}</div>
                    ) : null}
                  </div>
                ) : null}
                {selectedTask.lastError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                    {selectedTask.lastError}
                  </div>
                ) : null}
                {selectedTask.kind === "novel_workflow" && selectedTask.checkpointSummary ? (
                  <div className="rounded-md border bg-muted/20 p-2 text-muted-foreground">
                    {selectedTask.checkpointSummary}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {needsCandidateSelection ? (
                    <Button
                      size="sm"
                      onClick={() => navigate(getCandidateSelectionLink(selectedTask.id))}
                    >
                      {selectedTask.resumeAction ?? "继续确认书级方向"}
                    </Button>
                  ) : null}
                  {canResumeFront10AutoExecution ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        continueWorkflowMutation.mutate({
                          taskId: selectedTask.id,
                          mode: "auto_execute_front10",
                        })}
                      disabled={continueWorkflowMutation.isPending}
                    >
                      {selectedTask.resumeAction ?? "继续自动执行前 10 章"}
                    </Button>
                  ) : null}
                  {selectedTask.kind === "novel_workflow"
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
                  {(selectedTask.status === "failed" || selectedTask.status === "cancelled") ? (
                    <>
                      {isAutoDirectorTask ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            retryMutation.mutate({
                              kind: selectedTask.kind,
                              id: selectedTask.id,
                              llmOverride: {
                                provider: llm.provider,
                                model: llm.model,
                                temperature: llm.temperature,
                              },
                              resume: true,
                            })
                          }
                          disabled={retryMutation.isPending}
                        >
                          用当前模型重试
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant={isAutoDirectorTask ? "outline" : "default"}
                        onClick={() =>
                          retryMutation.mutate({
                            kind: selectedTask.kind,
                            id: selectedTask.id,
                          })
                        }
                        disabled={retryMutation.isPending}
                      >
                        重试
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
                {selectedTask.kind === "novel_workflow" && Array.isArray(selectedTask.meta.milestones) && selectedTask.meta.milestones.length > 0 ? (
                  <div className="space-y-2">
                    <div className="font-medium">里程碑历史</div>
                    {(selectedTask.meta.milestones as Array<{ checkpointType: NovelWorkflowCheckpoint; summary: string; createdAt: string }>).map((item) => (
                      <div key={`${item.checkpointType}:${item.createdAt}`} className="rounded-md border p-2 text-muted-foreground">
                        <div className="font-medium text-foreground">{formatCheckpoint(item.checkpointType)}</div>
                        <div className="mt-1">{item.summary}</div>
                        <div className="mt-1 text-xs">记录时间：{formatDate(item.createdAt)}</div>
                      </div>
                    ))}
                  </div>
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
