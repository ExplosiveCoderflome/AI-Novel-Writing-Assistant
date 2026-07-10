import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useState } from "react";
import AiButton from "@/components/common/AiButton";
import TensionCurvePanel, { type TensionCurveSeries, type TensionCurveViewportOption } from "@/components/tensionCurve/TensionCurvePanel";
import { TensionCurveEditDialog } from "@/components/tensionCurve/TensionCurveEditDialog";
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
import StructuredBeatSheetCard from "./StructuredBeatSheetCard";
import StructuredChapterListCard from "./StructuredChapterListCard";
import StructuredChapterDetailCard from "./StructuredChapterDetailCard";
import WorldInjectionHint from "./WorldInjectionHint";
import {
  chapterMatchesBeat,
  findChapterBeat,
  getBeatSheetRequiredChapterCount,
} from "./structuredOutlineWorkspace.shared";
import type { StructuredTabViewProps } from "./NovelEditView.types";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type StructuredBeat = StructuredTabViewProps["beatSheets"][number]["beats"][number];

function actionLabel(action: StructuredTabViewProps["syncPreview"]["items"][number]["action"]) {
  if (action === "create") return t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_66ab5e9f");
  if (action === "update") return t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_32ac152b");
  if (action === "move") return t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_68d982a1");
  if (action === "keep") return t("gen.pages.novels.components.StructuredOutlineWorkspace.preserve");
  if (action === "delete") return t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_2f4aaddd");
  return t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_47e11ee8");
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
    return t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_c5a0b619");
  }
  if (selectedBeat) {
    return selectedChapter
      ? `已聚焦到「${selectedBeat.label}」，当前显示 ${visibleChapterCount} 章，右侧正在细化第 ${selectedChapter.chapterOrder} 章。`
      : `已聚焦到「${selectedBeat.label}」，当前显示 ${visibleChapterCount} 章，接下来在左侧选择要细化的章节。`;
  }
  return `当前展示本卷全部 ${totalChapterCount} 章。建议先点一个节奏段，让系统把对应章节收束出来，再开始细化。`;
}

function chapterMatchesSelection(chapter: StructuredChapter, selectedId: string): boolean {
  return chapter.id === selectedId || chapter.chapterId === selectedId;
}

export default function StructuredOutlineWorkspace(props: StructuredTabViewProps) {
  const {
    novelId,
    directorTakeoverEntry,
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
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    onGenerateChapterList,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    onGenerateChapterDetail,
    onGenerateChapterDetailBundle,
    onGoToCharacterTab,
    volumes,
    chapters: executionChapters,
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
  const [tensionCurveDialogOpen, setTensionCurveDialogOpen] = useState(false);

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
  const selectedStrategyVolume = selectedVolume
    ? strategyPlan?.volumes.find((item) => item.sortOrder === selectedVolume.sortOrder) ?? null
    : null;
  const selectedBeatSheet = selectedVolume ? findBeatSheet(beatSheets, selectedVolume.id) : null;
  const selectedBeat = selectedBeatKey === "all"
    ? null
    : selectedBeatSheet?.beats.find((beat) => beat.key === selectedBeatKey) ?? null;
  const selectedVolumeChapters = selectedVolume?.chapters ?? [];
  const selectedVolumeRequiredChapterCount = getBeatSheetRequiredChapterCount(selectedBeatSheet);
  const selectedVolumeNeedsChapterExpansion = selectedVolumeRequiredChapterCount > selectedVolumeChapters.length;
  const visibleChapters = selectedBeat
    ? selectedVolumeChapters.filter((chapter) => chapterMatchesBeat(chapter, selectedBeat, selectedVolumeChapters))
    : selectedVolumeChapters;
  const selectedChapter = visibleChapters.find((chapter) => chapterMatchesSelection(chapter, selectedChapterId))
    ?? selectedVolumeChapters.find((chapter) => chapterMatchesSelection(chapter, selectedChapterId))
    ?? visibleChapters[0]
    ?? selectedVolumeChapters[0]
    ?? null;
  const selectedChapterIndex = selectedVolume && selectedChapter
    ? selectedVolume.chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const selectedChapterBeat = selectedChapter ? findChapterBeat(selectedChapter, selectedBeatSheet, selectedVolumeChapters) : null;
  const selectedRebalance = selectedVolume
    ? rebalanceDecisions.filter((decision) => decision.anchorVolumeId === selectedVolume.id)
    : [];
  const locked = !selectedBeatSheet;
  const refinedChapterCount = selectedVolumeChapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length;
  const visibleRefinedChapterCount = visibleChapters.filter((chapter) => hasChapterExecutionDetail(chapter)).length;
  const allPlannedChapters = volumes.flatMap((volume) => volume.chapters);
  const linkedChapterCount = allPlannedChapters.filter((chapter) => Boolean(chapter.chapterId)).length;
  const hasMissingChapterLinks = allPlannedChapters.length > 0 && linkedChapterCount < allPlannedChapters.length;
  const executionChapterCount = executionChapters.length;
  const workspaceGuidance = getWorkspaceGuidance({
    locked,
    selectedBeat,
    selectedChapter,
    visibleChapterCount: visibleChapters.length,
    totalChapterCount: selectedVolumeChapters.length,
  });
  const tensionCurveViewportOptions: TensionCurveViewportOption[] = [
    { key: "all", label: t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_ff3145ff") },
    ...(selectedBeatSheet?.beats.map((beat) => ({ key: beat.key, label: beat.label })) ?? []),
  ];
  const tensionCurveSeries: TensionCurveSeries[] = selectedVolume
    ? [{
      id: "conflictLevel",
      label: t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_3e85c65a"),
      color: "#2563eb",
      editable: true,
      points: selectedVolumeChapters.map((chapter) => ({
        id: chapter.id,
        chapterOrder: chapter.chapterOrder,
        title: chapter.title || `第${chapter.chapterOrder}章`,
        value: typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : null,
        source: chapter.conflictLevelSource ?? "ai",
        beatKey: findChapterBeat(chapter, selectedBeatSheet, selectedVolumeChapters)?.key ?? null,
      })),
    }]
    : [];

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
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader><CardTitle>{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_4bb0dcce")}</CardTitle></CardHeader>
        <CardContent className="space-y-4 px-0">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <span>{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_9f9804e8")}</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_ef2c69b9")}</Button>
            </div>
          ) : null}
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_6fc6f465")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="flex flex-col gap-4 rounded-2xl bg-muted/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_4bb0dcce")}</CardTitle>
          <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_471bc6a3")}</div>
        </div>
        <Button variant="secondary" onClick={onSave} disabled={isSaving}>
          {isSaving ? t("gen.pages.novels.components.StructuredOutlineWorkspace.savingInProgressDotDotDot") : t("gen.pages.novels.components.StructuredOutlineWorkspace.saveVolumeWorkspace")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 px-0 pt-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

        {directorTakeoverEntry ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_7802ca88")}</div>
              <div className="text-sm text-muted-foreground">
                不用回到项目设定，直接在这里重新进入自动导演，让 AI 继续推进节奏拆章或后续自动执行。
              </div>
            </div>
            <div className="shrink-0">
              {directorTakeoverEntry}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_7fa6741a")}</Badge> : null}
          <Badge variant="outline">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_8505db47")}</Badge>
          <Badge variant="outline">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_selectedVo_g47t")}</Badge>
          <Badge variant="outline">{t("gen.pages.novels.components.StructuredOutlineWorkspace.refinementProgress")}</Badge>
        </div>

        <div className="rounded-2xl bg-primary/5 px-4 py-3 text-sm text-foreground">
          {workspaceGuidance}
        </div>

        <TensionCurvePanel
          title={t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_620e5a0e")}
          subtitle={t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_b1ab6afa")}
          series={tensionCurveSeries}
          viewportOptions={tensionCurveViewportOptions}
          selectedViewportKey={selectedBeatKey}
          onViewportChange={(key) => patchWorkspace(workspaceId, { selectedBeatKey: key })}
          onRequestEdit={() => setTensionCurveDialogOpen(true)}
        />

        <TensionCurveEditDialog
          open={tensionCurveDialogOpen}
          onOpenChange={setTensionCurveDialogOpen}
          title={t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_15915af4")}
          description={t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_3074c331")}
          series={tensionCurveSeries}
          viewportOptions={tensionCurveViewportOptions}
          selectedViewportKey={selectedBeatKey}
          onViewportChange={(key) => patchWorkspace(workspaceId, { selectedBeatKey: key })}
          strategyVolume={selectedStrategyVolume}
          beats={selectedBeatSheet?.beats ?? []}
          chapters={selectedVolumeChapters.map((chapter) => ({
            id: chapter.id,
            chapterId: chapter.chapterId,
            chapterOrder: chapter.chapterOrder,
            beatKey: findChapterBeat(chapter, selectedBeatSheet, selectedVolumeChapters)?.key ?? null,
            title: chapter.title || `第${chapter.chapterOrder}章`,
            summary: chapter.summary,
            purpose: chapter.purpose,
            exclusiveEvent: chapter.exclusiveEvent,
            conflictLevel: chapter.conflictLevel,
            conflictLevelSource: chapter.conflictLevelSource ?? "ai",
          }))}
          selectedChapterId={selectedChapter?.id ?? selectedChapterId}
          onSelectChapter={(chapterId) => patchWorkspace(workspaceId, { selectedChapterId: chapterId })}
          onOpenChapterDetail={(chapterId) => {
            patchWorkspace(workspaceId, { selectedChapterId: chapterId });
            setTensionCurveDialogOpen(false);
          }}
          onPointChange={(seriesId, chapterId, value) => {
            if (!selectedVolume || seriesId !== "conflictLevel") {
              return;
            }
            onChapterNumberChange(selectedVolume.id, chapterId, "conflictLevel", value, {
              conflictLevelSource: "user",
            });
          }}
          onPointRelease={(seriesId, chapterId, value) => {
            if (!selectedVolume || seriesId !== "conflictLevel") {
              return;
            }
            onChapterNumberChange(selectedVolume.id, chapterId, "conflictLevel", value, {
              conflictLevelSource: "ai",
            });
          }}
          onPointReleaseMany={(seriesId, points) => {
            if (!selectedVolume || seriesId !== "conflictLevel") {
              return;
            }
            points.forEach((point) => {
              onChapterNumberChange(selectedVolume.id, point.pointId, "conflictLevel", point.value, {
                conflictLevelSource: "ai",
              });
            });
          }}
        />

        {!strategyPlan ? <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_99777540")}</div> : null}
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}
        {locked ? <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_60fea0bb")}</div> : null}

        <Card className="border-0 bg-muted/15 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_f2294d81")}</CardTitle>
              <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_0d93d85a")}</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="structured-volume-picker grid grid-cols-1 gap-2 md:flex md:gap-3 md:overflow-x-auto md:pb-1">
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
                      "w-full min-w-0 rounded-xl p-3 text-left transition-colors md:min-w-[220px] md:shrink-0 md:rounded-2xl",
                      isSelected ? "bg-primary/5 shadow-sm ring-1 ring-primary/15" : "bg-background/70 hover:bg-background",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={isSelected ? "default" : "outline"}>{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_560e043c")}</Badge>
                      {volumeBeatSheet ? <Badge variant="secondary">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_39ecb71d")}</Badge> : <Badge variant="outline">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_fc79de31")}</Badge>}
                    </div>
                    <div className="mt-2 line-clamp-1 text-sm font-medium">{volume.title || `第${volume.sortOrder}卷`}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {volume.mainPromise || volume.summary || t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_35018c56")}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.chapterProgress")}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedRebalance.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                检测到 {selectedRebalance.length} 条相邻卷再平衡建议。它们会影响跨卷衔接，但不属于当前主编辑动作。
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => patchWorkspace(workspaceId, { showRebalancePanel: !showRebalancePanel })}
              >
                {showRebalancePanel ? t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_5d08ebf5") : t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_73c8823d")}
              </Button>
            </div>
            {showRebalancePanel ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {selectedRebalance.map((decision) => (
                  <div
                    key={`${decision.anchorVolumeId}-${decision.affectedVolumeId}-${decision.summary}`}
                    className="rounded-xl bg-muted/15 p-3 text-sm"
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
          <StructuredBeatSheetCard
            selectedVolume={selectedVolume}
            selectedVolumeChapters={selectedVolumeChapters}
            selectedBeatSheet={selectedBeatSheet}
            selectedBeat={selectedBeat}
            visibleChapters={visibleChapters}
            refinedChapterCount={refinedChapterCount}
            visibleRefinedChapterCount={visibleRefinedChapterCount}
            readiness={readiness}
            isGeneratingBeatSheet={isGeneratingBeatSheet}
            onGenerateBeatSheet={onGenerateBeatSheet}
            chapterListPanel={(
              <StructuredChapterListCard
                selectedVolume={selectedVolume}
                selectedBeat={selectedBeat}
                selectedBeatKey={selectedBeatKey}
                selectedBeatSheet={selectedBeatSheet}
                selectedVolumeChapters={selectedVolumeChapters}
                visibleChapters={visibleChapters}
                selectedChapter={selectedChapter}
                visibleRefinedChapterCount={visibleRefinedChapterCount}
                selectedVolumeRequiredChapterCount={selectedVolumeRequiredChapterCount}
                selectedVolumeNeedsChapterExpansion={selectedVolumeNeedsChapterExpansion}
                isGeneratingChapterList={isGeneratingChapterList}
                generatingChapterListVolumeId={generatingChapterListVolumeId}
                generatingChapterListBeatKey={generatingChapterListBeatKey}
                generatingChapterListMode={generatingChapterListMode}
                locked={locked}
                onGenerateChapterList={onGenerateChapterList}
                onRemoveChapter={onRemoveChapter}
                onSelectBeatKey={(beatKey) => patchWorkspace(workspaceId, { selectedBeatKey: beatKey })}
                onSelectChapter={(chapterId) => patchWorkspace(workspaceId, { selectedChapterId: chapterId })}
              />
            )}
            chapterDetailPanel={(
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
            )}
          />

          <div className="space-y-4">
            <Card className="border-0 bg-muted/15 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_7297e792")}</CardTitle>
                    <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_454bd656")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={hasMissingChapterLinks ? "outline" : "secondary"}>
                      {linkedChapterCount}/{Math.max(allPlannedChapters.length, 1)} 已连接
                    </Badge>
                    <Badge variant="outline">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_37822ddb")}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patchWorkspace(workspaceId, { showSyncPanel: !showSyncPanel })}
                    >
                      {showSyncPanel ? t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_39256628") : t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_97b05c17")}
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
                      <AiButton size="sm" onClick={() => onApplyBatch({ generateTaskSheet: true })}>批量补任务单</AiButton>
                      <Button onClick={() => onApplySync(syncOptions)} disabled={isApplyingSync}>
                        {isApplyingSync ? t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_70ae8ad6") : t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_0727d139")}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => patchWorkspace(workspaceId, { showSyncPreview: !showSyncPreview })}
                      >
                        {showSyncPreview ? t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_68a9544b") : t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_3387fad0")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => patchWorkspace(workspaceId, { showJsonPreview: !showJsonPreview })}
                      >
                        {showJsonPreview ? t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_37bef097") : t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_20f216ee")}
                      </Button>
                    </div>

                    {showSyncPreview ? (
                      <div className="structured-sync-preview-list space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs md:max-h-64 md:overflow-auto">
                        {syncPreview.items.map((item) => (
                          <div
                            key={`${item.action}-${item.chapterOrder}-${item.nextTitle}`}
                            className="rounded-lg border border-border/70 bg-background/80 p-2.5"
                          >
                            <div className="font-medium">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_d9dcae98")}</div>
                            <div className="text-muted-foreground">{t("gen.pages.novels.components.StructuredOutlineWorkspace.gen_cb699a62")}</div>
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
                    当前章节规划先以“选章 + 细化”为主。批量补任务单、连接差异和 JSON 预览默认收起，避免打断主流程。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>
      </CardContent>
    </Card>
  );
}
