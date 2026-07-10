import type { KeyboardEvent, MouseEvent } from "react";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  Compass,
  Gauge,
  HelpCircle,
  Layers3,
  MapPinned,
  PenLine,
  PlayCircle,
  RadioTower,
  Rocket,
  Route,
  Sparkles,
  Timer,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import { getNovelList } from "@/api/novel";
import type { NovelListResponse } from "@/api/novel/shared";
import { queryKeys } from "@/api/queryKeys";
import { getTaskOverview } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canContinueDirector,
  canContinueChapterBatchAutoExecution,
  canEnterChapterExecution,
  getCandidateSelectionLink,
  getWorkflowBadge,
  getWorkflowDescription,
  isWorkflowRunningInBackground,
  isWorkflowActionRequired,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";
import { toast } from "@/components/ui/toast";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";

const HOME_NOVEL_FETCH_LIMIT = 12;
const HOME_RECENT_LIMIT = 6;
const DIRECTOR_CREATE_LINK = "/novels/create?mode=director";
const MANUAL_CREATE_LINK = "/novels/create";

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
  if (canContinueChapterBatchAutoExecution(task)) {
    return 0;
  }
  if (requiresCandidateSelection(task)) {
    return 1;
  }
  if (canContinueDirector(task)) {
    return 2;
  }
  if (task?.status === "running" || task?.status === "queued") {
    return 3;
  }
  if (canEnterChapterExecution(task)) {
    return 4;
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return 5;
  }
  return 6;
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
  icon: typeof Activity;
  tone: string;
  pending?: boolean;
}) {
  const { title, value, hint, icon: Icon, tone, pending = false } = props;
  return (
    <Card className="home-metric-card overflow-hidden border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="relative space-y-4 pb-5">
        <div className={`absolute right-0 top-0 h-20 w-20 rounded-bl-full ${tone}`} aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-lg border bg-background p-2 shadow-sm ring-1 ring-primary/5">
            <Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
          </div>
          <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
          <div className="mt-2 flex items-end gap-2">
            <CardTitle className="text-3xl tabular-nums">{pending ? "--" : value}</CardTitle>
            <div className="pb-1 text-xs text-muted-foreground">项</div>
          </div>
        </div>
        <div className="min-h-8 text-xs leading-relaxed text-muted-foreground">{hint}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full w-2/3 rounded-full ${tone}`} />
        </div>
      </CardHeader>
    </Card>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const novelQuery = useQuery({
    queryKey: queryKeys.novels.list(1, HOME_NOVEL_FETCH_LIMIT),
    queryFn: () => getNovelList({ page: 1, limit: HOME_NOVEL_FETCH_LIMIT }),
    staleTime: 30_000,
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: async (input: {
      taskId: string;
      mode?: "resume" | "auto_execute_range";
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

  const allNovels = novelQuery.data?.data?.items ?? [];
  const hasNovels = allNovels.length > 0;

  const liveWorkflowCount = useMemo(
    () => allNovels.filter((novel) => isWorkflowRunningInBackground(novel.latestAutoDirectorTask ?? null)).length,
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
    () => taskQuery.data?.data?.failedCount ?? 0,
    [taskQuery.data?.data?.failedCount],
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

    if (canContinueChapterBatchAutoExecution(task)) {
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
              mode: "auto_execute_range",
            });
          }}
          disabled={isWorkflowPending}
        >
          {isWorkflowPending ? "继续执行中..." : (task?.resumeAction ?? `继续自动执行${task?.executionScopeLabel ?? "当前章节范围"}`)}
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
          {isWorkflowPending ? "继续中..." : (task?.resumeAction ?? "继续导演")}
        </Button>
      );
    }

    if (requiresCandidateSelection(task)) {
      return (
        <Button asChild size={size}>
          <Link
            to={getCandidateSelectionLink(task!.id)}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            {task!.resumeAction ?? "继续确认书级方向"}
          </Link>
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
            to={`/novels/${novel.id}/edit?directorTaskId=${task.id}`}
            onClick={stopPropagation ? stopCardClick : undefined}
          >
            查看推进状态
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
    <div className="space-y-6">
      <section className="novel-console-panel overflow-hidden rounded-xl border">
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)] lg:p-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1.5">
                <RadioTower className="h-3.5 w-3.5" aria-hidden="true" />
                创作总控台
              </Badge>
              <Badge variant="outline" className="gap-1.5 bg-background/70">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                最近 {HOME_NOVEL_FETCH_LIMIT} 个项目
              </Badge>
            </div>
            <div className="max-w-4xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                宫寒创作驾驶舱
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                把自动导演、章节执行、待确认节点和后台任务收束到一个起飞面板。打开首页就知道：哪本书最该继续，哪些队列正在推进，下一步按钮在哪里。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg" className="gap-2">
                <Link to={DIRECTOR_CREATE_LINK}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  一句灵感开书
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 bg-background/70">
                <Link to={MANUAL_CREATE_LINK}>
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                  手动创建
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2 bg-background/70">
                <Link to="/help">
                  <HelpCircle className="h-4 w-4" aria-hidden="true" />
                  查看指南
                </Link>
              </Button>
            </div>
          </div>

          <div className="home-flight-map rounded-xl border bg-background/85 p-4 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
                  新手起飞入口
                </div>
                <div className="text-xs text-muted-foreground">
                  {hasNovels ? "给下一本书快速搭建方向。" : "从一个想法开始生成可推进项目。"}
                </div>
              </div>
              <Rocket className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="space-y-3">
              {[
                ["01", "灵感", "一句模糊想法"],
                ["02", "定盘", "方向、标题和卖点"],
                ["03", "开写", "章节任务与执行链"],
              ].map(([marker, title, text]) => (
                <div className="home-flight-step" key={marker}>
                  <div className="home-flight-marker">{marker}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="truncate text-xs text-muted-foreground">{text}</div>
                  </div>
                </div>
              ))}
              <div className="mt-4 rounded-lg border border-dashed bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                关键阶段会停下来等你确认，适合先搭骨架再精修；也可以手动创建，直接进入传统编辑流程。
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-status-summary-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="推进雷达"
          value={liveWorkflowCount}
          hint="最近项目中仍在后台推进的自动导演或自动执行项目。"
          icon={RadioTower}
          tone="bg-emerald-500/20"
          pending={novelQuery.isPending}
        />
        <MetricCard
          title="待决信号"
          value={actionRequiredCount}
          hint="最近项目里等待审核、失败或已取消后需要你决定下一步的项目。"
          icon={AlertTriangle}
          tone="bg-amber-500/20"
          pending={novelQuery.isPending}
        />
        <MetricCard
          title="开写就绪"
          value={readyForExecutionCount}
          hint="最近项目里准备到可开写阶段，可以直接进入章节写作。"
          icon={CheckCircle2}
          tone="bg-sky-500/20"
          pending={novelQuery.isPending}
        />
        <MetricCard
          title="故障记录"
          value={failedTaskCount}
          hint="来自任务中心的失败任务总数，可后续集中处理。"
          icon={Activity}
          tone="bg-rose-500/20"
          pending={taskQuery.isPending}
        />
      </section>

      <Card className="overflow-hidden border-primary/30 bg-card shadow-sm">
        <CardHeader className="border-b bg-muted/40">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5">
              <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
              下一步行动
            </Badge>
            <Badge variant="outline" className="bg-background">
              系统按当前工作流状态推荐
            </Badge>
          </div>
          <CardTitle className="text-2xl">主推进项目</CardTitle>
          <CardDescription>首页优先把你送回当前最值得继续的一本书。</CardDescription>
        </CardHeader>
        <CardContent className="p-5">
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
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                      当前锁定
                    </div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight">{primaryNovel.title}</div>
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
                  <div className="max-w-3xl rounded-lg border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
                    {getNovelLeadSummary(primaryNovel)}
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                    <span className="rounded-md bg-muted/50 px-2.5 py-2">更新时间：{formatDate(primaryNovel.updatedAt)}</span>
                    <span className="rounded-md bg-muted/50 px-2.5 py-2">章节数：{primaryNovel._count.chapters}</span>
                    <span className="rounded-md bg-muted/50 px-2.5 py-2">角色数：{primaryNovel._count.characters}</span>
                    {primaryNovel.latestAutoDirectorTask?.currentStage ? (
                      <span className="rounded-md bg-muted/50 px-2.5 py-2">当前阶段：{primaryNovel.latestAutoDirectorTask.currentStage}</span>
                    ) : null}
                    {primaryNovel.latestAutoDirectorTask?.lastHealthyStage ? (
                      <span className="rounded-md bg-muted/50 px-2.5 py-2">最近健康阶段：{primaryNovel.latestAutoDirectorTask.lastHealthyStage}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-4 rounded-xl border bg-muted/30 p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
                    推荐操作
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    根据导演任务、候选确认、章节执行和失败状态自动判定，不改变原有优先级规则。
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {renderNovelPrimaryAction(primaryNovel, { size: "lg" })}
                  {primaryNovel.latestAutoDirectorTask ? (
                    <Button asChild size="lg" variant="outline">
                      <Link to={`/novels/${primaryNovel.id}/edit?directorTaskId=${primaryNovel.latestAutoDirectorTask.id}&taskPanel=1`}>执行详情</Link>
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
                你还没有开始小说项目。第一次使用时，推荐直接走 AI 自动导演，它会先帮你搭好方向和开写准备。
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={DIRECTOR_CREATE_LINK}>AI 自动导演开书</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/help">新手上路</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
                创作队列
              </CardTitle>
              <CardDescription className="mt-1">
                按最近项目展示阶段、健康状态和恢复入口，像队列一样快速扫读。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="gap-2 bg-background/70">
                <Link to="/book-analysis">
                  <Layers3 className="h-4 w-4" aria-hidden="true" />
                  新建拆书
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2 bg-background/70">
                <Link to="/tasks">
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  后台任务
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {novelQuery.isPending ? (
            <div className="grid gap-0 divide-y">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`home-loading-${index}`} className="space-y-3 p-4">
                  <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-12 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : novelQuery.isError ? (
            <div className="space-y-3 p-5">
              <div className="text-sm text-muted-foreground">
                当前无法加载最近项目，稍后可以重试。
              </div>
              <Button variant="outline" onClick={() => void novelQuery.refetch()}>重新加载</Button>
            </div>
          ) : recentNovels.length === 0 ? (
            <div className="m-5 rounded-xl border border-dashed bg-muted/20 p-5">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <Rocket className="h-4 w-4 text-primary" aria-hidden="true" />
                还没有创作队列
              </div>
              <div className="mb-4 text-sm text-muted-foreground">
                从一句灵感开书、手动创建，或先查看指南，都可以把第一本书送上队列。
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={DIRECTOR_CREATE_LINK}>一句灵感开书</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={MANUAL_CREATE_LINK}>手动创建</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/help">查看指南</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {recentNovels.map((novel, index) => {
                const workflowTask = novel.latestAutoDirectorTask ?? null;
                const workflowBadge = getWorkflowBadge(workflowTask);

                return (
                  <div
                    key={novel.id}
                    role="link"
                    tabIndex={0}
                    className="home-queue-row grid cursor-pointer gap-4 p-4 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring lg:grid-cols-[64px_minmax(0,1fr)_280px]"
                    onClick={() => openNovelEditor(novel.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openNovelEditor(novel.id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3 lg:block">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background text-sm font-semibold tabular-nums shadow-sm">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground lg:mt-2">
                        <Route className="h-3 w-3" aria-hidden="true" />
                        QUEUE
                      </div>
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1 text-lg font-semibold">
                          <span className="line-clamp-1">{novel.title}</span>
                        </div>
                        <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                          {novel.status === "published" ? "已发布" : "草稿"}
                        </Badge>
                        <Badge variant="outline">
                          {novel.writingMode === "continuation" ? "续写" : "原创"}
                        </Badge>
                      </div>
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
                      <div className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {getNovelLeadSummary(novel)}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>更新时间：{formatDate(novel.updatedAt)}</span>
                        <span>章节数：{novel._count.chapters}</span>
                        <span>角色数：{novel._count.characters}</span>
                        {workflowTask?.currentStage ? (
                          <span>阶段：{workflowTask.currentStage}</span>
                        ) : null}
                        {workflowTask?.lastHealthyStage ? (
                          <span>最近健康阶段：{workflowTask.lastHealthyStage}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col justify-center gap-2 lg:items-stretch">
                      <div className="hidden items-center justify-end gap-2 text-xs text-muted-foreground lg:flex">
                        <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
                        继续入口
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {renderNovelPrimaryAction(novel, { stopPropagation: true })}
                        {workflowTask ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/novels/${novel.id}/edit?directorTaskId=${workflowTask.id}&taskPanel=1`} onClick={stopCardClick}>执行详情</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/novels/${novel.id}/edit`} onClick={stopCardClick}>打开项目</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
