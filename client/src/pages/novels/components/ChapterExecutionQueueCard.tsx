import type { Chapter } from "@ai-novel/shared/types/novel";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  chapterStatusDescription,
  chapterStatusLabel,
  chapterSuggestedActionLabel,
  canRemoveEmptyManualChapter,
  parseRiskFlags,
  resolveChapterQueuePreview,
  resolveDisplayedChapterStatus,
  type QueueFilterKey,
  type QueueFilterOption,
} from "./chapterExecution.shared";

interface ChapterExecutionQueueCardProps {
  chapters: Chapter[];
  selectedChapterId: string;
  queueFilter: QueueFilterKey;
  queueFilters: QueueFilterOption[];
  streamingChapterId?: string | null;
  streamingPhase?: "streaming" | "finalizing" | "completed" | null;
  repairStreamingChapterId?: string | null;
  onQueueFilterChange: (filter: QueueFilterKey) => void;
  onSelectChapter: (chapterId: string) => void;
  onRemoveChapter: (chapter: Chapter) => void;
  removingChapterId?: string | null;
}

export default function ChapterExecutionQueueCard(props: ChapterExecutionQueueCardProps) {
  const {
    chapters,
    selectedChapterId,
    queueFilter,
    queueFilters,
    streamingChapterId,
    streamingPhase,
    repairStreamingChapterId,
    onQueueFilterChange,
    onSelectChapter,
    onRemoveChapter,
    removingChapterId,
  } = props;

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/70 lg:sticky lg:top-4">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/30 to-background pb-4">
        <div className="space-y-1">
          <CardTitle className="text-base">章节队列</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            左侧只负责切章和查看推进状态，把正文阅读区完整留给中间的主写作面板。
          </p>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>当前可见 {chapters.length} 章</span>
          <span>筛选：{queueFilters.find((item) => item.key === queueFilter)?.label ?? "全部"}</span>
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {queueFilters.map((filter) => (
              <Button
                key={filter.key}
                size="sm"
                variant={queueFilter === filter.key ? "default" : "outline"}
                className="h-8 shrink-0 rounded-full px-3 text-xs"
                onClick={() => onQueueFilterChange(filter.key)}
              >
                {filter.label} {filter.count}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col pb-4 pt-4">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {chapters.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-xs leading-6 text-muted-foreground">
              当前筛选下还没有章节。
            </div>
          ) : (
            chapters.map((chapter) => {
              const chapterRisks = parseRiskFlags(chapter.riskFlags);
              const isSelected = selectedChapterId === chapter.id;
              const isStreamingTarget = streamingChapterId === chapter.id;
              const isRepairTarget = repairStreamingChapterId === chapter.id;
              const displayedStatus = resolveDisplayedChapterStatus(chapter);
              const canRemove = canRemoveEmptyManualChapter(chapter);
              const isRemoving = removingChapterId === chapter.id;

              return (
                <div
                  key={chapter.id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/35"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChapter(chapter.id)}
                    className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="text-sm font-semibold leading-6 text-foreground">
                          第{chapter.order}章 {chapter.title || "未命名章节"}
                        </div>
                        <div className="line-clamp-2 text-xs leading-6 text-muted-foreground">
                          {resolveChapterQueuePreview(chapter)}
                        </div>
                      </div>
                      <Badge
                        variant={isSelected ? "default" : "outline"}
                        className="min-w-[60px] shrink-0 justify-center rounded-full px-2 py-1 text-[11px]"
                        title={chapterStatusDescription(displayedStatus)}
                        aria-label={chapterStatusDescription(displayedStatus)}
                      >
                        {chapterStatusLabel(displayedStatus)}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {isStreamingTarget ? (
                        <Badge className="rounded-full px-2 py-1 text-[11px]">
                          {streamingPhase === "finalizing" ? "收尾中" : "写作中"}
                        </Badge>
                      ) : null}
                      {isRepairTarget ? (
                        <Badge variant="secondary" className="rounded-full px-2 py-1 text-[11px]">
                          修复中
                        </Badge>
                      ) : null}
                      {chapterRisks.slice(0, 2).map((risk) => (
                        <Badge key={`${chapter.id}-${risk}`} variant="secondary" className="rounded-full px-2 py-1 text-[11px]">
                          {risk}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/25 p-3 text-[11px] text-muted-foreground">
                      <div>
                        <div>下一步</div>
                        <div className="mt-1 font-medium text-foreground">{chapterSuggestedActionLabel(chapter)}</div>
                      </div>
                      <div>
                        <div>当前字数</div>
                        <div className="mt-1 font-medium text-foreground">{chapter.content?.length ?? 0}</div>
                      </div>
                    </div>
                  </button>
                  {canRemove ? (
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-3 h-8 w-full justify-center text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={isRemoving}
                        onClick={() => onRemoveChapter(chapter)}
                      >
                        <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                        {isRemoving ? "正在移除..." : "移除空白章节"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
