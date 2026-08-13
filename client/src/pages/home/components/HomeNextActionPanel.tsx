import type { ReactNode } from "react";
import { ArrowRight, BookOpenText, Check, Circle, Loader2, PlusCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { resolveImageAssetUrl } from "@/api/images";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkflowBadge } from "@/lib/novelWorkflowTaskUi";
import { cn } from "@/lib/utils";
import {
  DIRECTOR_CREATE_LINK,
  formatHomeDate,
  type HomeNextAction,
  MANUAL_CREATE_LINK,
  SHORT_STORY_CREATE_LINK,
  getHomeNovelTask,
  type HomeNovelItem,
} from "../homeViewModel";
import { buildHomeJourney } from "../homeJourney";

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
      <Card className="home-next-action-panel overflow-hidden rounded-3xl border-border/70 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.45))] shadow-[0_24px_70px_-48px_rgba(15,23,42,0.35)]">
        <CardContent className="p-7 sm:p-9">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在整理你的创作现场...
          </div>
          <div className="mt-7 space-y-3">
            <div className="h-9 w-2/3 animate-pulse rounded-lg bg-muted" />
            <div className="h-5 w-full animate-pulse rounded bg-muted/80" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted/80" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.error) {
    return (
      <Card className="home-next-action-panel rounded-3xl border-destructive/25 bg-destructive/[0.035] shadow-sm">
        <CardContent className="space-y-4 p-7 sm:p-9">
          <Badge variant="destructive">项目读取失败</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">暂时无法整理你的创作现场</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">重新加载后，系统会继续推荐最合适的创作入口。</p>
          </div>
          <Button onClick={props.onRetry}>重新加载</Button>
        </CardContent>
      </Card>
    );
  }

  if (props.action.kind === "starter" || !props.primaryNovel) {
    return <StarterPanel action={props.action} />;
  }

  const novel = props.primaryNovel;
  const task = getHomeNovelTask(novel);
  const workflowBadge = getWorkflowBadge(task);
  const journey = buildHomeJourney(task);
  const coverUrl = novel.primaryCover?.url ? resolveImageAssetUrl(novel.primaryCover.url) : null;

  return (
    <Card className="home-next-action-panel relative overflow-hidden rounded-3xl border-border/70 bg-[linear-gradient(135deg,hsl(var(--card))_0%,hsl(var(--muted)/0.32)_62%,hsl(var(--info)/0.08)_100%)] shadow-[0_28px_80px_-52px_rgba(15,23,42,0.48)]">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-info/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-primary/[0.055] blur-3xl" aria-hidden="true" />

      <CardContent className="relative p-6 sm:p-8 xl:p-9">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-info">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                继续你的故事
              </span>
              {workflowBadge ? <Badge variant="outline" className="border-info/20 bg-background/80 text-foreground">{workflowBadge.label}</Badge> : null}
            </div>

            <div className="mt-5 max-w-4xl">
              <p className="text-sm text-muted-foreground">正在创作</p>
              <h1 className="mt-1 break-words text-3xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">《{novel.title}》</h1>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-background/75 px-4 py-3.5 ring-1 ring-border/60 backdrop-blur-sm">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">{props.action.eyebrow}</div>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">{props.action.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.action.reason}</p>
                </div>
              </div>
            </div>

            <div className="mt-7" aria-label="整本创作旅程">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">整本创作旅程</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">每一步都会成为后续章节的创作依据</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums text-foreground">{journey.progressPercent}%</div>
                  <div className="text-[11px] text-muted-foreground">当前进度</div>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--info)),hsl(var(--primary)))] transition-[width]" style={{ width: `${journey.progressPercent}%` }} />
              </div>
              <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                {journey.stages.map((stage) => (
                  <li key={stage.id} className={cn(
                    "flex items-center gap-2 text-xs",
                    stage.status === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}>
                    <span className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      stage.status === "completed" && "border-primary bg-primary text-primary-foreground",
                      stage.status === "current" && "border-info bg-info/10 text-info ring-4 ring-info/10",
                      stage.status === "upcoming" && "border-border bg-background text-muted-foreground",
                    )}>
                      {stage.status === "completed" ? <Check className="h-3 w-3" aria-hidden="true" /> : <Circle className="h-2 w-2 fill-current" aria-hidden="true" />}
                    </span>
                    <span>{stage.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <aside className="flex h-full flex-col rounded-2xl border border-border/65 bg-background/80 p-4 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.5)] backdrop-blur-sm">
            <div className="flex gap-4">
              <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(155deg,hsl(var(--primary)),hsl(var(--info)))] shadow-md xl:w-28">
                {coverUrl ? (
                  <img src={coverUrl} alt={`《${novel.title}》封面`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col justify-between p-4 text-primary-foreground">
                    <BookOpenText className="h-5 w-5 opacity-75" aria-hidden="true" />
                    <div className="line-clamp-4 text-base font-semibold leading-6">{novel.title}</div>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{props.action.description}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              <div className="[&>button]:w-full">
                {props.renderNovelPrimaryAction(novel, { size: "lg" })}
              </div>
              <Button asChild variant="ghost" className="text-muted-foreground">
                <Link to={novel.narrativeForm === "short_story"
                  ? `/novels/${novel.id}/story`
                  : task ? `/novels/${novel.id}/edit?directorTaskId=${task.id}&taskPanel=1` : `/novels/${novel.id}/edit`}>
                  {novel.narrativeForm === "short_story" ? "阅读完整作品" : task ? "查看创作记录" : "打开小说工作台"}
                </Link>
              </Button>
            </div>
          </aside>
        </div>

        <div className="mt-7 grid gap-3 border-t border-border/65 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <HeroFact label="已沉淀章节" value={`${novel._count.chapters} 章`} />
          <HeroFact label="主要角色" value={`${novel._count.characters} 位`} />
          <HeroFact label="故事世界" value={novel.world?.name ?? "等待准备"} />
          <HeroFact label="最近创作" value={formatHomeDate(novel.updatedAt)} />
        </div>
      </CardContent>
    </Card>
  );
}

function StarterPanel(props: { action: HomeNextAction }) {
  return (
    <Card className="home-next-action-panel relative overflow-hidden rounded-3xl border-border/70 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--info)/0.08))] shadow-[0_28px_80px_-52px_rgba(15,23,42,0.48)]">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-info/10 blur-3xl" aria-hidden="true" />
      <CardContent className="relative grid gap-8 p-7 sm:p-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-info">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {props.action.eyebrow}
          </div>
          <div className="mt-5">
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">把一个模糊想法，写成完整故事</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{props.action.description}</p>
          </div>
          <div className="mt-6 inline-flex items-start gap-3 rounded-2xl bg-background/80 px-4 py-3 text-sm leading-6 text-muted-foreground ring-1 ring-border/60">
            <Sparkles className="mt-1 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            {props.action.reason}
          </div>
        </div>
        <div className="grid gap-2">
          <Button asChild size="lg">
            <Link to={DIRECTOR_CREATE_LINK}><PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />自动导演写长篇</Link>
          </Button>
          {SHORT_STORY_CREATE_LINK ? (
            <Button asChild size="lg" variant="secondary">
              <Link to={SHORT_STORY_CREATE_LINK}><BookOpenText className="mr-2 h-4 w-4" aria-hidden="true" />创作一篇短篇</Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant="ghost" className="text-muted-foreground">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroFact(props: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-background/55 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{props.value}</div>
    </div>
  );
}
