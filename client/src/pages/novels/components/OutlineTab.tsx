import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useState } from "react";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BookPayoffLedgerCard from "./BookPayoffLedgerCard";
import CollapsibleSummary from "./CollapsibleSummary";
import WorldInjectionHint from "./WorldInjectionHint";
import VolumePayoffOverviewCard from "./VolumePayoffOverviewCard";
import type { OutlineTabViewProps } from "./NovelEditView.types";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import TensionCurvePanel, { type TensionCurveSeries } from "@/components/tensionCurve/TensionCurvePanel";
import SelectControl from "@/components/common/SelectControl";

type OutlineCharacterResource = NonNullable<OutlineTabViewProps["characterResources"]>[number];

function versionStatusLabel(status: "draft" | "active" | "frozen"): string {
  if (status === "active") return t("gen.pages.novels.components.OutlineTab.gen_30ce1021");
  if (status === "frozen") return t("gen.pages.novels.components.OutlineTab.gen_92cff461");
  return t("gen.pages.novels.components.OutlineTab.gen_22b4334f");
}

function versionStatusVariant(status: "draft" | "active" | "frozen"): "secondary" | "outline" | "default" {
  if (status === "active") return "default";
  if (status === "frozen") return "outline";
  return "secondary";
}

const readinessSteps = [
  {
    key: "canGenerateStrategy",
    label: t("gen.pages.novels.components.OutlineTab.gen_be3a0f6a"),
    description: t("gen.pages.novels.components.OutlineTab.gen_38ff6e20"),
  },
  {
    key: "canGenerateSkeleton",
    label: t("gen.pages.novels.components.OutlineTab.gen_ef49d40c"),
    description: t("gen.pages.novels.components.OutlineTab.gen_0301d3fb"),
  },
  {
    key: "canGenerateBeatSheet",
    label: t("gen.pages.novels.components.OutlineTab.gen_2833fa42"),
    description: t("gen.pages.novels.components.OutlineTab.gen_4f752a5c"),
  },
  {
    key: "canGenerateChapterList",
    label: t("gen.pages.novels.components.OutlineTab.gen_df158c86"),
    description: t("gen.pages.novels.components.OutlineTab.gen_53ca1beb"),
  },
] as const;

function getNextOutlineAction(readiness: OutlineTabViewProps["readiness"]): string {
  if (!readiness.canGenerateStrategy) return t("gen.pages.novels.components.OutlineTab.gen_3a72a2c1");
  if (!readiness.canGenerateSkeleton) return t("gen.pages.novels.components.OutlineTab.gen_90dfb1da");
  if (!readiness.canGenerateBeatSheet) return t("gen.pages.novels.components.OutlineTab.gen_9ac0d332");
  if (!readiness.canGenerateChapterList) return t("gen.pages.novels.components.OutlineTab.gen_95eb1ea6");
  return t("gen.pages.novels.components.OutlineTab.gen_3a1a6074");
}

function getResourceStatusLabel(status: OutlineCharacterResource["status"]): string {
  const labels: Record<OutlineCharacterResource["status"], string> = {
    available: t("gen.pages.novels.components.OutlineTab.gen_ad6b7038"),
    hidden: t("gen.pages.novels.components.OutlineTab.gen_dce5379c"),
    borrowed: t("gen.pages.novels.components.OutlineTab.gen_5d971fd1"),
    transferred: t("gen.pages.novels.components.OutlineTab.gen_6c17ffcd"),
    lost: t("gen.pages.novels.components.OutlineTab.gen_365cbe81"),
    consumed: t("gen.pages.novels.components.OutlineTab.gen_67d4508d"),
    damaged: t("gen.pages.novels.components.OutlineTab.gen_a6d66917"),
    destroyed: t("gen.pages.novels.components.OutlineTab.gen_a208527a"),
    stale: t("gen.pages.novels.components.OutlineTab.gen_8c90bea6"),
  };
  return labels[status] ?? status;
}

function getVolumeResourceWindow(resource: OutlineCharacterResource): string {
  if (resource.expectedUseStartChapterOrder || resource.expectedUseEndChapterOrder) {
    return `预计第${resource.expectedUseStartChapterOrder ?? "?"}章至第${resource.expectedUseEndChapterOrder ?? "?"}章使用`;
  }
  if (resource.lastTouchedChapterOrder) {
    return `最近触达第${resource.lastTouchedChapterOrder}章`;
  }
  return t("gen.pages.novels.components.OutlineTab.gen_589bead6");
}

function isResourceRelevantToVolume(
  resource: OutlineCharacterResource,
  selectedVolume: OutlineTabViewProps["volumes"][number] | undefined,
): boolean {
  if (!selectedVolume || selectedVolume.chapters.length === 0) {
    return resource.expectedUseEndChapterOrder != null
      || resource.narrativeFunction === "promise"
      || resource.narrativeFunction === "hidden_card";
  }
  const orders = selectedVolume.chapters.map((chapter) => chapter.chapterOrder);
  const start = Math.min(...orders);
  const end = Math.max(...orders);
  const resourceStart = resource.expectedUseStartChapterOrder ?? resource.lastTouchedChapterOrder ?? start;
  const resourceEnd = resource.expectedUseEndChapterOrder ?? resourceStart;
  const overlapsVolume = resourceStart <= end && resourceEnd >= start;
  return overlapsVolume
    || resource.narrativeFunction === "promise"
    || resource.narrativeFunction === "hidden_card";
}

function VolumeResourceCommitmentCard(props: {
  selectedVolume: OutlineTabViewProps["volumes"][number] | undefined;
  resources: OutlineCharacterResource[];
}) {
  const relevantResources = props.resources
    .filter((resource) => isResourceRelevantToVolume(resource, props.selectedVolume))
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_f6a53b87")}</CardTitle>
        <div className="text-sm text-muted-foreground">
          只显示会影响本卷行动边界、铺垫或后续兑现的资源。
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {relevantResources.length > 0 ? (
          relevantResources.map((resource) => (
            <div key={resource.id} className="rounded-xl border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 text-sm font-medium text-foreground">{resource.name}</div>
                <Badge variant={resource.status === "available" || resource.status === "borrowed" ? "outline" : "secondary"}>
                  {getResourceStatusLabel(resource.status)}
                </Badge>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{resource.summary}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {resource.holderCharacterName ? <Badge variant="outline">{resource.holderCharacterName}</Badge> : null}
                <Badge variant="outline">{getVolumeResourceWindow(resource)}</Badge>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            当前卷没有需要特别盯住的角色资源承诺。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OutlineTab(props: OutlineTabViewProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange,
    onCustomVolumeCountInputChange,
    onApplyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount,
    strategyPlan,
    critiqueReport,
    isGeneratingStrategy,
    onGenerateStrategy,
    isCritiquingStrategy,
    onCritiqueStrategy,
    isGeneratingSkeleton,
    onGenerateSkeleton,
    onGoToCharacterTab,
    onGoToStructuredTab,
    latestStateSnapshot,
    payoffLedger,
    characterResources = [],
    draftText,
    volumes,
    onVolumeFieldChange,
    onOpenPayoffsChange,
    onAddVolume,
    onRemoveVolume,
    onMoveVolume,
    onSave,
    isSaving,
    volumeMessage,
    volumeVersions,
    selectedVersionId,
    onSelectedVersionChange,
    onCreateDraftVersion,
    isCreatingDraftVersion,
    onLoadSelectedVersionToDraft,
    onActivateVersion,
    isActivatingVersion,
    onFreezeVersion,
    isFreezingVersion,
    onLoadVersionDiff,
    isLoadingVersionDiff,
    diffResult,
    onAnalyzeDraftImpact,
    isAnalyzingDraftImpact,
    onAnalyzeVersionImpact,
    isAnalyzingVersionImpact,
    impactResult,
  } = props;

  const selectedVersion = volumeVersions.find((item) => item.id === selectedVersionId);
  const completedReadinessCount = readinessSteps.filter((item) => readiness[item.key]).length;
  const readinessProgress = Math.round((completedReadinessCount / Math.max(readinessSteps.length, 1)) * 100);
  const nextOutlineAction = getNextOutlineAction(readiness);
  const outlineStageReady = completedReadinessCount === readinessSteps.length;
  const [selectedVolumeId, setSelectedVolumeId] = useState(volumes[0]?.id ?? "");
  const volumeCountModeLabel = volumeCountGuidance.userPreferredVolumeCount != null
    ? `当前固定 ${volumeCountGuidance.userPreferredVolumeCount} 卷`
    : volumeCountGuidance.respectedExistingVolumeCount != null
      ? `当前沿用草稿 ${volumeCountGuidance.respectedExistingVolumeCount} 卷`
      : `当前按系统建议 ${volumeCountGuidance.systemRecommendedVolumeCount} 卷`;

  useEffect(() => {
    if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
      setSelectedVolumeId(volumes[0]?.id ?? "");
    }
  }, [selectedVolumeId, volumes]);

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? volumes[0];
  const selectedStrategyVolume = selectedVolume
    ? strategyPlan?.volumes.find((item) => item.sortOrder === selectedVolume.sortOrder) ?? null
    : null;
  const tensionCurveSeries: TensionCurveSeries[] = selectedVolume
    ? [
        {
          id: "conflictLevel",
          label: t("gen.pages.novels.components.OutlineTab.gen_3e85c65a"),
          color: "#2563eb",
          points: selectedVolume.chapters.map((chapter) => ({
            id: chapter.id,
            chapterOrder: chapter.chapterOrder,
            title: chapter.title || `第${chapter.chapterOrder}章`,
            value: typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : null,
            source: chapter.conflictLevelSource ?? "ai",
          })),
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <DirectorTakeoverEntryPanel
        title={t("gen.pages.novels.components.OutlineTab.takeoverStrategyVolume")}
        description={t("gen.pages.novels.components.OutlineTab.aiCheckVolumeStrategyAndSkeleton")}
        entry={props.directorTakeoverEntry}
      />
      <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="flex flex-col gap-4 rounded-2xl bg-muted/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>{t("gen.pages.novels.components.OutlineTab.gen_ec71d83a")}</CardTitle>
          <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_c6e7400d")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AiButton variant="outline" onClick={onGenerateStrategy} disabled={isGeneratingStrategy}>
            {isGeneratingStrategy ? t("gen.pages.novels.components.OutlineTab.gen_4d020ba3") : t("gen.pages.novels.components.OutlineTab.gen_b10cd176")}
          </AiButton>
          <AiButton variant="outline" onClick={onCritiqueStrategy} disabled={isCritiquingStrategy || !strategyPlan}>
            {isCritiquingStrategy ? t("gen.pages.novels.components.OutlineTab.gen_c8972e34") : t("gen.pages.novels.components.OutlineTab.aiReviewStrategy")}
          </AiButton>
          <AiButton onClick={onGenerateSkeleton} disabled={isGeneratingSkeleton || !readiness.canGenerateSkeleton}>
            {isGeneratingSkeleton ? t("gen.pages.novels.components.OutlineTab.gen_4d020ba3") : volumes.length > 0 ? t("gen.pages.novels.components.OutlineTab.gen_2e7bfb67") : t("gen.pages.novels.components.OutlineTab.gen_e8555ad8")}
          </AiButton>
          <Button variant="secondary" onClick={onSave} disabled={isSaving}>
            {isSaving ? t("gen.pages.novels.components.OutlineTab.savingInProgressDotDotDot") : t("gen.pages.novels.components.OutlineTab.saveVolumeWorkspace")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-0 pt-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span>{t("gen.pages.novels.components.OutlineTab.gen_341c6030")}</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>{t("gen.pages.novels.components.OutlineTab.gen_ef2c69b9")}</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">{t("gen.pages.novels.components.OutlineTab.gen_7fa6741a")}</Badge> : null}
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <Card className="self-start border-0 bg-muted/15 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_2b46d6ca")}</CardTitle>
                  <Badge variant={outlineStageReady ? "default" : "outline"}>
                    {completedReadinessCount}/{readinessSteps.length} 已就绪
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_9ff48c30")}</div>
                  <div className="mt-1 font-medium text-foreground">{nextOutlineAction}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${readinessProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {outlineStageReady
                      ? t("gen.pages.novels.components.OutlineTab.gen_0f02fd5f")
                      : readiness.blockingReasons.length > 0
                        ? `还有 ${readiness.blockingReasons.length} 项阻塞条件需要处理。`
                        : t("gen.pages.novels.components.OutlineTab.gen_4f12cfa5")}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {readinessSteps.map((item) => (
                    <div key={item.key} className="rounded-xl bg-background/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{item.label}</div>
                        <Badge variant={readiness[item.key] ? "default" : "outline"}>
                          {readiness[item.key] ? t("gen.pages.novels.components.OutlineTab.gen_c30ecc7a") : t("gen.pages.novels.components.OutlineTab.gen_0a4782f3")}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div>
                    </div>
                  ))}
                </div>

                {readiness.blockingReasons.length > 0 ? (
                  <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                    {readiness.blockingReasons.map((reason) => <div key={reason}>{reason}</div>)}
                  </div>
                ) : (
                  <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
                    当前工作区已经具备继续推进的基础条件。
                  </div>
                )}
                {volumeMessage ? <div className="text-xs text-muted-foreground">{volumeMessage}</div> : null}
              </CardContent>
            </Card>

            <details className="group border-t border-border/60 pt-4">
              <summary className="cursor-pointer list-none">
                <CollapsibleSummary
                  title={t("gen.pages.novels.components.OutlineTab.gen_35e25adc")}
                  description={t("gen.pages.novels.components.OutlineTab.gen_d9a6d0d6")}
                  meta={<Badge variant="outline">{volumeCountModeLabel}</Badge>}
                />
              </summary>

              <div className="mt-4 space-y-3">
                <Card className="self-start border-0 bg-muted/15 shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_197bb5c2")}</CardTitle>
                      <Badge variant="outline">{volumeCountModeLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_e9fd5ff1")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{t("gen.pages.novels.components.OutlineTab.chapterBudgetText")}</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_0e4b36f2")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} 卷
                        </div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_3f61fa36")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{t("gen.pages.novels.components.OutlineTab.systemRecommendedVolumes")}</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_b027af2e")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.hardPlannedVolumeRange.min}-{volumeCountGuidance.hardPlannedVolumeRange.max} 卷
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
                      标准卷尺度按 {volumeCountGuidance.targetChapterRange.min}-{volumeCountGuidance.targetChapterRange.max} 章 / 卷设计，
                      理想值约 {volumeCountGuidance.targetChapterRange.ideal} 章 / 卷。超长篇默认通过增加卷数来保持每卷的阶段感、升级节点和卷级回报，不再压成少数巨卷。
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={customVolumeCountEnabled ? "default" : "outline"}
                        onClick={() => onCustomVolumeCountEnabledChange(!customVolumeCountEnabled)}
                      >
                        {customVolumeCountEnabled ? t("gen.pages.novels.components.OutlineTab.gen_923e6551") : t("gen.pages.novels.components.OutlineTab.gen_1379915c")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={onRestoreSystemRecommendedVolumeCount}>
                        恢复系统建议
                      </Button>
                    </div>

                    {customVolumeCountEnabled ? (
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_auto_auto] sm:items-end">
                          <label className="space-y-1 text-sm">
                            <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_8ee917f8")}</span>
                            <input
                              type="number"
                              min={volumeCountGuidance.allowedVolumeCountRange.min}
                              max={volumeCountGuidance.allowedVolumeCountRange.max}
                              className="w-full rounded-md border bg-background p-2"
                              value={customVolumeCountInput}
                              onChange={(event) => onCustomVolumeCountInputChange(event.target.value)}
                            />
                          </label>
                          <Button size="sm" onClick={onApplyCustomVolumeCount}>{t("gen.pages.novels.components.OutlineTab.gen_ccaccd00")}</Button>
                          <div className="text-xs text-muted-foreground">
                            允许范围：{volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} 卷
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {critiqueReport ? (
                  <Card className="self-start border-0 bg-muted/15 shadow-none">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_cc89ccce")}</CardTitle>
                        <Badge variant={critiqueReport.overallRisk === "high" ? "secondary" : critiqueReport.overallRisk === "medium" ? "outline" : "default"}>
                          风险 {critiqueReport.overallRisk}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="rounded-md border p-3 text-xs text-muted-foreground">{critiqueReport.summary}</div>
                      {critiqueReport.issues.length > 0 ? (
                        <div className="space-y-2">
                          {critiqueReport.issues.map((issue) => (
                            <div key={`${issue.targetRef}-${issue.title}`} className="rounded-md border p-3 text-xs">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{issue.targetRef}</Badge>
                                <Badge variant={issue.severity === "high" ? "secondary" : issue.severity === "medium" ? "outline" : "default"}>
                                  {issue.severity}
                                </Badge>
                              </div>
                              <div className="mt-2 font-medium">{issue.title}</div>
                              <div className="mt-1 text-muted-foreground">{issue.detail}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </details>
          </div>

          <details className="group border-t border-border/60 pt-4">
            <summary className="cursor-pointer list-none">
              <CollapsibleSummary
                title={t("gen.pages.novels.components.OutlineTab.gen_1306a800")}
                description={t("gen.pages.novels.components.OutlineTab.gen_9a10e283")}
              />
            </summary>

            <div className="mt-4 space-y-3">
              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_6ca5b6b6")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea className="min-h-[220px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_e9a2d9e3")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {volumeVersions.length > 0 ? (
                    <>
                      <SelectControl className="w-full rounded-md border bg-background p-2 text-sm" value={selectedVersionId} onChange={(event) => onSelectedVersionChange(event.target.value)}>
                        {volumeVersions.map((version) => (
                          <option key={version.id} value={version.id}>
                            V{version.version} · {versionStatusLabel(version.status)}
                          </option>
                        ))}
                      </SelectControl>
                      {selectedVersion ? (
                        <div className="rounded-md border p-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">V{selectedVersion.version}</span>
                            <Badge variant={versionStatusVariant(selectedVersion.status)}>
                              {versionStatusLabel(selectedVersion.status)}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_5a27370f")}</div>
                          <div className="mt-1 line-clamp-4 text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_selectedVe_gx2u")}</div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_b738326a")}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onCreateDraftVersion} disabled={isCreatingDraftVersion || volumes.length === 0}>
                      {isCreatingDraftVersion ? t("gen.pages.novels.components.OutlineTab.savingInProgressDotDotDot") : t("gen.pages.novels.components.OutlineTab.saveAsDraftVersion")}
                    </Button>
                    <Button variant="outline" onClick={onLoadSelectedVersionToDraft} disabled={!selectedVersionId}>{t("gen.pages.novels.components.OutlineTab.gen_f661191d")}</Button>
                    <Button variant="secondary" onClick={onActivateVersion} disabled={isActivatingVersion || !selectedVersionId}>
                      {isActivatingVersion ? t("gen.pages.novels.components.OutlineTab.gen_bba7126e") : t("gen.pages.novels.components.OutlineTab.gen_b339c1a0")}
                    </Button>
                    <Button variant="outline" onClick={onFreezeVersion} disabled={isFreezingVersion || !selectedVersionId}>
                      {isFreezingVersion ? t("gen.pages.novels.components.OutlineTab.gen_120e78fc") : t("gen.pages.novels.components.OutlineTab.gen_f6f460c0")}
                    </Button>
                    <Button variant="outline" onClick={onLoadVersionDiff} disabled={isLoadingVersionDiff || !selectedVersionId}>
                      {isLoadingVersionDiff ? t("gen.pages.novels.components.OutlineTab.gen_26b5bd49") : t("gen.pages.novels.components.OutlineTab.gen_56179dab")}
                    </Button>
                  </div>
                  {diffResult ? (
                    <div className="rounded-md border p-2 text-xs">
                      <div className="font-medium">{t("gen.pages.novels.components.OutlineTab.gen_537fd622")}</div>
                      <div className="text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_f31b3c36")}</div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_e8540d99")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <AiButton variant="outline" onClick={onAnalyzeDraftImpact} disabled={isAnalyzingDraftImpact || volumes.length === 0}>
                      {isAnalyzingDraftImpact ? t("gen.pages.novels.components.OutlineTab.gen_ee0b2c88") : t("gen.pages.novels.components.OutlineTab.gen_0f7a6c67")}
                    </AiButton>
                    <AiButton variant="outline" onClick={onAnalyzeVersionImpact} disabled={isAnalyzingVersionImpact || !selectedVersionId}>
                      {isAnalyzingVersionImpact ? t("gen.pages.novels.components.OutlineTab.gen_ee0b2c88") : t("gen.pages.novels.components.OutlineTab.gen_6636230b")}
                    </AiButton>
                  </div>
                  {impactResult ? (
                    <div className="rounded-md border p-2 text-xs">
                      <div className="font-medium">{t("gen.pages.novels.components.OutlineTab.gen_274b40e6")}</div>
                      <div className="text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_e35fea13")}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_a94f04e0")}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </details>
        </div>

        <Card className="border-0 bg-muted/15 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_72852faa")}</CardTitle>
                <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_434d22e8")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {strategyPlan ? (
                  <>
                    <Badge variant="outline">{t("gen.pages.novels.components.OutlineTab.gen_7dac2da3")}</Badge>
                    <Badge variant="secondary">{t("gen.pages.novels.components.OutlineTab.gen_80859ffd")}</Badge>
                  </>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {strategyPlan ? (
              <>
                <div className="grid gap-3 xl:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_aa57c00f")}</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.readerRewardLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_c8b6fdbc")}</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.escalationLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.midTurn")}</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.midpointShift}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
                  <div className="text-xs">{t("gen.pages.novels.components.OutlineTab.gen_659ff89a")}</div>
                  <div className="mt-2 leading-6">
                    {strategyPlan.volumes
                      .map((volume) => `第${volume.sortOrder}卷：${volume.roleLabel}，${volume.coreReward}`)
                      .join("；")}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                当前还没有卷战略建议。先点击“生成卷战略建议”。
              </div>
            )}
          </CardContent>
        </Card>

        <BookPayoffLedgerCard
          latestStateSnapshot={latestStateSnapshot}
          payoffLedger={payoffLedger}
        />

        <VolumeResourceCommitmentCard
          selectedVolume={selectedVolume}
          resources={characterResources}
        />

        <div className="grid items-start gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="self-start xl:sticky xl:top-4">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{t("gen.pages.novels.components.OutlineTab.gen_a0fa6f5c")}</CardTitle>
                  <div className="text-sm text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_dd22e3c6")}</div>
                </div>
                <Button size="sm" variant="outline" onClick={onAddVolume}>{t("gen.pages.novels.components.OutlineTab.gen_495efc7f")}</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {volumes.length > 0 ? (
                <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                  {volumes.map((volume) => {
                    const strategyVolume = strategyPlan?.volumes.find((item) => item.sortOrder === volume.sortOrder) ?? null;
                    const isSelected = selectedVolume?.id === volume.id;
                    return (
                      <button
                        key={volume.id}
                        type="button"
                        onClick={() => setSelectedVolumeId(volume.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-sky-400/70 bg-sky-50 shadow-sm ring-1 ring-sky-200"
                            : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={isSelected ? "default" : "outline"}>{t("gen.pages.novels.components.OutlineTab.gen_560e043c")}</Badge>
                          {strategyVolume ? (
                            <Badge variant={strategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                              {strategyVolume.planningMode === "hard" ? t("gen.pages.novels.components.OutlineTab.gen_d916b0ab") : t("gen.pages.novels.components.OutlineTab.gen_c1f11dc4")}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {volume.title || strategyVolume?.roleLabel || `第${volume.sortOrder}卷`}
                        </div>
                        <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {volume.summary || volume.mainPromise || strategyVolume?.coreReward || t("gen.pages.novels.components.OutlineTab.gen_b6642d4e")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  当前还没有卷骨架。先生成卷战略建议，再点击“生成全书卷骨架”。
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {selectedVolume ? (
              <>
                <VolumePayoffOverviewCard
                  selectedVolume={selectedVolume}
                />
                <TensionCurvePanel
                  title={t("gen.pages.novels.components.OutlineTab.gen_623fc2f6")}
                  subtitle={t("gen.pages.novels.components.OutlineTab.gen_342a60dd")}
                  series={tensionCurveSeries}
                  readonly
                  compact
                />
                <div className="flex justify-end">
                  <Button type="button" size="sm" variant="outline" onClick={onGoToStructuredTab}>
                    去节奏 / 拆章编辑曲线
                  </Button>
                </div>
                <Card key={selectedVolume.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{t("gen.pages.novels.components.OutlineTab.gen_a3a9007d")}</Badge>
                        {selectedStrategyVolume ? (
                          <Badge variant={selectedStrategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                            {selectedStrategyVolume.planningMode === "hard" ? t("gen.pages.novels.components.OutlineTab.gen_d916b0ab") : t("gen.pages.novels.components.OutlineTab.gen_c1f11dc4")}
                          </Badge>
                        ) : null}
                        {selectedStrategyVolume?.roleLabel ? <span className="text-sm text-muted-foreground">{selectedStrategyVolume.roleLabel}</span> : null}
                        <span className="text-sm text-muted-foreground">
                          {selectedVolume.chapters.length > 0
                            ? `章节 ${selectedVolume.chapters[0]?.chapterOrder}-${selectedVolume.chapters[selectedVolume.chapters.length - 1]?.chapterOrder}`
                            : t("gen.pages.novels.components.OutlineTab.gen_797359eb")}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, -1)} disabled={selectedVolume.sortOrder === 1}>上移</Button>
                        <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, 1)} disabled={selectedVolume.sortOrder === volumes.length}>下移</Button>
                        <Button size="sm" variant="outline" onClick={() => onRemoveVolume(selectedVolume.id)} disabled={volumes.length <= 1}>{t("gen.pages.novels.components.OutlineTab.gen_2f4aaddd")}</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_5a33e631")}</span>
                      <input className="w-full rounded-md border bg-background p-2" value={selectedVolume.title} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "title", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_4f518d8c")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.summary ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "summary", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_67523299")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.openingHook ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "openingHook", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.mainPromise")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.mainPromise ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "mainPromise", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.mainOppressor")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.primaryPressureSource ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "primaryPressureSource", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_144c6d68")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.coreSellingPoint ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "coreSellingPoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_bc363719")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.escalationMode ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "escalationMode", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.mainCharacterChange")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.protagonistChange ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "protagonistChange", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.midSectionRisk")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.midVolumeRisk ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "midVolumeRisk", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_c268bee7")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.climax ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "climax", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_057e169f")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.payoffType ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "payoffType", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.volumeHook")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.nextVolumeHook ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "nextVolumeHook", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_315e0a35")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.resetPoint ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "resetPoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.OutlineTab.gen_db7f46ca")}</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" placeholder={t("gen.pages.novels.components.OutlineTab.gen_756ea85e")} value={selectedVolume.openPayoffs.join("\n")} onChange={(event) => onOpenPayoffsChange(selectedVolume.id, event.target.value)} />
                    </label>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                左侧先选择一卷，或先生成全书卷骨架，再在这里编辑当前卷详情。
              </div>
            )}
          </div>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
