import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getStructuredOutlineWorkspaceDefaults,
  useStructuredOutlineWorkspaceStore,
} from "../stores/useStructuredOutlineWorkspaceStore";
import { hasChapterExecutionDetail } from "../chapterDetailPlanning.shared";
import { findBeatSheet } from "../volumePlan.utils";
import StructuredChapterDetailCard from "./StructuredChapterDetailCard";
import WorldInjectionHint from "./WorldInjectionHint";
import type { StructuredTabViewProps } from "./NovelEditView.types";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type StructuredBeat = StructuredTabViewProps["beatSheets"][number]["beats"][number];

function actionLabel(action: StructuredTabViewProps["syncPreview"]["items"][number]["action"]) {
  if (action === "create") return "新增";
  if (action === "update") return "更新";
  if (action === "move") return "移动";
  if (action === "keep") return "保留";
  if (action === "delete") return "删除";
  return "待删候选";
}

function parseBeatSpan(chapterSpanHint: string): { start: number; end: number } | null {
  const numbers = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (numbers.length === 0 || numbers.some((value) => Number.isNaN(value))) {
    return null;
  }
  return { start: numbers[0], end: numbers[numbers.length - 1] };
}

function getBeatSheetRequiredChapterCount(
  beatSheet: ReturnType<typeof findBeatSheet>,
): number {
  if (!beatSheet) {
    return 0;
  }
  return beatSheet.beats.reduce((maxValue, beat) => {
    const span = parseBeatSpan(beat.chapterSpanHint);
    const upperBound = span?.end ?? 0;
    return upperBound > maxValue ? upperBound : maxValue;
  }, 0);
}

function chapterMatchesBeat(chapter: StructuredChapter, beat: StructuredBeat): boolean {
  const span = parseBeatSpan(beat.chapterSpanHint);
  return span ? chapter.chapterOrder >= span.start && chapter.chapterOrder <= span.end : false;
}

function findChapterBeat(
  chapter: StructuredChapter,
  beatSheet: ReturnType<typeof findBeatSheet>,
): StructuredBeat | null {
  return beatSheet?.beats.find((beat) => chapterMatchesBeat(chapter, beat)) ?? null;
}

function getWorkspaceGuidance(params: {
  locked: boolean;
  selectedBeat: StructuredBeat | null;
  selectedChapter: StructuredChapter | null;
  visibleChapterCount: number;
  totalChapterCount: number;
}): string {
  const { locked, selectedBeat, selectedChapter, visibleChapterCount, totalChapterCount } = params;
  if (locked) {
    return "先为当前卷生成节奏板，系统才能把卷内推进节奏和章节拆分对齐起来。";
  }
  if (selectedBeat) {
    return selectedChapter
      ? `已聚焦到「${selectedBeat.label}」，当前显示 ${visibleChapterCount} 章，右侧正在细化第 ${selectedChapter.chapterOrder} 章。`
      : `已聚焦到「${selectedBeat.label}」，当前显示 ${visibleChapterCount} 章，接下来在左侧选择要细化的章节。`;
  }
  return `当前展示本卷全部 ${totalChapterCount} 章。建议先点一个节奏段，让系统把对应章节收束出来，再开始细化。`;
}

export default function StructuredOutlineWorkspace(props: StructuredTabViewProps) {
  const {
    novelId,
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    strategyPlan,
    beatSheets,
    rebalanceDecisions,
    isGeneratingBeatSheet,
    onGenerateBeatSheet,
    isGeneratingChapterList,
    onGenerateChapterList,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail,
    onGenerateChapterDetailBundle,
    onGoToCharacterTab,
    volumes,
    draftText,
    syncPreview,
    syncOptions,
    onSyncOptionsChange,
    onApplySync,
    isApplyingSync,
    syncMessage,
    onChapterFieldChange,
    onChapterNumberChange,
    onChapterPayoffRefsChange,
    onAddChapter,
    onRemoveChapter,
    onMoveChapter,
    onApplyBatch,
    onSave,
    isSaving,
  } = props;

  const workspaceId = novelId || "draft-structured-outline";
  const defaultVolumeId = volumes[0]?.id ?? "";
  const defaultChapterId = volumes[0]?.chapters[0]?.id ?? "";
  const ensureWorkspace = useStructuredOutlineWorkspaceStore((state) => state.ensureWorkspace);
  const patchWorkspace = useStructuredOutlineWorkspaceStore((state) => state.patchWorkspace);
  const selectedVolumeId = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.selectedVolumeId ?? defaultVolumeId,
  );
  const selectedChapterId = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.selectedChapterId ?? defaultChapterId,
  );
  const selectedBeatKey = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.selectedBeatKey ?? "all",
  );
  const showChapterAdvanced = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.showChapterAdvanced ?? false,
  );
  const showRebalancePanel = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.showRebalancePanel ?? false,
  );
  const showSyncPanel = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.showSyncPanel ?? false,
  );
  const showSyncPreview = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.showSyncPreview ?? false,
  );
  const showJsonPreview = useStructuredOutlineWorkspaceStore(
    (state) => state.workspaces[workspaceId]?.showJsonPreview ?? false,
  );

  useEffect(() => {
    ensureWorkspace(
      workspaceId,
      getStructuredOutlineWorkspaceDefaults(defaultVolumeId, defaultChapterId),
    );
  }, [defaultChapterId, defaultVolumeId, ensureWorkspace, workspaceId]);

  useEffect(() => {
    if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
      patchWorkspace(workspaceId, {
        selectedVolumeId: defaultVolumeId,
        selectedBeatKey: "all",
        selectedChapterId: defaultChapterId,
      });
    }
  }, [defaultChapterId, defaultVolumeId, patchWorkspace, selectedVolumeId, volumes, workspaceId]);

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? volumes[0];
  const selectedBeatSheet = selectedVolume ? findBeatSheet(beatSheets, selectedVolume.id) : null;
  const selectedBeat = selectedBeatKey === "all"
    ? null
    : selectedBeatSheet?.beats.find((beat) => beat.key === selectedBeatKey) ?? null;
  const selectedVolumeChapters = selectedVolume?.chapters ?? [];
  const selectedVolumeRequiredChapterCount = getBeatSheetRequiredChapterCount(selectedBeatSheet);
  const selectedVolumeNeedsChapterExpansion = selectedVolumeRequiredChapterCount > selectedVolumeChapters.length;
  const visibleChapters = selectedBeat
    ? selectedVolumeChapters.filter((chapter) => chapterMatchesBeat(chapter, selectedBeat))
    : selectedVolumeChapters;
  const selectedChapter = visibleChapters.find((chapter) => chapter.id === selectedChapterId)
    ?? selectedVolumeChapters.find((chapter) => chapter.id === selectedChapterId)
    ?? visibleChapters[0]
    ?? selectedVolumeChapters[0]
    ?? null;
  const selectedChapterIndex = selectedVolume && selectedChapter
    ? selectedVolume.chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const selectedChapterBeat = selectedChapter ? findChapterBeat(selectedChapter, selectedBeatSheet) : null;
  const selectedRebalance = selectedVolume
    ? rebalanceDecisions.filter((decision) => decision.anchorVolumeId === selectedVolume.id)
    : [];
  const locked = !selectedBeatSheet;
  const refinedChapterCount = selectedVolumeChapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length;
  const visibleRefinedChapterCount = visibleChapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length;
  const workspaceGuidance = getWorkspaceGuidance({
    locked,
    selectedBeat,
    selectedChapter,
    visibleChapterCount: visibleChapters.length,
    totalChapterCount: selectedVolumeChapters.length,
  });

  useEffect(() => {
    const beatKeys = new Set(selectedBeatSheet?.beats.map((beat) => beat.key) ?? []);
    if (selectedBeatKey !== "all" && !beatKeys.has(selectedBeatKey)) {
      patchWorkspace(workspaceId, { selectedBeatKey: "all" });
    }
  }, [patchWorkspace, selectedBeatKey, selectedBeatSheet, workspaceId]);

  useEffect(() => {
    if (!selectedChapter) {
      patchWorkspace(workspaceId, {
        selectedChapterId: visibleChapters[0]?.id ?? selectedVolumeChapters[0]?.id ?? "",
      });
      return;
    }
    if (selectedBeat && !visibleChapters.some((chapter) => chapter.id === selectedChapter.id)) {
      patchWorkspace(workspaceId, { selectedChapterId: visibleChapters[0]?.id ?? "" });
      return;
    }
    if (!selectedVolumeChapters.some((chapter) => chapter.id === selectedChapter.id)) {
      patchWorkspace(workspaceId, { selectedChapterId: selectedVolumeChapters[0]?.id ?? "" });
    }
  }, [patchWorkspace, selectedBeat, selectedChapter, selectedVolumeChapters, visibleChapters, workspaceId]);

  if (volumes.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>节奏 / 拆章</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span>请先补角色，再拆节奏和章节。</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
            </div>
          ) : null}
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">先在上一页生成卷战略和卷骨架。</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>节奏 / 拆章</CardTitle>
          <div className="text-sm text-muted-foreground">先选卷，再看节奏，再从对应章节里挑当前要细化的一章。</div>
        </div>
        <Button variant="secondary" onClick={onSave} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存卷工作区"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
          <Badge variant="outline">当前：第{selectedVolume.sortOrder}卷</Badge>
          <Badge variant="outline">{selectedVolumeChapters.length}章</Badge>
          <Badge variant="outline">{refinedChapterCount}/{Math.max(selectedVolumeChapters.length, 1)} 已细化</Badge>
        </div>

        <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm text-foreground">
          {workspaceGuidance}
        </div>

        {!strategyPlan ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">请先在上一阶段生成卷战略建议，再继续当前卷节奏板和拆章。</div> : null}
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}
        {locked ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">当前卷还没有节奏板，章节列表生成已锁定。</div> : null}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">当前处理卷</CardTitle>
              <div className="text-sm text-muted-foreground">先切到要处理的卷，主工作区会跟着切换当前卷节奏和章节。</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {volumes.map((volume) => {
                const volumeBeatSheet = findBeatSheet(beatSheets, volume.id);
                const isSelected = selectedVolume.id === volume.id;
                const doneCount = volume.chapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length;
                return (
                  <button
                    key={volume.id}
                    type="button"
                    onClick={() => {
                      patchWorkspace(workspaceId, {
                        selectedVolumeId: volume.id,
                        selectedBeatKey: "all",
                        selectedChapterId: volume.chapters[0]?.id ?? "",
                      });
                    }}
                    className={cn(
                      "min-w-[220px] shrink-0 rounded-2xl border p-3 text-left transition-colors",
                      isSelected ? "border-primary/50 bg-primary/5" : "border-border/70 hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={isSelected ? "default" : "outline"}>第{volume.sortOrder}卷</Badge>
                      {volumeBeatSheet ? <Badge variant="secondary">有节奏板</Badge> : <Badge variant="outline">未做节奏板</Badge>}
                    </div>
                    <div className="mt-2 line-clamp-1 text-sm font-medium">{volume.title || `第${volume.sortOrder}卷`}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {volume.mainPromise || volume.summary || "先补这卷的核心承诺。"}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">{volume.chapters.length}章 · {doneCount}章已细化</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedRebalance.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                检测到 {selectedRebalance.length} 条相邻卷再平衡建议。它们会影响跨卷衔接，但不属于当前主编辑动作。
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => patchWorkspace(workspaceId, { showRebalancePanel: !showRebalancePanel })}
              >
                {showRebalancePanel ? "收起建议" : "查看建议"}
              </Button>
            </div>
            {showRebalancePanel ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {selectedRebalance.map((decision) => (
                  <div
                    key={`${decision.anchorVolumeId}-${decision.affectedVolumeId}-${decision.summary}`}
                    className="rounded-xl border p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{decision.direction}</Badge>
                      <Badge
                        variant={
                          decision.severity === "high"
                            ? "secondary"
                            : decision.severity === "medium"
                              ? "outline"
                              : "default"
                        }
                      >
                        {decision.severity}
                      </Badge>
                    </div>
                    <div className="mt-2">{decision.summary}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="text-base">当前卷节奏</CardTitle>
                  <div className="text-sm text-muted-foreground">先在这里定位当前卷推进区间，再到下面左侧章节导航里选当前要细化的章。</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => onGenerateBeatSheet(selectedVolume.id)}
                  disabled={isGeneratingBeatSheet || !readiness.canGenerateBeatSheet}
                >
                  {isGeneratingBeatSheet ? "生成中..." : "生成当前卷节奏板"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedBeatSheet ? (
                <>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => patchWorkspace(workspaceId, { selectedBeatKey: "all" })}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selectedBeatKey === "all" ? "border-primary/50 bg-primary/5" : "border-border/70 hover:border-primary/30",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={selectedBeatKey === "all" ? "default" : "outline"}>全部章节</Badge>
                          <span className="text-xs text-muted-foreground">默认总览</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {selectedVolumeChapters.length}章 · {refinedChapterCount}章已细化
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        不限定节奏段，先整体浏览本卷章节分布，再决定聚焦哪个节奏区间。
                      </div>
                    </button>

                    {selectedBeatSheet.beats.map((beat) => {
                      const beatChapters = selectedVolumeChapters.filter((chapter) => chapterMatchesBeat(chapter, beat));
                      const beatDone = beatChapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length;
                      const active = selectedBeatKey === beat.key;
                      return (
                        <button
                          key={beat.key}
                          type="button"
                          onClick={() => patchWorkspace(workspaceId, { selectedBeatKey: active ? "all" : beat.key })}
                          className={cn(
                            "w-full rounded-xl border p-3 text-left transition-colors",
                            active ? "border-primary/50 bg-primary/5" : "border-border/70 hover:border-primary/30",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={active ? "default" : "outline"}>{beat.label}</Badge>
                              <Badge variant="secondary">{beat.chapterSpanHint}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{beatChapters.length}章 · {beatDone}章已细化</span>
                          </div>
                          <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{beat.summary}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    {selectedBeat ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{selectedBeat.label}</Badge>
                          <Badge variant="secondary">{selectedBeat.chapterSpanHint}</Badge>
                          <Badge variant="outline">{visibleChapters.length}章</Badge>
                        </div>
                        <div className="text-sm">{selectedBeat.summary}</div>
                        <div className="flex flex-wrap gap-2">
                          {selectedBeat.mustDeliver.map((item) => (
                            <Badge key={item} variant="outline">{item}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">当前未限定节奏段</div>
                        <div>先整体浏览本卷章节，再点击一个节奏段，把下面左侧章节导航收束到对应范围。</div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  先为当前卷生成节奏板。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
            <Card className="flex min-h-0 flex-col overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)]">
              <CardHeader className="pb-3">
                <div className="space-y-3">
                  <div>
                    <CardTitle className="text-base leading-none">当前卷章节列表</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      {selectedBeat
                        ? `左侧作为章节导航，当前只显示「${selectedBeat.label}」对应章节。`
                        : "左侧作为章节导航，默认显示当前卷全部章节。"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => onGenerateChapterList(selectedVolume.id)}
                      disabled={isGeneratingChapterList || locked}
                    >
                      {isGeneratingChapterList ? "生成中..." : "生成当前卷章节列表"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onAddChapter(selectedVolume.id)}>
                      新增章节
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-0">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">显示 {visibleChapters.length}/{selectedVolumeChapters.length} 章</Badge>
                  <Badge variant="outline">{visibleRefinedChapterCount}/{Math.max(visibleChapters.length, 1)} 已细化</Badge>
                </div>
                {selectedVolumeNeedsChapterExpansion ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
                    当前卷目前只有 {selectedVolumeChapters.length} 章，但节奏板已经排到 {selectedVolumeRequiredChapterCount} 章。需要先重新生成当前卷章节列表，后半段节奏才会真正映射到章节。
                  </div>
                ) : null}
                {selectedVolumeChapters.length > 0 ? (
                  <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                    {visibleChapters.map((chapter) => {
                      const isSelected = selectedChapter?.id === chapter.id;
                      const chapterBeat = findChapterBeat(chapter, selectedBeatSheet);
                      return (
                        <button
                          key={chapter.id}
                          type="button"
                          onClick={() => patchWorkspace(workspaceId, { selectedChapterId: chapter.id })}
                          className={cn(
                            "w-full rounded-xl border p-3 text-left transition-colors",
                            isSelected ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border/70 hover:border-primary/30",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={isSelected ? "default" : "outline"}>第{chapter.chapterOrder}章</Badge>
                              {chapterBeat ? <Badge variant="secondary">{chapterBeat.label}</Badge> : null}
                            </div>
                            {hasChapterExecutionDetail(chapter) ? <Badge variant="secondary">已细化</Badge> : <Badge variant="outline">待细化</Badge>}
                          </div>
                          <div className="mt-2 text-sm font-medium">{chapter.title || `第${chapter.chapterOrder}章`}</div>
                          <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {chapter.summary?.trim() || "先补本章摘要，再继续细化。"}
                          </div>
                        </button>
                      );
                    })}
                    {visibleChapters.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        {selectedBeat && selectedVolumeNeedsChapterExpansion ? (
                          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                            当前节奏段是 {selectedBeat.chapterSpanHint}，但本卷目前只生成到 {selectedVolumeChapters.length} 章。请先重新生成当前卷章节列表，把这一卷补到至少 {selectedVolumeRequiredChapterCount} 章。
                          </div>
                        ) : null}
                        当前节奏段还没有映射到章节，先切回全部章节或重新调整节奏板。
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    {selectedVolumeRequiredChapterCount > 0 ? (
                      <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800">
                        根据当前节奏板，这一卷至少需要 {selectedVolumeRequiredChapterCount} 章，才能把各个节奏段完整映射到章节。
                      </div>
                    ) : null}
                    当前卷还没有章节列表。先生成当前卷章节列表。
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <StructuredChapterDetailCard
                selectedVolume={selectedVolume}
                selectedChapter={selectedChapter}
                visibleChapters={visibleChapters}
                selectedChapterBeatLabel={selectedChapterBeat?.label ?? null}
                selectedChapterIndex={selectedChapterIndex}
                showChapterAdvanced={showChapterAdvanced}
                onToggleAdvanced={() => patchWorkspace(workspaceId, { showChapterAdvanced: !showChapterAdvanced })}
                isGeneratingChapterDetail={isGeneratingChapterDetail}
                isGeneratingChapterDetailBundle={isGeneratingChapterDetailBundle}
                generatingChapterDetailMode={generatingChapterDetailMode}
                generatingChapterDetailChapterId={generatingChapterDetailChapterId}
                onGenerateChapterDetail={onGenerateChapterDetail}
                onGenerateChapterDetailBundle={onGenerateChapterDetailBundle}
                onChapterFieldChange={onChapterFieldChange}
                onChapterNumberChange={onChapterNumberChange}
                onChapterPayoffRefsChange={onChapterPayoffRefsChange}
                onMoveChapter={onMoveChapter}
                onRemoveChapter={onRemoveChapter}
                locked={locked}
              />

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">同步到章节执行</CardTitle>
                    <div className="text-sm text-muted-foreground">批量设置、同步差异和 JSON 预览都收在这里，准备收尾时再展开。</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{syncPreview.items.length} 项差异</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patchWorkspace(workspaceId, { showSyncPanel: !showSyncPanel })}
                    >
                      {showSyncPanel ? "收起同步工具" : "展开同步工具"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showSyncPanel ? (
                  <>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
                        <input type="checkbox" checked={syncOptions.preserveContent} onChange={(event) => onSyncOptionsChange({ preserveContent: event.target.checked })} />
                        保留已有正文
                      </label>
                      <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
                        <input type="checkbox" checked={syncOptions.applyDeletes} onChange={(event) => onSyncOptionsChange({ applyDeletes: event.target.checked })} />
                        同步时删除卷纲外章节
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => onApplyBatch({ conflictLevel: 60 })}>统一冲突等级 60</Button>
                      <Button size="sm" variant="outline" onClick={() => onApplyBatch({ targetWordCount: 2500 })}>统一字数 2500</Button>
                      <Button size="sm" onClick={() => onApplyBatch({ generateTaskSheet: true })}>批量补任务单</Button>
                      <Button onClick={() => onApplySync(syncOptions)} disabled={isApplyingSync}>
                        {isApplyingSync ? "同步中..." : "同步到章节执行"}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => patchWorkspace(workspaceId, { showSyncPreview: !showSyncPreview })}
                      >
                        {showSyncPreview ? "隐藏同步差异" : "查看同步差异"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => patchWorkspace(workspaceId, { showJsonPreview: !showJsonPreview })}
                      >
                        {showJsonPreview ? "隐藏 JSON" : "查看 JSON"}
                      </Button>
                    </div>

                    {showSyncPreview ? (
                      <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                        {syncPreview.items.map((item) => (
                          <div
                            key={`${item.action}-${item.chapterOrder}-${item.nextTitle}`}
                            className="rounded-lg border border-border/70 bg-background/80 p-2.5"
                          >
                            <div className="font-medium">第{item.chapterOrder}章：{item.nextTitle}</div>
                            <div className="text-muted-foreground">字段：{item.changedFields.join("、") || "无"}</div>
                            <Badge
                              className="mt-2"
                              variant={
                                item.action === "delete" || item.action === "delete_candidate"
                                  ? "secondary"
                                  : item.action === "create"
                                    ? "default"
                                    : "outline"
                              }
                            >
                              {actionLabel(item.action)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {showJsonPreview ? (
                      <textarea className="min-h-[280px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    当前章节规划先以“选章 + 细化”为主。批量补任务单、同步差异和 JSON 预览都已经收起，避免打断主流程。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
