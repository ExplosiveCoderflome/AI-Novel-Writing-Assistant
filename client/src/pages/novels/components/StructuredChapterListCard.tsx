import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import {
  getChapterExecutionDetailStatus,
  hasChapterExecutionDetail,
} from "../chapterDetailPlanning.shared";
import {
  chapterMatchesBeat,
  formatBeatDisplayLabel,
  getBeatExpectedChapterCount,
} from "./structuredOutlineWorkspace.shared";
import type { StructuredTabViewProps } from "./NovelEditView.types";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type StructuredBeatSheet = StructuredTabViewProps["beatSheets"][number];
type StructuredBeat = StructuredBeatSheet["beats"][number];

interface StructuredChapterListCardProps {
  selectedVolume: StructuredVolume;
  selectedBeat: StructuredBeat | null;
  selectedBeatKey: string;
  selectedBeatSheet: StructuredBeatSheet | null;
  selectedVolumeChapters: StructuredChapter[];
  visibleChapters: StructuredChapter[];
  selectedChapter: StructuredChapter | null;
  draftedChapterIds: Set<string>;
  visibleRefinedChapterCount: number;
  selectedVolumeRequiredChapterCount: number;
  selectedVolumeNeedsChapterExpansion: boolean;
  isGeneratingChapterList: boolean;
  generatingChapterListVolumeId: string;
  generatingChapterListBeatKey: string;
  generatingChapterListMode: StructuredTabViewProps["generatingChapterListMode"];
  locked: boolean;
  onGenerateChapterList: StructuredTabViewProps["onGenerateChapterList"];
  onRemoveChapter: StructuredTabViewProps["onRemoveChapter"];
  onSelectBeatKey: (beatKey: string) => void;
  onSelectChapter: (chapterId: string) => void;
}

function renderChapterDetailStatusBadge(chapter: StructuredChapter) {
  const status = getChapterExecutionDetailStatus(chapter);
  if (status === "complete") {
    return <Badge variant="secondary">已细化</Badge>;
  }
  if (status === "partial") {
    return <Badge>细化中</Badge>;
  }
  return <Badge variant="outline">待细化</Badge>;
}

function isBeatGroupComplete(group: {
  expectedCount: number;
  chapters: StructuredChapter[];
}): boolean {
  if (group.expectedCount <= 0) {
    return group.chapters.length > 0;
  }
  return group.chapters.length === group.expectedCount;
}

function chapterHasDraftContent(chapter: StructuredChapter, draftedChapterIds: Set<string>): boolean {
  return Boolean(
    (chapter.chapterId && draftedChapterIds.has(chapter.chapterId))
    || draftedChapterIds.has(chapter.id),
  );
}

export default function StructuredChapterListCard(props: StructuredChapterListCardProps) {
  const {
    selectedVolume,
    selectedBeat,
    selectedBeatKey,
    selectedBeatSheet,
    selectedVolumeChapters,
    visibleChapters,
    selectedChapter,
    draftedChapterIds,
    visibleRefinedChapterCount,
    selectedVolumeRequiredChapterCount,
    selectedVolumeNeedsChapterExpansion,
    isGeneratingChapterList,
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    locked,
    onGenerateChapterList,
    onRemoveChapter,
    onSelectBeatKey,
    onSelectChapter,
  } = props;

  const isGeneratingCurrentVolume = isGeneratingChapterList && generatingChapterListVolumeId === selectedVolume.id;
  const matchedChapterIds = new Set<string>();
  const beatGroups = (selectedBeatSheet?.beats ?? []).map((beat) => {
    const chapters = selectedVolumeChapters.filter((chapter) => {
      const matches = chapterMatchesBeat(chapter, beat, selectedVolumeChapters);
      if (matches) {
        matchedChapterIds.add(chapter.id);
      }
      return matches;
    });
    return {
      key: beat.key,
      label: formatBeatDisplayLabel(beat),
      chapterSpanHint: beat.chapterSpanHint,
      expectedCount: getBeatExpectedChapterCount(beat),
      chapters,
      hasDraftContent: chapters.some((chapter) => chapterHasDraftContent(chapter, draftedChapterIds)),
      refinedCount: chapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length,
    };
  });
  const unmatchedChapters = selectedVolumeChapters.filter((chapter) => !matchedChapterIds.has(chapter.id));
  const selectedBeatGroup = selectedBeatKey === "all"
    ? null
    : beatGroups.find((group) => group.key === selectedBeatKey) ?? null;
  const nextChapterListGroup = selectedBeatGroup && !isBeatGroupComplete(selectedBeatGroup)
    ? selectedBeatGroup
    : beatGroups.find((group) => !isBeatGroupComplete(group)) ?? null;
  const isGeneratingNextChapterListGroup = Boolean(
    nextChapterListGroup
    && isGeneratingCurrentVolume
    && generatingChapterListMode === "single_beat"
    && generatingChapterListBeatKey === nextChapterListGroup.key,
  );
  const isGeneratingFullVolume = isGeneratingCurrentVolume && generatingChapterListMode === "full_volume";

  function renderBeatStatusBadge(group: typeof beatGroups[number]) {
    const isGeneratingGroup = isGeneratingCurrentVolume
      && (generatingChapterListMode === "full_volume" || generatingChapterListBeatKey === group.key);
    if (isGeneratingGroup) {
      return <Badge>生成中</Badge>;
    }
    if (group.hasDraftContent) {
      return <Badge variant="secondary">已有正文锁定</Badge>;
    }
    if (group.chapters.length === 0) {
      return <Badge variant="outline">待生成</Badge>;
    }
    if (group.expectedCount > 0 && group.chapters.length !== group.expectedCount) {
      return <Badge variant="outline">需重试</Badge>;
    }
    return <Badge variant="secondary">已生成</Badge>;
  }

  return (
    <Card className="border-border/70 bg-background/90">
      <CardHeader className="pb-3">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base leading-none">节奏 / 章节导航</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {selectedBeat
                  ? `当前聚焦「${formatBeatDisplayLabel(selectedBeat)}」。点击组头切换节奏，点击章节直接在右侧继续细化。`
                  : "按节奏分组显示章节。点击组头可聚焦该节奏，点击章节直接在右侧继续细化。"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <AiButton
                onClick={() => {
                  if (!nextChapterListGroup) {
                    return;
                  }
                  onGenerateChapterList(selectedVolume.id, {
                    generationMode: "single_beat",
                    targetBeatKey: nextChapterListGroup.key,
                  });
                }}
                disabled={isGeneratingChapterList || locked || !nextChapterListGroup}
              >
                {isGeneratingNextChapterListGroup ? "生成中..." : nextChapterListGroup ? "生成下一段章节" : "全部节奏段已生成"}
              </AiButton>
              <AiButton
                variant="outline"
                onClick={() => onGenerateChapterList(selectedVolume.id, { generationMode: "full_volume" })}
                disabled={isGeneratingChapterList || locked}
              >
                {isGeneratingFullVolume ? "整卷生成中..." : "高级：生成本卷全部章节标题"}
              </AiButton>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => onSelectBeatKey("all")}
              className={cn(
                "rounded-full border px-3 py-1.5 transition-colors",
                selectedBeatKey === "all" ? "border-primary/50 bg-primary/5 text-foreground" : "border-border/70 hover:border-primary/30",
              )}
            >
              全部节奏
            </button>
            <Badge variant="outline">显示 {visibleChapters.length}/{selectedVolumeChapters.length} 章</Badge>
            <Badge variant="outline">{visibleRefinedChapterCount}/{Math.max(visibleChapters.length, 1)} 已细化</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {selectedVolumeNeedsChapterExpansion ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
            当前卷已生成 {selectedVolumeChapters.length}/{selectedVolumeRequiredChapterCount} 章，仍有节奏段待生成。已生成章节可以先细化和开写，后续段按需继续生成。
          </div>
        ) : null}

        {selectedVolumeChapters.length > 0 ? (
          <>
            <div className="structured-chapter-navigation-list space-y-3 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:pr-1">
              {beatGroups.map((group) => {
                const active = selectedBeatKey === group.key;
                const expanded = selectedBeatKey === "all" || active;
                return (
                  <div key={group.key} className="rounded-xl border border-border/70 bg-background/80 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <button
                        type="button"
                        onClick={() => onSelectBeatKey(active ? "all" : group.key)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={active ? "default" : "outline"}>{group.label}</Badge>
                            <Badge variant="secondary">{group.chapterSpanHint}</Badge>
                            {renderBeatStatusBadge(group)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {group.chapters.length}/{Math.max(group.expectedCount, group.chapters.length, 1)}章 · {group.refinedCount}章已细化
                          </span>
                        </div>
                      </button>
                      {active && selectedVolumeChapters.length > 0 ? (
                        <AiButton
                          size="sm"
                          variant="outline"
                          onClick={() => onGenerateChapterList(selectedVolume.id, {
                            generationMode: "single_beat",
                            targetBeatKey: group.key,
                          })}
                          disabled={isGeneratingChapterList || locked}
                        >
                          {isGeneratingCurrentVolume && generatingChapterListMode === "single_beat" && generatingChapterListBeatKey === group.key
                            ? "重生中..."
                            : group.chapters.length > 0 ? "重生当前节奏段" : "生成当前节奏段"}
                        </AiButton>
                      ) : null}
                    </div>

                    {expanded ? (
                      <div className="mt-3 space-y-2 border-l border-border/70 pl-3">
                        {group.chapters.length > 0 ? group.chapters.map((chapter) => {
                          const isSelected = selectedChapter?.id === chapter.id;
                          return (
                            <button
                              key={chapter.id}
                              type="button"
                              onClick={() => {
                                onSelectBeatKey(group.key);
                                onSelectChapter(chapter.id);
                              }}
                              className={cn(
                                "w-full rounded-xl border p-3 text-left transition-colors",
                                isSelected ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/70 hover:border-primary/30",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant={isSelected ? "default" : "outline"}>第{chapter.chapterOrder}章</Badge>
                                {renderChapterDetailStatusBadge(chapter)}
                              </div>
                              <div className="mt-2 text-sm font-medium">{chapter.title || `第${chapter.chapterOrder}章`}</div>
                            </button>
                          );
                        }) : (
                          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                            该节奏段下暂时还没有映射到章节。
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {unmatchedChapters.length > 0 ? (
                <div className="rounded-xl border border-dashed p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">未归入节奏段</Badge>
                      <Badge variant="secondary">{unmatchedChapters.length}章</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">这些章节暂时没有落到任何节奏段</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {unmatchedChapters.map((chapter) => {
                      const isSelected = selectedChapter?.id === chapter.id;
                      const title = chapter.title || `第${chapter.chapterOrder}章`;
                      return (
                        <div
                          key={chapter.id}
                          className={cn(
                            "flex items-start gap-2 rounded-xl border p-3 transition-colors",
                            isSelected ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/70 hover:border-primary/30",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectChapter(chapter.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={isSelected ? "default" : "outline"}>第{chapter.chapterOrder}章</Badge>
                              {renderChapterDetailStatusBadge(chapter)}
                            </div>
                            <div className="mt-2 text-sm font-medium">{title}</div>
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={locked || selectedVolume.chapters.length <= 1}
                            title="删除这个未归入节奏段的章节"
                            onClick={() => {
                              const confirmed = window.confirm(`确认删除「${title}」？这只会从当前卷的章节拆分中移除该章节。`);
                              if (!confirmed) {
                                return;
                              }
                              onRemoveChapter(selectedVolume.id, chapter.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">删除这个未归入节奏段的章节</span>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {visibleChapters.length === 0 && selectedBeat ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {selectedVolumeNeedsChapterExpansion ? (
                  <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                    当前节奏段是 {selectedBeat.chapterSpanHint}，还没有生成章节。可以生成当前聚焦段，不需要先补齐整卷。
                  </div>
                ) : null}
                当前节奏段还没有映射到章节。生成这一段后，就可以继续细化和开写该段章节。
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {selectedVolumeRequiredChapterCount > 0 ? (
              <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                根据当前节奏板，这一卷预计覆盖 {selectedVolumeRequiredChapterCount} 章。可以先生成下一段章节，后续段按需继续拆。
              </div>
            ) : null}
            当前卷还没有章节列表。先生成下一段章节。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
