import type { KeyboardEvent, MouseEvent } from "react";
import { useMemo, useState } from "react";
import type { ProjectProgressStatus } from "@ai-novel/shared/types/novel";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { deleteNovel, downloadNovelExport, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  canContinueDirector,
  canContinueFront10AutoExecution,
  canEnterChapterExecution,
  getCandidateSelectionLink,
  getTaskCenterLink,
  getWorkflowBadge,
  getWorkflowDescription,
  isWorkflowRunningInBackground,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import NovelWorkflowRunningIndicator from "./components/NovelWorkflowRunningIndicator";

type StatusFilter = "all" | "draft" | "published";
type WritingModeFilter = "all" | "original" | "continuation";
const DIRECTOR_CREATE_LINK = "/novels/create?mode=director";
const MANUAL_CREATE_LINK = "/novels/create";

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

function formatProgressStatus(status?: ProjectProgressStatus | null): string {
  if (status === "completed") {
    return "已完成";
  }
  if (status === "in_progress") {
    return "进行中";
  }
  if (status === "rework") {
    return "待返工";
  }
  if (status === "blocked") {
    return "受阻";
  }
  return "未开始";
}

function formatTokenCount(value?: number | null): string {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
  return new Intl.NumberFormat("zh-CN").format(normalized);
}

export default function NovelList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [writingMode, setWritingMode] = useState<WritingModeFilter>("all");

  const novelListQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });

  const deleteNovelMutation = useMutation({
    mutationFn: (id: string) => deleteNovel(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
      toast.success("小说已删除。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除小说失败。");
    },
  });

  const downloadNovelMutation = useMutation({
    mutationFn: (input: { novelId: string; novelTitle: string }) => downloadNovelExport(
      input.novelId,
      "txt",
      "full",
      input.novelTitle,
    ),
    onSuccess: ({ blob, fileName }) => {
      createDownload(blob, fileName);
      toast.success("导出已开始。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "导出小说失败。");
    },
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      mode?: "auto_execute_range";
    }) => continueNovelWorkflow(input.taskId, input.mode ? { continuationMode: input.mode } : undefined),
    onSuccess: async (response, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
      const feedback = resolveWorkflowContinuationFeedback(response.data, {
        mode: input.mode,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      toast.success(feedback.message);
    },
    onError: (error, input) => {
      toast.error(
        error instanceof Error
          ? error.message
          : input.mode === "auto_execute_range"
            ? "继续自动执行当前章节范围失败。"
            : "继续自动导演失败。",
      );
    },
  });

  const allNovels = novelListQuery.data?.data?.items ?? [];

  const novels = useMemo(() => {
    return allNovels.filter((item) => {
      if (status !== "all" && item.status !== status) {
        return false;
      }
      if (writingMode !== "all" && item.writingMode !== writingMode) {
        return false;
      }
      return true;
    });
  }, [allNovels, status, writingMode]);

  const handleDelete = (novelId: string, title: string) => {
    const confirmed = window.confirm(`确认删除《${title}》吗？该操作会直接删除当前小说。`);
    if (!confirmed) {
      return;
    }
    deleteNovelMutation.mutate(novelId);
  };

  const stopCardClick = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const openNovelEditor = (novelId: string) => {
    navigate(`/novels/${novelId}/edit`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant={status === "all" ? "default" : "secondary"}
              onClick={() => setStatus("all")}
            >
              全部
            </Button>
            <Button
              variant={status === "draft" ? "default" : "secondary"}
              onClick={() => setStatus("draft")}
            >
              草稿
            </Button>
            <Button
              variant={status === "published" ? "default" : "secondary"}
              onClick={() => setStatus("published")}
            >
              已发布
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={writingMode === "all" ? "default" : "secondary"}
              onClick={() => setWritingMode("all")}
            >
              创作类型: 全部
            </Button>
            <Button
              size="sm"
              variant={writingMode === "original" ? "default" : "secondary"}
              onClick={() => setWritingMode("original")}
            >
              原创
            </Button>
            <Button
              size="sm"
              variant={writingMode === "continuation" ? "default" : "secondary"}
              onClick={() => setWritingMode("continuation")}
            >
              续写
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to={DIRECTOR_CREATE_LINK}>AI 自动导演开书</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </div>

      {novelListQuery.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={`loading-${index}`} className="animate-pulse">
              <CardHeader>
                <div className="h-6 w-2/3 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="h-20 rounded bg-muted" />
                <div className="flex gap-2">
                  <div className="h-9 w-24 rounded bg-muted" />
                  <div className="h-9 w-20 rounded bg-muted" />
                  <div className="h-9 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : novelListQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>加载小说列表失败</CardTitle>
            <CardDescription>当前无法读取项目列表，可以重试一次。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void novelListQuery.refetch()}>重新加载</Button>
          </CardContent>
        </Card>
      ) : novels.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{allNovels.length === 0 ? "暂无小说" : "暂无符合筛选条件的小说"}</CardTitle>
            <CardDescription>
              {allNovels.length === 0
                ? "第一次使用时，推荐直接点右上角“AI 自动导演开书”，让系统先帮你搭好方向与开写准备。"
                : "可以调整上方筛选条件，或直接创建新的小说项目。"}
            </CardDescription>
          </CardHeader>
          {allNovels.length === 0 ? (
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={DIRECTOR_CREATE_LINK}>AI 自动导演开书</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {novels.map((novel) => {
            const workflowTask = novel.latestAutoDirectorTask ?? null;
            const workflowBadge = getWorkflowBadge(workflowTask);
            const workflowDescription = getWorkflowDescription(workflowTask);
            const isWorkflowRunning = isWorkflowRunningInBackground(workflowTask);
            const isWorkflowPending = continueWorkflowMutation.isPending
              && continueWorkflowMutation.variables?.taskId === workflowTask?.id;
            const isDownloadPending = downloadNovelMutation.isPending
              && downloadNovelMutation.variables?.novelId === novel.id;
            const isDeletePending = deleteNovelMutation.isPending
              && deleteNovelMutation.variables === novel.id;

            return (
              <Card
                key={novel.id}
                role="link"
                tabIndex={0}
                className="cursor-pointer transition hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={() => openNovelEditor(novel.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openNovelEditor(novel.id);
                  }
                }}
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="line-clamp-1 text-lg transition hover:text-primary">
                      {novel.title}
                    </CardTitle>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                        {novel.status === "published" ? "已发布" : "草稿"}
                      </Badge>
                      {novel.writingMode === "continuation" ? (
                        <Badge variant="outline">续写</Badge>
                      ) : (
                        <Badge variant="outline">原创</Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {novel.description || "暂无简介"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    章节数：{novel._count.chapters}，角色数：{novel._count.characters}，累计 Token：{formatTokenCount(
                      novel.tokenUsage?.totalTokens,
                    )}
                  </div>

                  {workflowTask ? (
                    <div
                      className={cn(
                        "rounded-xl border p-3 transition-colors",
                        isWorkflowRunning
                          ? "border-primary/20 bg-primary/[0.04] shadow-sm"
                          : "bg-muted/20",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {workflowBadge ? (
                          <Badge variant={workflowBadge.variant}>{workflowBadge.label}</Badge>
                        ) : null}
                        <Badge variant="outline">进度 {Math.round(workflowTask.progress * 100)}%</Badge>
                        {isWorkflowRunning ? (
                          <Badge variant="outline">后台运行中</Badge>
                        ) : null}
                      </div>
                      {workflowDescription ? (
                        <div className="mt-2 text-sm text-muted-foreground">{workflowDescription}</div>
                      ) : null}
                      {isWorkflowRunning ? (
                        <NovelWorkflowRunningIndicator
                          className="mt-3"
                          progress={workflowTask.progress}
                          label={workflowTask.currentItemLabel?.trim() || "AI 正在后台持续推进"}
                        />
                      ) : null}
                      <div className="mt-2 text-xs text-muted-foreground">
                        当前阶段：{workflowTask.currentStage ?? "自动导演"}{workflowTask.currentItemLabel ? ` · ${workflowTask.currentItemLabel}` : ""}
                      </div>
                      {workflowTask.lastHealthyStage ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          最近健康阶段：{workflowTask.lastHealthyStage}
                        </div>
                      ) : null}
                      {workflowTask.resumeAction ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          建议继续：{workflowTask.resumeAction}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
                      当前未检测到自动导演任务，列表按小说基础资产展示。
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>项目：{formatProgressStatus(novel.projectStatus)}</span>
                    <span>主线：{formatProgressStatus(novel.storylineStatus)}</span>
                    <span>大纲：{formatProgressStatus(novel.outlineStatus)}</span>
                    <span>资源：{novel.resourceReadyScore ?? 0}/100</span>
                  </div>

                  {novel.world ? (
                    <div className="text-xs text-muted-foreground">
                      世界观：{novel.world.name}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {canContinueFront10AutoExecution(workflowTask) ? (
                      <Button
                        size="sm"
                        onClick={(event) => {
                          stopCardClick(event);
                          if (!workflowTask) {
                            return;
                          }
                          continueWorkflowMutation.mutate({
                            taskId: workflowTask.id,
                            mode: "auto_execute_range",
                          });
                        }}
                        disabled={isWorkflowPending}
                      >
                        {isWorkflowPending ? "继续执行中..." : (workflowTask?.resumeAction ?? `继续自动执行${workflowTask?.executionScopeLabel ?? "当前章节范围"}`)}
                      </Button>
                    ) : canContinueDirector(workflowTask) ? (
                      <Button
                        size="sm"
                        onClick={(event) => {
                          stopCardClick(event);
                          if (!workflowTask) {
                            return;
                          }
                          continueWorkflowMutation.mutate({
                            taskId: workflowTask.id,
                          });
                        }}
                        disabled={isWorkflowPending}
                      >
                        {isWorkflowPending ? "继续中..." : (workflowTask?.resumeAction ?? "继续导演")}
                      </Button>
                    ) : requiresCandidateSelection(workflowTask) ? (
                      <Button asChild size="sm">
                        <Link to={getCandidateSelectionLink(workflowTask!.id)} onClick={stopCardClick}>
                          {workflowTask!.resumeAction ?? "继续确认书级方向"}
                        </Link>
                      </Button>
                    ) : canEnterChapterExecution(workflowTask) ? (
                      <Button asChild size="sm">
                        <Link to={`/novels/${novel.id}/edit`} onClick={stopCardClick}>进入章节执行</Link>
                      </Button>
                    ) : workflowTask ? (
                      <Button asChild size="sm">
                        <Link to={getTaskCenterLink(workflowTask.id)} onClick={stopCardClick}>查看任务</Link>
                      </Button>
                    ) : null}

                    {workflowTask ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={getTaskCenterLink(workflowTask.id)} onClick={stopCardClick}>任务中心</Link>
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        stopCardClick(event);
                        downloadNovelMutation.mutate({
                          novelId: novel.id,
                          novelTitle: novel.title,
                        });
                      }}
                      disabled={isDownloadPending}
                    >
                      {isDownloadPending ? "导出中..." : "导出"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(event) => {
                        stopCardClick(event);
                        handleDelete(novel.id, novel.title);
                      }}
                      disabled={isDeletePending}
                    >
                      {isDeletePending ? "删除中..." : "删除"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
