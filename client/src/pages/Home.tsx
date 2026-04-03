import type { KeyboardEvent, MouseEvent } from "react";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { getNovelList } from "@/api/novel";
import type { NovelListResponse } from "@/api/novel/shared";
import { queryKeys } from "@/api/queryKeys";
import { listTasks } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canContinueDirector,
  canContinueFront10AutoExecution,
  canEnterChapterExecution,
  getTaskCenterLink,
  getWorkflowBadge,
  getWorkflowDescription,
  isLiveWorkflowTask,
  isWorkflowActionRequired,
} from "@/lib/novelWorkflowTaskUi";
import { toast } from "@/components/ui/toast";

const HOME_NOVEL_FETCH_LIMIT = 100;
const HOME_RECENT_LIMIT = 6;

type HomeNovelItem = NovelListResponse["items"][number];

function formatDate(value: string | undefined): string {
  if (!value) {
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }
  return date.toLocaleString();
}

function getNovelPriorityScore(novel: HomeNovelItem): number {
  const task = novel.latestAutoDirectorTask ?? null;
  if (canContinueFront10AutoExecution(task)) {
    return 0;
  }
  if (canContinueDirector(task)) {
    return 1;
  }
  if (task?.status === "running" || task?.status === "queued") {
    return 2;
  }
  if (canEnterChapterExecution(task)) {
    return 3;
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return 4;
  }
  return 5;
}

function getNovelLeadSummary(novel: HomeNovelItem): string {
  const workflowDescription = getWorkflowDescription(novel.latestAutoDirectorTask ?? null);
  if (workflowDescription) {
    return workflowDescription;
  }
  if (novel.description?.trim()) {
    return novel.description.trim();
  }
  if (novel.world?.name) {
    return `当前项目已绑定世界观「${novel.world.name}」，可以直接继续创作。`;
  }
  return "当前项目暂无简介，可以直接进入编辑页继续推进。";
}

function MetricCard(props: {
  title: string;
  value: string | number;
  hint: string;
  pending?: boolean;
}) {
  const { title, value, hint, pending = false } = props;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{pending ? "--" : value}</CardTitle>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardHeader>
    </Card>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.list("home"),
    queryFn: () => listTasks({ limit: 80 }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data?.items ?? [];
      return rows.some((item) => item.status === "queued" || item.status === "running") ? 4000 : false;
    },
  });

  const novelQuery = useQuery({
    queryKey: queryKeys.novels.list(1, HOME_NOVEL_FETCH_LIMIT),
    queryFn: () => getNovelList({ page: 1, limit: HOME_NOVEL_FETCH_LIMIT }),
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      mode?: "auto_execute_front10";
    }) => continueNovelWorkflow(input.taskId, input.mode ? { continuationMode: input.mode } : undefined),
    onSuccess: async (_response, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
      toast.success(input.mode === "auto_execute_front10" ? "已继续自动执行前 10 章。" : "自动导演已继续推进。");
    },
    onError: (error, input) => {
      toast.error(
        error instanceof Error
          ? error.message
          : input.mode === "auto_execute_front10"
            ? "继续自动执行前 10 章失败。"
            : "继续自动导演失败。",
      );
    },
  });

  const tasks = taskQuery.data?.data?.items ?? [];
  const allNovels = novelQuery.data?.data?.items ?? [];

  const liveWorkflowCount = useMemo(
    () => allNovels.filter((novel) => isLiveWorkflowTask(novel.latestAutoDirectorTask ?? null)).length,
    [allNovels],
  );
  const actionRequiredCount = useMemo(
    () => allNovels.filter((novel) => isWorkflowActionRequired(novel.latestAutoDirectorTask ?? null)).length,
    [allNovels],
  );
  const readyForExecutionCount = useMemo(
    () => allNovels.filter((novel) => canEnterChapterExecution(novel.latestAutoDirectorTask ?? null)).length,
    [allNovels],
  );
  const failedTaskCount = useMemo(
    () => tasks.filter((item) => item.status === "failed").length,
    [tasks],
  );
  const primaryNovel = useMemo(() => {
    if (allNovels.length === 0) {
      return null;
    }
    return allNovels.reduce<HomeNovelItem | null>((selected, current) => {
      if (!selected) {
        return current;
      }
      const selectedPriority = getNovelPriorityScore(selected);
      const currentPriority = getNovelPriorityScore(current);
      return currentPriority < selectedPriority ? current : selected;
    }, null);
  }, [allNovels]);
  const recentNovels = useMemo(
    () => allNovels.slice(0, HOME_RECENT_LIMIT),
    [allNovels],
  );

  const stopCardClick = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const openNovelEditor = (novelId: string) => {
    navigate(`/novels/${novelId}/edit`);
  };

  const renderNovelPrimaryAction = (
    novel: HomeNovelItem,
    options?: {
      size?: "default" | "sm" | "lg";
      stopPropagation?: boolean;
    },
  ) => {
    const { size = "sm", stopPropagation = false } = options ?? {};
    const task = novel.latestAutoDirectorTask ?? null;
    const isWorkflowPending = continueWorkflowMutation.isPending
      && continueWorkflowMutation.variables?.taskId === task?.id;

    const handleActionClick = (event: MouseEvent<HTMLElement>) => {
      if (stopPropagation) {
        stopCardClick(event);
      }
    };

    if (canContinueFront10AutoExecution(task)) {
      return (
        <Button
          size={size}
          onClick={(event) => {
            handleActionClick(event);
            if (!task) {
              return;
            }
            continueWorkflowMutation.mutate({
              taskId: task.id,
              mode: "auto_execute_front10",
            });
          }}
          disabled={isWorkflowPending}
        >
          {isWorkflowPending ? "继续执行中..." : "继续自动执行前 10 章"}
        </Button>
      );
    }

    if (canContinueDirector(task)) {
      return (
        <Button
          size={size}
          onClick={(event) => {
            handleActionClick(event);
            if (!task) {
              return;
            }
            continueWorkflowMutation.mutate({
              taskId: task.id,
            });
          }}
          disabled={isWorkflowPending}
        >
          {isWorkflowPending ? "继续中..." : "继续导演"}
        </Button>
      );
    }

    if (canEnterChapterExecution(task)) {
      return (
        <Button asChild size={size}>
          <Link
            to={`/novels/${novel.id}/edit`}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            进入章节执行
          </Link>
        </Button>
      );
    }

    if (task) {
      return (
        <Button asChild size={size}>
          <Link
            to={getTaskCenterLink(task.id)}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            查看任务
          </Link>
        </Button>
      );
    }

    return (
      <Button asChild size={size}>
        <Link
          to={`/novels/${novel.id}/edit`}
          onClick={stopPropagation ? stopCardClick : undefined}
        >
          编辑小说
        </Link>
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="自动推进中"
          value={liveWorkflowCount}
          hint="当前仍在后台推进中的自动导演或自动执行项目。"
          pending={novelQuery.isPending}
        />
        <MetricCard
          title="待你处理"
          value={actionRequiredCount}
          hint="等待审核、失败或已取消后需要你决定下一步的项目。"
          pending={novelQuery.isPending}
        />
        <MetricCard
          title="可进入章节执行"
          value={readyForExecutionCount}
          hint="已经准备到可开写阶段，可以直接进入章节写作。"
          pending={novelQuery.isPending}
        />
        <MetricCard
          title="后台失败任务"
          value={failedTaskCount}
          hint="来自任务中心的失败任务总数，可后续集中处理。"
          pending={taskQuery.isPending}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>继续最近项目</CardTitle>
          <CardDescription>首页应该直接把你送回当前最值得继续的一本书。</CardDescription>
        </CardHeader>
        <CardContent>
          {novelQuery.isPending ? (
            <div className="space-y-4">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-5 w-full animate-pulse rounded bg-muted" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="flex gap-2">
                <div className="h-10 w-36 animate-pulse rounded bg-muted" />
                <div className="h-10 w-28 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ) : novelQuery.isError ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                当前无法读取项目列表，首页没法为你推荐下一步入口。
              </div>
              <Button onClick={() => void novelQuery.refetch()}>重新加载项目</Button>
            </div>
          ) : primaryNovel ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3">
                  <div>
                    <div className="text-2xl font-semibold">{primaryNovel.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {primaryNovel.latestAutoDirectorTask ? (
                        <>
                          {(() => {
                            const workflowBadge = getWorkflowBadge(primaryNovel.latestAutoDirectorTask);
                            return workflowBadge ? (
                              <Badge variant={workflowBadge.variant}>
                                {workflowBadge.label}
                              </Badge>
                            ) : null;
                          })()}
                          <Badge variant="outline">
                            进度 {Math.round((primaryNovel.latestAutoDirectorTask.progress ?? 0) * 100)}%
                          </Badge>
                        </>
                      ) : null}
                      <Badge variant={primaryNovel.status === "published" ? "default" : "secondary"}>
                        {primaryNovel.status === "published" ? "已发布" : "草稿"}
                      </Badge>
                      <Badge variant="outline">
                        {primaryNovel.writingMode === "continuation" ? "续写" : "原创"}
                      </Badge>
                    </div>
                  </div>
                  <div className="max-w-3xl text-sm text-muted-foreground">
                    {getNovelLeadSummary(primaryNovel)}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>更新时间：{formatDate(primaryNovel.updatedAt)}</span>
                    <span>章节数：{primaryNovel._count.chapters}</span>
                    <span>角色数：{primaryNovel._count.characters}</span>
                    {primaryNovel.latestAutoDirectorTask?.currentStage ? (
                      <span>当前阶段：{primaryNovel.latestAutoDirectorTask.currentStage}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {renderNovelPrimaryAction(primaryNovel, { size: "lg" })}
                  {primaryNovel.latestAutoDirectorTask ? (
                    <Button asChild size="lg" variant="outline">
                      <Link to={getTaskCenterLink(primaryNovel.latestAutoDirectorTask.id)}>任务中心</Link>
                    </Button>
                  ) : (
                    <Button asChild size="lg" variant="outline">
                      <Link to={`/novels/${primaryNovel.id}/edit`}>打开项目</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                你还没有开始小说项目，首页会在你创建第一本书后自动显示最合适的继续入口。
              </div>
              <Button asChild>
                <Link to="/novels/create">开始创建小说</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
          <CardDescription>从首页直接进入高频入口。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/novels/create">新建小说</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/book-analysis">新建拆书</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/tasks">打开任务中心</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近项目</CardTitle>
          <CardDescription>这里不只显示标题，也直接显示当前所处阶段和恢复入口。</CardDescription>
        </CardHeader>
        <CardContent>
          {novelQuery.isPending ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`home-loading-${index}`} className="space-y-3 rounded-xl border p-4">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-20 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : novelQuery.isError ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                当前无法加载最近项目，稍后可以重试。
              </div>
              <Button variant="outline" onClick={() => void novelQuery.refetch()}>重新加载</Button>
            </div>
          ) : recentNovels.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              暂无小说项目，先从“新建小说”开始。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recentNovels.map((novel) => {
                const workflowTask = novel.latestAutoDirectorTask ?? null;
                const workflowBadge = getWorkflowBadge(workflowTask);

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
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-2">
                          <CardTitle className="line-clamp-1 text-lg">{novel.title}</CardTitle>
                          <div className="flex flex-wrap items-center gap-2">
                            {workflowBadge ? (
                              <Badge variant={workflowBadge.variant}>{workflowBadge.label}</Badge>
                            ) : (
                              <Badge variant="outline">无自动导演任务</Badge>
                            )}
                            {workflowTask ? (
                              <Badge variant="outline">进度 {Math.round(workflowTask.progress * 100)}%</Badge>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                            {novel.status === "published" ? "已发布" : "草稿"}
                          </Badge>
                          <Badge variant="outline">
                            {novel.writingMode === "continuation" ? "续写" : "原创"}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription className="line-clamp-3">
                        {getNovelLeadSummary(novel)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>更新时间：{formatDate(novel.updatedAt)}</span>
                        <span>章节数：{novel._count.chapters}</span>
                        <span>角色数：{novel._count.characters}</span>
                        {workflowTask?.currentStage ? (
                          <span>阶段：{workflowTask.currentStage}</span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {renderNovelPrimaryAction(novel, { stopPropagation: true })}
                        {workflowTask ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={getTaskCenterLink(workflowTask.id)} onClick={stopCardClick}>任务中心</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/novels/${novel.id}/edit`} onClick={stopCardClick}>打开项目</Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
