import { Link } from "react-router-dom";
import { BookCopy, BookOpenText, LayoutDashboard, Library, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DIRECTOR_CREATE_LINK,
  MANUAL_CREATE_LINK,
  PRIMARY_CREATE_LABEL,
  REFERENCE_CREATE_LABEL,
  REFERENCE_CREATE_LINK,
  SHORT_STORY_CREATE_LINK,
  type NovelListSummaryItem,
} from "./novelListViewModel";
import { toneTextClass } from "./novelListTone";

export function NovelListHeader(props: {
  page: number;
  totalPages: number;
  totalNovels: number;
  recoveryCandidateCount: number;
  summary: NovelListSummaryItem[];
  onOpenRecovery: () => void;
  view: "shelf" | "workbench";
  onViewChange: (view: "shelf" | "workbench") => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-normal">{props.view === "shelf" ? "我的书架" : "小说工作台"}</h1>
              <div className="inline-flex rounded-md bg-muted/50 p-1" role="tablist" aria-label="小说列表视图">
                <Button type="button" size="sm" variant={props.view === "shelf" ? "default" : "ghost"} onClick={() => props.onViewChange("shelf")} role="tab" aria-selected={props.view === "shelf"}>
                  <Library className="mr-1.5 h-4 w-4" aria-hidden="true" />书架
                </Button>
                <Button type="button" size="sm" variant={props.view === "workbench" ? "default" : "ghost"} onClick={() => props.onViewChange("workbench")} role="tab" aria-selected={props.view === "workbench"}>
                  <LayoutDashboard className="mr-1.5 h-4 w-4" aria-hidden="true" />工作台
                </Button>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {props.view === "shelf" ? "浏览你的作品，打开封面，继续阅读或继续创作。" : "管理正在推进的小说项目，快速判断哪些可以继续写、哪些需要先处理状态。"}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Button asChild>
            <Link to={DIRECTOR_CREATE_LINK}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {PRIMARY_CREATE_LABEL}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={REFERENCE_CREATE_LINK}>
              <BookCopy className="mr-2 h-4 w-4" aria-hidden="true" />
              {REFERENCE_CREATE_LABEL}
            </Link>
          </Button>
          {SHORT_STORY_CREATE_LINK ? (
            <Button asChild variant="outline">
              <Link to={SHORT_STORY_CREATE_LINK}>
                <BookOpenText className="mr-2 h-4 w-4" aria-hidden="true" />
                创作短篇
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to={MANUAL_CREATE_LINK}>手动创建小说</Link>
          </Button>
        </div>
      </div>

      {props.view === "workbench" ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/60 py-3 text-sm">
          <HeaderMetric label="当前" value={`第 ${props.page} / ${props.totalPages} 页`} />
          <HeaderMetric label="总数" value={`${props.totalNovels} 本`} />
          {props.summary.map((item) => (
            <HeaderMetric
              key={item.id}
              label={item.label}
              value={String(item.value)}
              valueClassName={toneTextClass(item.tone)}
            />
          ))}
          {props.recoveryCandidateCount > 0 ? (
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={props.onOpenRecovery}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              待恢复 {props.recoveryCandidateCount}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HeaderMetric(props: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-muted-foreground">{props.label}</span>
      <span className={`font-medium text-foreground ${props.valueClassName ?? ""}`}>{props.value}</span>
    </span>
  );
}
