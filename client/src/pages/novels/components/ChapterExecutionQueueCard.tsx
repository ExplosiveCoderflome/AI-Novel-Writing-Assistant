import type { Chapter } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  chapterStatusLabel,
  chapterSuggestedActionLabel,
  generationStateLabel,
  parseRiskFlags,
  shouldShowGenerationStateBadge,
  type QueueFilterKey,
  type QueueFilterOption,
} from "./chapterExecution.shared";

interface ChapterExecutionQueueCardProps {
  chapters: Chapter[];
  selectedChapterId: string;
  queueFilter: QueueFilterKey;
  queueFilters: QueueFilterOption[];
  onQueueFilterChange: (filter: QueueFilterKey) => void;
  onSelectChapter: (chapterId: string) => void;
}

export default function ChapterExecutionQueueCard(props: ChapterExecutionQueueCardProps) {
  const {
    chapters,
    selectedChapterId,
    queueFilter,
    queueFilters,
    onQueueFilterChange,
    onSelectChapter,
  } = props;

  return (
    <Card className="self-start lg:sticky lg:top-4">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div>
            <CardTitle className="text-base">章节导航</CardTitle>
            <div className="text-sm text-muted-foreground">左侧只负责切章和切队列，不再挤占正文区。</div>
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
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="max-h-[calc(100vh-240px)] space-y-2 overflow-y-auto pr-1">
          {chapters.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              当前筛选下没有章节。
            </div>
          ) : (
            chapters.map((chapter) => {
              const chapterRisks = parseRiskFlags(chapter.riskFlags);
              const isSelected = selectedChapterId === chapter.id;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => onSelectChapter(chapter.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">第{chapter.order}章：{chapter.title || "未命名章节"}</div>
                      <div className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                        {chapter.expectation || chapter.taskSheet || chapter.sceneCards || "这章还没有明确目标，适合先补章节计划。"}
                      </div>
                    </div>
                    <Badge
                      variant={isSelected ? "default" : "outline"}
                      className="min-w-[54px] shrink-0 justify-center whitespace-nowrap rounded-full px-2 py-1 text-[11px]"
                    >
                      {chapterStatusLabel(chapter.chapterStatus)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>下一步：{chapterSuggestedActionLabel(chapter)}</span>
                    <span>字数：{chapter.content?.length ?? 0}</span>
                    {shouldShowGenerationStateBadge(chapter.generationState) ? (
                      <Badge variant="outline" className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px]">
                        {generationStateLabel(chapter.generationState)}
                      </Badge>
                    ) : null}
                  </div>
                  {chapterRisks.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {chapterRisks.slice(0, 2).map((risk) => (
                        <Badge key={`${chapter.id}-${risk}`} variant="secondary" className="whitespace-nowrap rounded-full px-2 py-1 text-[11px]">
                          {risk}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
