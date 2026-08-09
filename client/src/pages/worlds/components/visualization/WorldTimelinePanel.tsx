import { useState } from "react";
import { ChevronRight, Clock3, Milestone } from "lucide-react";
import FullscreenView from "@/components/common/FullscreenView";
import { cn } from "@/lib/utils";

interface TimelineItem {
  year: string;
  event: string;
}

interface WorldTimelinePanelProps {
  items: TimelineItem[];
}

function TimelineEventCard({ item, index }: { item: TimelineItem; index: number }) {
  return (
    <article className="rounded-2xl border border-border/50 bg-background/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.year || `阶段 ${index + 1}`}</span>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">事件 {index + 1}</span>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-foreground/90">{item.event}</p>
    </article>
  );
}

export default function WorldTimelinePanel({ items }: WorldTimelinePanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const trackWidth = Math.max(920, items.length * 258);

  return (
    <FullscreenView
      title={`世界时间线 · ${items.length} 个关键阶段`}
      description="沿时间顺序阅读关键事件，观察世界局势、势力目标与冲突如何向前推进。"
      fullscreen={isFullscreen}
      onFullscreenChange={setIsFullscreen}
      toggleLabel="全屏查看时间线"
      exitLabel="退出时间线全屏"
      className="rounded-3xl border-border/35 shadow-none"
      headerClassName="bg-none px-5 py-4"
      bodyClassName="min-h-0"
      fullscreenBodyClassName="overflow-auto"
    >
      {items.length === 0 ? (
        <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-muted-foreground">
          暂无匹配的世界事件
        </div>
      ) : (
        <>
          <div
            className={cn(
              "hidden overflow-x-auto px-5 pb-5 pt-3 md:block",
              isFullscreen && "h-full min-h-[520px]",
            )}
            tabIndex={0}
            aria-label="横向世界时间线，可左右滚动"
          >
            <div className="relative" style={{ minWidth: `${trackWidth}px` }}>
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden="true">
                <ChevronRight className="absolute -right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <ol
                className={cn("relative grid", isFullscreen ? "h-[calc(100dvh-116px)] min-h-[520px]" : "h-[420px]")}
                style={{ gridTemplateColumns: `repeat(${items.length}, minmax(240px, 1fr))` }}
              >
                {items.map((item, index) => {
                  const above = index % 2 === 0;
                  return (
                    <li key={`${item.year}-${item.event}-${index}`} className="relative min-w-0">
                      <div
                        className={cn(
                          "absolute left-3 right-3",
                          above ? "bottom-[calc(50%+38px)]" : "top-[calc(50%+38px)]",
                        )}
                      >
                        <TimelineEventCard item={item} index={index} />
                        <span
                          className={cn(
                            "absolute left-1/2 h-[38px] -translate-x-1/2 border-l border-dashed border-primary/35",
                            above ? "top-full" : "bottom-full",
                          )}
                          aria-hidden="true"
                        />
                      </div>
                      <div
                        className="absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-background bg-primary text-xs font-semibold text-primary-foreground shadow-sm"
                        aria-label={`第 ${index + 1} 个事件`}
                      >
                        {index + 1}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <div className="px-5 py-5 md:hidden">
            <ol className="relative ml-4 border-l border-border pl-7" aria-label="世界时间线">
              {items.map((item, index) => (
                <li key={`${item.year}-${item.event}-${index}`} className="relative pb-5 last:pb-0">
                  <div className="absolute -left-[43px] top-4 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background bg-primary text-[11px] font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <TimelineEventCard item={item} index={index} />
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center gap-2 border-t border-border/25 px-5 py-3 text-xs text-muted-foreground">
            <Milestone className="h-3.5 w-3.5" />
            <span>事件按世界设定中的时间顺序排列{items.length > 4 ? "，可左右滚动查看全部阶段" : ""}。</span>
          </div>
        </>
      )}
    </FullscreenView>
  );
}
