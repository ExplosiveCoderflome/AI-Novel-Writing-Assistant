import type { KeyboardEvent, MouseEvent } from "react";
import { ArrowRight, BookOpenText } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkflowBadge } from "@/lib/novelWorkflowTaskUi";
import { cn } from "@/lib/utils";
import { formatHomeDate, type HomeNovelItem } from "../homeViewModel";
import type { RenderNovelPrimaryAction } from "./HomeNextActionPanel";

export function HomeRecentNovels(props: {
  novels: HomeNovelItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpenNovel: (novelId: string) => void;
  onStopCardClick: (event: MouseEvent<HTMLElement>) => void;
  renderNovelPrimaryAction: RenderNovelPrimaryAction;
}) {
  return (
    <Card className="home-recent-novels border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pb-4 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl tracking-normal"><BookOpenText className="h-5 w-5 text-sky-700" aria-hidden="true" />我的小说</CardTitle>
          <Button asChild size="sm" variant="ghost"><Link to="/novels">查看全部 <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {props.loading ? (
          <div className="grid gap-3">{Array.from({ length: 4 }).map((_, index) => <div key={`home-loading-${index}`} className="h-20 animate-pulse rounded-lg border bg-muted/50" />)}</div>
        ) : props.error ? (
          <div className="space-y-3"><div className="text-sm text-muted-foreground">当前无法加载小说项目。</div><Button variant="outline" onClick={props.onRetry}>重新加载</Button></div>
        ) : props.novels.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">创建小说后，这里会显示可以继续推进的作品。</div>
        ) : (
          <div className="grid gap-3">{props.novels.map((novel) => <RecentNovelRow key={novel.id} novel={novel} onOpenNovel={props.onOpenNovel} />)}</div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentNovelRow(props: { novel: HomeNovelItem; onOpenNovel: (novelId: string) => void }) {
  const workflowTask = props.novel.latestAutoDirectorTask ?? null;
  const workflowBadge = getWorkflowBadge(workflowTask);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onOpenNovel(props.novel.id); }
  };
  return (
    <div role="link" tabIndex={0} className="group cursor-pointer rounded-lg border border-border/80 bg-card px-5 py-4 transition hover:border-sky-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] focus:outline-none focus:ring-2 focus:ring-ring" onClick={() => props.onOpenNovel(props.novel.id)} onKeyDown={handleKeyDown}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="line-clamp-1 text-lg font-semibold tracking-normal">{props.novel.title}</div>
            <div className="flex flex-wrap items-center gap-2">
              {workflowBadge ? <Badge variant={workflowBadge.variant}>{workflowBadge.label}</Badge> : <Badge variant="outline">项目资料</Badge>}
              {workflowTask ? <Badge variant="outline">进度 {Math.round(workflowTask.progress * 100)}%</Badge> : null}
            </div>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-sky-700" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 border-l border-border pl-5 text-xs text-muted-foreground sm:grid-cols-4 lg:min-w-[29rem]">
          <Fact label="章节" value={String(props.novel._count.chapters)} />
          <Fact label="角色" value={String(props.novel._count.characters)} />
          <Fact label="世界观" value={props.novel.world?.name ?? "未绑定"} />
          <Fact label="更新" value={formatHomeDate(props.novel.updatedAt)} />
        </div>
      </div>
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[11px]">{props.label}</div><div className={cn("mt-0.5 truncate text-sm font-medium text-foreground", props.value === "未绑定" ? "text-amber-700" : "")}>{props.value}</div></div>;
}
