import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { Link, useSearchParams } from "react-router-dom";
import { cancelTask, getTaskDetail, listTasks, retryTask } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running"]);
const ANOMALY_STATUSES = new Set<TaskStatus>(["failed", "cancelled"]);

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

function formatKind(kind: TaskKind): string {
  if (kind === "book_analysis") {
    return "拆书分析";
  }
  if (kind === "novel_pipeline") {
    return "小说流水线";
  }
  return "图片生成";
}

function formatStatus(status: TaskStatus): string {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "running") {
    return "运行中";
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
  const queryClient = useQueryClient();
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
    () => (onlyAnomaly ? allRows.filter((item) => ANOMALY_STATUSES.has(item.status)) : allRows),
    [allRows, onlyAnomaly],
  );

  const detailQuery = useQuery({
    queryKey: queryKeys.tasks.detail(selectedKind ?? "none", selectedId ?? "none"),
    queryFn: () => getTaskDetail(selectedKind as TaskKind, selectedId as string),
    enabled: Boolean(selectedKind && selectedId),
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
    mutationFn: (payload: { kind: TaskKind; id: string }) => retryTask(payload.kind, payload.id),
    onSuccess: async (response) => {
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
      toast.success("任务已重新入队");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => cancelTask(payload.kind, payload.id),
    onSuccess: async () => {
      await invalidateTaskQueries();
      toast.success("任务取消请求已提交");
    },
  });

  const selectedTask = detailQuery.data?.data;

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
              <option value="novel_pipeline">小说流水线</option>
              <option value="image_generation">图片生成</option>
            </select>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus | "")}
            >
              <option value="">全部状态</option>
              <option value="queued">排队中</option>
              <option value="running">运行中</option>
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
                  <div>当前阶段：{selectedTask.currentStage ?? "暂无"}</div>
                  <div>当前项：{selectedTask.currentItemLabel ?? "暂无"}</div>
                  <div>最近心跳：{formatDate(selectedTask.heartbeatAt)}</div>
                  <div>开始时间：{formatDate(selectedTask.startedAt)}</div>
                  <div>结束时间：{formatDate(selectedTask.finishedAt)}</div>
                  <div>重试计数：{selectedTask.retryCountLabel}</div>
                </div>
                {selectedTask.lastError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                    {selectedTask.lastError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {(selectedTask.status === "failed" || selectedTask.status === "cancelled") ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        retryMutation.mutate({
                          kind: selectedTask.kind,
                          id: selectedTask.id,
                        })}
                      disabled={retryMutation.isPending}
                    >
                      重试
                    </Button>
                  ) : null}
                  {(selectedTask.status === "queued" || selectedTask.status === "running") ? (
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
                  <Button asChild size="sm" variant="outline">
                    <Link to={selectedTask.sourceRoute}>打开来源页面</Link>
                  </Button>
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
