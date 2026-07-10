import type { ReactNode } from "react";
import { ArrowRight, BookOpenText, Loader2, PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getWorkflowBadge } from "@/lib/novelWorkflowTaskUi";
import {
  DIRECTOR_CREATE_LINK,
  formatHomeDate,
  type HomeNextAction,
  MANUAL_CREATE_LINK,
  type HomeNovelItem,
} from "../homeViewModel";
import { toneBorderClass, toneSurfaceClass, toneTextClass } from "./homeTone";

export type RenderNovelPrimaryAction = (
  novel: HomeNovelItem,
  options?: {
    size?: "default" | "sm" | "lg";
    stopPropagation?: boolean;
  },
) => ReactNode;

export function HomeNextActionPanel(props: {
  action: HomeNextAction;
  primaryNovel: HomeNovelItem | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  renderNovelPrimaryAction: RenderNovelPrimaryAction;
}) {
  if (props.loading) {
    return (
      <Card className="home-next-action-panel overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在整理首页推荐动作...
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-full animate-pulse rounded bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.error) {
    return (
      <Card className="home-next-action-panel border-destructive/35">
        <CardContent className="space-y-4 p-6">
          <Badge variant="destructive">首页无法读取项目</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">无法判断下一步</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              当前无法读取小说项目，首页不能为你推荐继续入口。重新加载后可以恢复推荐动作。
            </p>
          </div>
          <Button onClick={props.onRetry}>重新加载项目</Button>
        </CardContent>
      </Card>
    );
  }

  if (props.action.kind === "starter" || !props.primaryNovel) {
    return (
      <Card className={cn("home-next-action-panel overflow-hidden", toneBorderClass(props.action.tone), toneSurfaceClass(props.action.tone))}>
        <CardContent className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0 space-y-4">
            <Badge variant="outline" className={toneTextClass(props.action.tone)}>
              {props.action.eyebrow}
            </Badge>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">{props.action.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{props.action.description}</p>
            </div>
            <div className="rounded-lg border bg-background/80 p-3 text-sm leading-6 text-muted-foreground">
              {props.action.reason}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-64 lg:grid-cols-1">
            <Button asChild size="lg">
              <Link to={DIRECTOR_CREATE_LINK}>
                <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                AI 自动导演开书
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/help">新手上路</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const novel = props.primaryNovel;
  const task = novel.latestAutoDirectorTask ?? null;
  const workflowBadge = getWorkflowBadge(task);

  return (
    <Card className={cn("home-next-action-panel overflow-hidden", toneBorderClass(props.action.tone), toneSurfaceClass(props.action.tone))}>
      <CardContent className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={toneTextClass(props.action.tone)}>
              {props.action.eyebrow}
            </Badge>
            {workflowBadge ? (
              <Badge variant={workflowBadge.variant}>{workflowBadge.label}</Badge>
            ) : null}
            <Badge variant={novel.status === "published" ? "default" : "secondary"}>
              {novel.status === "published" ? "发布态" : "草稿"}
            </Badge>
            <Badge variant="outline">{novel.writingMode === "continuation" ? "续写" : "原创"}</Badge>
          </div>

          <div>
            <h1 className="break-words text-2xl font-semibold tracking-normal sm:text-3xl">
              {props.action.title}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{props.action.description}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
            <div className="rounded-lg border bg-background/80 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <ArrowRight className={cn("h-4 w-4", toneTextClass(props.action.tone))} aria-hidden="true" />
                推荐原因
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{props.action.reason}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4 lg:grid-cols-2">
              <div className="rounded-lg border bg-background/70 p-3">
                <div>章节</div>
                <div className="mt-1 text-base font-semibold text-foreground">{novel._count.chapters}</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div>角色</div>
                <div className="mt-1 text-base font-semibold text-foreground">{novel._count.characters}</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div>世界观</div>
                <div className="mt-1 truncate text-base font-semibold text-foreground">{novel.world?.name ?? "未绑定"}</div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div>更新</div>
                <div className="mt-1 truncate text-base font-semibold text-foreground">{formatHomeDate(novel.updatedAt)}</div>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-lg border bg-background/85 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BookOpenText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            当前项目
          </div>
          <div>
            <div className="line-clamp-2 text-lg font-semibold">{novel.title}</div>
            {task?.currentStage ? (
              <p className="mt-2 text-xs text-muted-foreground">阶段：{task.currentStage}</p>
            ) : null}
            {task?.lastHealthyStage ? (
              <p className="mt-1 text-xs text-muted-foreground">最近健康阶段：{task.lastHealthyStage}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            {props.renderNovelPrimaryAction(novel, { size: "lg" })}
            {task ? (
              <Button asChild size="lg" variant="outline">
                <Link to={`/novels/${novel.id}/edit?directorTaskId=${task.id}&taskPanel=1`}>
                  执行详情
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline">
                <Link to={`/novels/${novel.id}/edit`}>打开项目</Link>
              </Button>
            )}
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}
