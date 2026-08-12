import i18next from "i18next";
import { useTranslation } from "react-i18next";
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
  formatBeatDisplayLabel,
  getBeatSheetRequiredChapterCount,
} from "./structuredOutlineWorkspace.shared";
import type { StructuredTabViewProps } from "./NovelEditView.types";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type StructuredBeat = StructuredTabViewProps["beatSheets"][number]["beats"][number];

function actionLabel(action: StructuredTabViewProps["syncPreview"]["items"][number]["action"]) {
  if (action === "create") return i18next.t("dict.gen_66ab5e9f");
  if (action === "update") return i18next.t("dict.gen_32ac152b");
  if (action === "move") return i18next.t("dict.gen_68d982a1");
  if (action === "keep") return i18next.t("dict.preserve");
  if (action === "delete") return i18next.t("dict.gen_2f4aaddd");
  return i18next.t("dict.gen_47e11ee8");
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
    return i18next.t("dict.gen_c5a0b619");
  }
  if (selectedBeat) {
    const beatLabel = formatBeatDisplayLabel(selectedBeat);
    return selectedChapter
      ? i18next.t("novels.structuredOutlineWorkspace.niaoux", { val1: beatLabel, val2: visibleChapterCount, val3: selectedChapter.chapterOrder })
      : i18next.t("novels.structuredOutlineWorkspace.4wa12h", { val1: beatLabel, val2: visibleChapterCount });
  }
  return i18next.t("novels.structuredOutlineWorkspace.cfv2fr", { val1: totalChapterCount });
}

function chapterMatchesSelection(chapter: StructuredChapter, selectedId: string): boolean {
  return chapter.id === selectedId || chapter.chapterId === selectedId;
}

export default function StructuredOutlineWorkspace(props: StructuredTabViewProps) {
  const { t } = useTranslation();
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
  const draftedChapterIds = new Set(
    executionChapters
      .filter((chapter) => Boolean(chapter.content?.trim()))
      .map((chapter) => chapter.id),
  );
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
    { key: "all", label: i18next.t("dict.gen_ff3145ff") },
    ...(selectedBeatSheet?.beats.map((beat) => ({ key: beat.key, label: formatBeatDisplayLabel(beat) })) ?? []),
  ];
  const tensionCurveSeries: TensionCurveSeries[] = selectedVolume
    ? [{
      id: "conflictLevel",
      label: i18next.t("dict.gen_3e85c65a"),
      color: "#2563eb",
      editable: true,
      points: selectedVolumeChapters.map((chapter) => ({
        id: chapter.id,
        chapterOrder: chapter.chapterOrder,
        title: chapter.title || i18next.t("tensionCurve.tensionCurveChapterDetailSidebar.xrxssk", { val1: chapter.chapterOrder }),
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
        <CardHeader><CardTitle>{i18next.t("home.pacingChapters")}</CardTitle></CardHeader>
        <CardContent className="space-y-4 px-0">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <span>{i18next.t("dict.gen_9f9804e8")}</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>{i18next.t("dict.gen_ef2c69b9")}</Button>
            </div>
          ) : null}
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{i18next.t("dict.gen_6fc6f465")}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="flex flex-col gap-4 rounded-2xl bg-muted/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>{i18next.t("home.pacingChapters")}</CardTitle>
          <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_471bc6a3")}</div>
        </div>
        <Button variant="secondary" onClick={onSave} disabled={isSaving}>
          {isSaving ? "保存中..." : "保存卷工作区"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 px-0 pt-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

        {directorTakeoverEntry ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_7802ca88")}</div>
              <div className="text-sm text-muted-foreground">{i18next.t("novels.structuredOutlineWorkspace.ywqxnm")}</div>
            </div>
            <div className="shrink-0">
              {directorTakeoverEntry}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">{i18next.t("dict.gen_7fa6741a")}</Badge> : null}
          <Badge variant="outline">当前：第{selectedVolume.sortOrder}卷</Badge>
          <Badge variant="outline">{selectedVolumeChapters.length}章</Badge>
          <Badge variant="outline">{refinedChapterCount}/{Math.max(selectedVolumeChapters.length, 1)} 已细化</Badge>
        </div>

        <div className="rounded-2xl bg-primary/5 px-4 py-3 text-sm text-foreground">
          {workspaceGuidance}
        </div>

        <TensionCurvePanel
          title={i18next.t("dict.gen_620e5a0e")}
          subtitle="查看当前卷冲突强度走向；手动固定点会作为后续拆章、细化和重规划的约束。"
          series={tensionCurveSeries}
          viewportOptions={tensionCurveViewportOptions}
          selectedViewportKey={selectedBeatKey}
          onViewportChange={(key) => patchWorkspace(workspaceId, { selectedBeatKey: key })}
          onRequestEdit={() => setTensionCurveDialogOpen(true)}
        />

        <TensionCurveEditDialog
          open={tensionCurveDialogOpen}
          onOpenChange={setTensionCurveDialogOpen}
          title={i18next.t("dict.gen_15915af4")}
          description={i18next.t("dict.gen_3074c331")}
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
            title: chapter.title || i18next.t("tensionCurve.tensionCurveChapterDetailSidebar.xrxssk", { val1: chapter.chapterOrder }),
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

        {!strategyPlan ? <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">{i18next.t("dict.gen_99777540")}</div> : null}
        {syncMessage ? <div className="text-xs text-muted-foreground">{syncMessage}</div> : null}
        {locked ? <div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">{i18next.t("dict.gen_60fea0bb")}</div> : null}

        <Card className="border-0 bg-muted/15 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">{i18next.t("dict.gen_f2294d81")}</CardTitle>
              <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_0d93d85a")}</div>
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
                      <Badge variant={isSelected ? "default" : "outline"}>第{volume.sortOrder}卷</Badge>
                      {volumeBeatSheet ? <Badge variant="secondary">{i18next.t("dict.gen_39ecb71d")}</Badge> : <Badge variant="outline">{i18next.t("dict.gen_fc79de31")}</Badge>}
                    </div>
                    <div className="mt-2 line-clamp-1 text-sm font-medium">{volume.title || i18next.t("novels.outlineCurrentVolumeWorkspace.xrxl0b", { val1: volume.sortOrder })}</div>
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
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                draftedChapterIds={draftedChapterIds}
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
                    <CardTitle className="text-base">{i18next.t("dict.gen_7297e792")}</CardTitle>
                    <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_454bd656")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={hasMissingChapterLinks ? "outline" : "secondary"}>
                      {linkedChapterCount}/{Math.max(allPlannedChapters.length, 1)} 已连接
                    </Badge>
                    <Badge variant="outline">执行区 {executionChapterCount} 章</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patchWorkspace(workspaceId, { showSyncPanel: !showSyncPanel })}
                    >
                      {showSyncPanel ? "收起诊断" : "查看连接"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showSyncPanel ? (
                  <>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
                        <input type="checkbox" checked={syncOptions.preserveContent} onChange={(event) => onSyncOptionsChange({ preserveContent: event.target.checked })} />{i18next.t("novels.structuredOutlineWorkspace.64yqx5")}</label>
                      <label className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5">
                        <input type="checkbox" checked={syncOptions.applyDeletes} onChange={(event) => onSyncOptionsChange({ applyDeletes: event.target.checked })} />{i18next.t("novels.structuredOutlineWorkspace.8qluak")}</label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => onApplyBatch({ conflictLevel: 60 })}>{i18next.t("novels.structuredOutlineWorkspace.95m5e4")}</Button>
                      <Button size="sm" variant="outline" onClick={() => onApplyBatch({ targetWordCount: 2500 })}>{i18next.t("novels.structuredOutlineWorkspace.pzk3zd")}</Button>
                      <AiButton size="sm" onClick={() => onApplyBatch({ generateTaskSheet: true })}>{i18next.t("novels.structuredOutlineWorkspace.m07mkg")}</AiButton>
                      <Button onClick={() => onApplySync(syncOptions)} disabled={isApplyingSync}>
                        {isApplyingSync ? "修复中..." : "修复章节连接"}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => patchWorkspace(workspaceId, { showSyncPreview: !showSyncPreview })}
                      >
                        {showSyncPreview ? "隐藏连接差异" : "查看连接差异"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => patchWorkspace(workspaceId, { showJsonPreview: !showJsonPreview })}
                      >
                        {showJsonPreview ? "隐藏 JSON" : "查看 JSON"}
                      </Button>
                    </div>

                    {showSyncPreview ? (
                      <div className="structured-sync-preview-list space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs md:max-h-64 md:overflow-auto">
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
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{i18next.t("novels.structuredOutlineWorkspace.9tzk57")}</div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>
      </CardContent>
    </Card>
  );
}
