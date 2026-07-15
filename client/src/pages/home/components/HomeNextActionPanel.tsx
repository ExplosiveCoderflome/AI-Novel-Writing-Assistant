import type { ReactNode } from "react";
import { ArrowRight, BookOpenText, Loader2, PlusCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkflowBadge } from "@/lib/novelWorkflowTaskUi";
import {
  DIRECTOR_CREATE_LINK,
  formatHomeDate,
  type HomeNextAction,
  MANUAL_CREATE_LINK,
  type HomeNovelItem,
} from "../homeViewModel";

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
      <Card className="home-next-action-panel overflow-hidden border-0 bg-[#122033] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
        <CardContent className="p-7">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在整理你的创作工作台...
          </div>
          <div className="mt-7 space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-5 w-full animate-pulse rounded bg-white/10" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-white/10" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.error) {
    return (
      <Card className="home-next-action-panel border-destructive/35 shadow-sm">
        <CardContent className="space-y-4 p-6">
          <Badge variant="destructive">暂时无法读取项目</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">还不能为你判断下一步</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">重新加载项目后，系统会继续为你整理最合适的创作入口。</p>
          </div>
          <Button onClick={props.onRetry}>重新加载项目</Button>
        </CardContent>
      </Card>
    );
  }

  if (props.action.kind === "starter" || !props.primaryNovel) {
    return <StarterPanel action={props.action} />;
  }

  const novel = props.primaryNovel;
  const task = novel.latestAutoDirectorTask ?? null;
  const workflowBadge = getWorkflowBadge(task);

  return (
    <Card className="home-next-action-panel overflow-hidden border-0 bg-[#122033] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
      <CardContent className="grid gap-8 p-7 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-sky-200">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {props.action.eyebrow}
            </span>
            {workflowBadge ? <Badge className="border-white/15 bg-white/10 text-slate-100 hover:bg-white/10">{workflowBadge.label}</Badge> : null}
            <Badge className="border-white/15 bg-white/10 text-slate-200 hover:bg-white/10">
              {novel.status === "published" ? "发布态" : "草稿"}
            </Badge>
          </div>

          <div>
            <h1 className="break-words text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">{props.action.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{props.action.description}</p>
          </div>

          <div className="grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)]">
            <div className="border-l border-sky-300/70 pl-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-sky-100">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                为什么是现在
              </div>
              <p className="text-sm leading-6 text-slate-300">{props.action.reason}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-l border-white/10 pl-5 text-xs text-slate-400 sm:grid-cols-4 lg:grid-cols-2">
              <HeroFact label="章节" value={String(novel._count.chapters)} />
              <HeroFact label="角色" value={String(novel._count.characters)} />
              <HeroFact label="世界观" value={novel.world?.name ?? "未绑定"} />
              <HeroFact label="最近更新" value={formatHomeDate(novel.updatedAt)} />
            </div>
          </div>
        </div>

        <aside className="flex flex-col justify-between gap-7 border-l border-white/10 pl-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <BookOpenText className="h-4 w-4 text-sky-200" aria-hidden="true" />
              正在创作
            </div>
            <div className="line-clamp-2 text-xl font-semibold leading-snug">{novel.title}</div>
            {task?.currentStage ? <p className="text-sm leading-6 text-slate-300">{task.currentStage}</p> : null}
          </div>
          <div className="grid gap-2">
            <div className="[&>button]:w-full [&>button]:bg-white [&>button]:text-slate-950 [&>button:hover]:bg-slate-100">
              {props.renderNovelPrimaryAction(novel, { size: "lg" })}
            </div>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to={task ? `/novels/${novel.id}/edit?directorTaskId=${task.id}&taskPanel=1` : `/novels/${novel.id}/edit`}>
                {task ? "查看执行详情" : "打开项目"}
              </Link>
            </Button>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

function StarterPanel(props: { action: HomeNextAction }) {
  return (
    <Card className="home-next-action-panel overflow-hidden border-0 bg-[#122033] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
      <CardContent className="grid gap-7 p-7 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
        <div className="min-w-0 space-y-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-sky-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {props.action.eyebrow}
          </div>
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">{props.action.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">{props.action.description}</p>
          </div>
          <div className="border-l border-sky-300/70 pl-4 text-sm leading-6 text-slate-300">{props.action.reason}</div>
        </div>
        <div className="grid gap-2">
          <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-slate-100">
            <Link to={DIRECTOR_CREATE_LINK}><PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />让 AI 带我开始</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroFact(props: { label: string; value: string }) {
  return <div><div>{props.label}</div><div className="mt-1 truncate text-base font-semibold text-white">{props.value}</div></div>;
}
