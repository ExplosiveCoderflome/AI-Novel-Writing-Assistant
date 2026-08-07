import { AlertTriangle, ArrowRight, Clock3, Loader2, ShieldAlert, Sparkles, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { Chapter } from "@ai-novel/shared/types/novel";
import type { TimelineContextForChapter, TimelineIssue } from "@ai-novel/shared/types/timeline";
import type { ChapterTimelineViewData } from "../NovelEditView.types";
import type { TimelineCheckSummary } from "./chapterInsights.types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function getTimelineCheckLabel(status: TimelineCheckSummary["status"]): string {
  if (status === "failed") {
    return "Needs repair";
  }
  if (status === "warning") {
    return "Need to review";
  }
  return "pass";
}

function getTimelineCheckTone(status: TimelineCheckSummary["status"]): string {
  if (status === "failed") {
    return "border-red-200 bg-red-50 text-red-950";
  }
  if (status === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
}

function getTimelineCheckBadgeVariant(status: TimelineCheckSummary["status"]): NonNullable<BadgeProps["variant"]> {
  if (status === "failed") {
    return "destructive";
  }
  if (status === "warning") {
    return "secondary";
  }
  return "default";
}

function formatTimelineTimeLabel(context?: TimelineContextForChapter | null): string {
  if (!context) {
    return "not set";
  }
  const parts = [
    typeof context.currentTime?.storyDayIndex === "number" ? `第${context.currentTime.storyDayIndex}天` : "",
    context.currentTime?.label?.trim() ?? "",
  ].filter(Boolean);
  return parts.join(" · ") || `第${context.currentChapterIndex}章`;
}

function formatIssueSeverity(issue: TimelineIssue): string {
  if (issue.severity === "blocking") {
    return "block";
  }
  if (issue.severity === "error") {
    return "mistake";
  }
  if (issue.severity === "warning") {
    return "remind";
  }
  return "information";
}

function TimelineItemList(props: {
  title: string;
  icon: ReactNode;
  items: Array<{ title: string; summary: string }>;
  emptyText: string;
  tone?: "default" | "warning" | "critical";
}) {
  const { title, icon, items, emptyText, tone = "default" } = props;
  const toneClass =
    tone === "critical"
      ? "border-red-200 bg-red-50/60"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/60"
        : "border-border/70 bg-background";

  return (
    <div className={cn("rounded-xl border p-3", toneClass)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {items.length > 0 ? (
        <div className="mt-2 space-y-2">
          {items.slice(0, 4).map((item) => (
            <div key={`${title}-${item.title}`} className="rounded-lg border border-border/60 bg-background/80 p-2">
              <div className="line-clamp-1 text-sm font-medium text-foreground">{item.title}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}

function TimelineCheckPanel(props: {
  timelineCheck: TimelineCheckSummary | null;
  isLoading: boolean;
  hasChapter: boolean;
}) {
  const { timelineCheck, isLoading, hasChapter } = props;
  if (isLoading && !timelineCheck) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Timeline detection reading
                        </div>
        <div className="mt-1">After switching chapters, the latest test results will be displayed here.</div>
      </div>
    );
  }

  if (!hasChapter) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
        After selecting a chapter, the chapter timeline detection results are displayed here.
                  </div>
    );
  }

  if (!timelineCheck) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
        There are no timeline check results for this chapter yet.
                  </div>
    );
  }

  return (
    <div className={cn("rounded-xl border p-3 text-sm", getTimelineCheckTone(timelineCheck.status))}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{getTimelineCheckLabel(timelineCheck.status)}</div>
        <Badge variant={getTimelineCheckBadgeVariant(timelineCheck.status)}>Fraction {Math.round(timelineCheck.score * 100)}</Badge>
      </div>
      {timelineCheck.issues.length > 0 ? (
        <div className="mt-3 space-y-2">
          {timelineCheck.issues.slice(0, 3).map((issue, index) => (
            <div key={`${issue.type}-${index}`} className="rounded-lg border border-white/40 bg-background/85 p-2 text-xs leading-5 text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[11px]">{formatIssueSeverity(issue)}</Badge>
                <span className="font-medium">{issue.message}</span>
              </div>
              {issue.suggestedFix ? <div className="mt-1 line-clamp-2 text-muted-foreground">{issue.suggestedFix}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-6 opacity-80">There are no obvious future leaks, broken hooks, or critical state conflicts in this chapter.</div>
      )}
    </div>
  );
}

export default function TimelinePanel(props: {
  selectedChapter?: Chapter;
  chapterTimeline?: ChapterTimelineViewData | null;
  isLoadingChapterTimeline?: boolean;
  chapterRuntimePackage?: ChapterRuntimePackage | null;
}) {
  const { selectedChapter, chapterTimeline, isLoadingChapterTimeline = false, chapterRuntimePackage } = props;
  const context = chapterTimeline?.context ?? null;
  const timelineCheck = (chapterTimeline?.latestReport ?? chapterRuntimePackage?.timelineCheck ?? null) as TimelineCheckSummary | null;
  const hasChapter = Boolean(selectedChapter);
  const chapterLabel = selectedChapter ? `第${selectedChapter.order}章` : "No chapter selected";
  const timeLabel = formatTimelineTimeLabel(context);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            <span>time anchor</span>
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">{timeLabel}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{chapterLabel}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            <span>Test results</span>
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {timelineCheck ? getTimelineCheckLabel(timelineCheck.status) : isLoadingChapterTimeline ? "Reading" : "Not detected"}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {timelineCheck ? `分数 ${Math.round(timelineCheck.score * 100)}` : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
          </div>
        </div>
      </div>

      {context ? (
        <>
          <TimelineItemList
            title="Previous chapter hook"
            icon={<ArrowRight className="h-4 w-4" />}
            items={context.openHooks.map((hook) => ({ title: hook.title, summary: hook.description }))}
            emptyText="There are no legacy hooks to take over."
            tone={context.openHooks.length > 0 ? "warning" : "default"}
          />
          <TimelineItemList
            title="This chapter is planned to advance"
            icon={<Sparkles className="h-4 w-4" />}
            items={context.plannedEventsThisChapter.map((event) => ({ title: event.title, summary: event.summary }))}
            emptyText="This chapter has no plans to advance."
          />
          <TimelineItemList
            title="Prohibited from occurring in advance"
            icon={<AlertTriangle className="h-4 w-4" />}
            items={context.forbiddenEvents.map((item) => ({ title: item.title, summary: item.reason }))}
            emptyText="There are no early occurrence restrictions in this chapter."
            tone={context.forbiddenEvents.length > 0 ? "critical" : "default"}
          />
          <div className="rounded-xl border border-border/70 bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <UsersRound className="h-4 w-4" />
              <span>recent key events</span>
            </div>
            {context.previousEvents.length > 0 ? (
              <div className="mt-2 space-y-2">
                {context.previousEvents.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-lg border border-border/60 bg-muted/10 p-2">
                    <div className="line-clamp-1 text-sm font-medium text-foreground">{item.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs leading-5 text-muted-foreground">No recent events to display.</div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Latest timeline detection</div>
            <TimelineCheckPanel timelineCheck={timelineCheck} isLoading={isLoadingChapterTimeline} hasChapter={hasChapter} />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
          After selecting a chapter, the time anchor of this chapter, hook of the previous chapter, plan advancement and prohibited items are displayed here.
                              </div>
      )}
    </div>
  );
}
