import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BookPayoffLedgerCard from "./BookPayoffLedgerCard";
import CollapsibleSummary from "./CollapsibleSummary";
import WorldInjectionHint from "./WorldInjectionHint";
import type { OutlineTabViewProps } from "./NovelEditView.types";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";
import SelectControl from "@/components/common/SelectControl";
import OutlineCurrentVolumeWorkspace from "./outline/OutlineCurrentVolumeWorkspace";
import OutlineResourceCommitments from "./outline/OutlineResourceCommitments";
import type { VolumeBeatImpactItem } from "@ai-novel/shared/types/novel";

type OutlineWorkspaceTab = "current" | "strategy" | "assets";

function versionStatusLabel(status: "draft" | "active" | "frozen"): string {
  if (status === "active") return i18next.t("dict.gen_30ce1021");
  if (status === "frozen") return i18next.t("dict.gen_92cff461");
  return i18next.t("common.draft");
}

function versionStatusVariant(status: "draft" | "active" | "frozen"): "secondary" | "outline" | "default" {
  if (status === "active") return "default";
  if (status === "frozen") return "outline";
  return "secondary";
}

const readinessSteps = [
  {
    key: "canGenerateStrategy",
    label: i18next.t("dict.gen_be3a0f6a"),
    description: i18next.t("dict.gen_38ff6e20"),
  },
  {
    key: "canGenerateSkeleton",
    label: i18next.t("dict.gen_ef49d40c"),
    description: i18next.t("dict.gen_0301d3fb"),
  },
  {
    key: "canGenerateBeatSheet",
    label: i18next.t("dict.gen_2833fa42"),
    description: i18next.t("dict.gen_4f752a5c"),
  },
  {
    key: "canGenerateChapterList",
    label: i18next.t("dict.gen_df158c86"),
    description: i18next.t("dict.gen_53ca1beb"),
  },
] as const;

function getNextOutlineAction(readiness: OutlineTabViewProps["readiness"]): string {
  if (!readiness.canGenerateStrategy) return i18next.t("dict.gen_3a72a2c1");
  if (!readiness.canGenerateSkeleton) return i18next.t("dict.gen_90dfb1da");
  if (!readiness.canGenerateBeatSheet) return i18next.t("dict.gen_9ac0d332");
  if (!readiness.canGenerateChapterList) return i18next.t("dict.gen_95eb1ea6");
  return i18next.t("dict.gen_3a1a6074");
}

function getVolumeScaleProfileLabel(profile: OutlineTabViewProps["volumeCountGuidance"]["volumeScaleProfile"]): string {
  const labels: Record<OutlineTabViewProps["volumeCountGuidance"]["volumeScaleProfile"], string> = {
    short: "短篇结构",
    compact: "紧凑中篇",
    standard: "标准长篇",
    long: "长篇展开",
    epic: "大长篇",
    mega: "超长篇",
  };
  return labels[profile] ?? "结构建议";
}

function getBeatImpactStatusLabel(status: VolumeBeatImpactItem["status"]): string {
  if (status === "locked_with_draft") return i18next.t("novels.structuredChapterListCard.cr9lhw");
  if (status === "pending") return i18next.t("dict.gen_418dde27");
  return i18next.t("novels.outlineTab.9rnq4p");
}

function getBeatImpactStatusVariant(status: VolumeBeatImpactItem["status"]): "secondary" | "outline" | "default" {
  if (status === "locked_with_draft") return "secondary";
  if (status === "pending") return "outline";
  return "default";
}

function formatBeatChapterOrders(chapterOrders: number[]): string {
  if (chapterOrders.length === 0) {
    return i18next.t("novels.outlineTab.xigchk");
  }
  const sorted = chapterOrders.slice().sort((left, right) => left - right);
  return sorted[0] === sorted[sorted.length - 1]
    ? `第 ${sorted[0]} 章`
    : `第 ${sorted[0]}-${sorted[sorted.length - 1]} 章`;
}

export default function OutlineTab(props: OutlineTabViewProps) {
  const { t } = useTranslation();
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
  const [workspaceTab, setWorkspaceTab] = useState<OutlineWorkspaceTab>("current");
  const volumeCountModeLabel = volumeCountGuidance.userPreferredVolumeCount != null
    ? `当前固定 ${volumeCountGuidance.userPreferredVolumeCount} 卷`
    : volumeCountGuidance.respectedExistingVolumeCount != null
      ? `当前沿用草稿 ${volumeCountGuidance.respectedExistingVolumeCount} 卷`
      : `当前按系统建议 ${volumeCountGuidance.systemRecommendedVolumeCount} 卷`;
  const volumeScaleProfileLabel = getVolumeScaleProfileLabel(volumeCountGuidance.volumeScaleProfile);

  useEffect(() => {
    if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
      setSelectedVolumeId(volumes[0]?.id ?? "");
    }
  }, [selectedVolumeId, volumes]);

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? volumes[0];

  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title={i18next.t("dict.takeoverStrategyVolume")}
        description={i18next.t("dict.aiCheckVolumeStrategyAndSkeleton")}
        entry={props.directorTakeoverEntry}
      />
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
      <div className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.38)_100%)] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{i18next.t("novels.outlineTab.2wpgil")}</h2>
              <Badge variant={outlineStageReady ? "default" : "outline"}>
                {completedReadinessCount}/{readinessSteps.length} 已就绪
              </Badge>
              {hasUnsavedVolumeDraft ? <Badge variant="secondary">{i18next.t("dict.gen_7fa6741a")}</Badge> : null}
            </div>
            <div className="max-w-3xl text-sm leading-6 text-muted-foreground">{i18next.t("novels.outlineTab.330kwo")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiButton variant="outline" onClick={onGenerateStrategy} disabled={isGeneratingStrategy}>
              {isGeneratingStrategy ? "生成中..." : "生成卷战略建议"}
            </AiButton>
            <AiButton variant="outline" onClick={onCritiqueStrategy} disabled={isCritiquingStrategy || !strategyPlan}>
              {isCritiquingStrategy ? "审查中..." : "AI审查卷战略"}
            </AiButton>
            <AiButton onClick={onGenerateSkeleton} disabled={isGeneratingSkeleton || !readiness.canGenerateSkeleton}>
              {isGeneratingSkeleton ? "生成中..." : volumes.length > 0 ? "重生成全书卷骨架" : "生成全书卷骨架"}
            </AiButton>
            <Button variant="secondary" onClick={onSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存卷工作区"}
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span>{i18next.t("dict.gen_341c6030")}</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>{i18next.t("dict.gen_ef2c69b9")}</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">{i18next.t("dict.gen_7fa6741a")}</Badge> : null}
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <Card className="self-start border-0 bg-muted/15 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">{i18next.t("dict.gen_2b46d6ca")}</CardTitle>
                  <Badge variant={outlineStageReady ? "default" : "outline"}>
                    {completedReadinessCount}/{readinessSteps.length} 已就绪
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_9ff48c30")}</div>
                  <div className="mt-1 font-medium text-foreground">{nextOutlineAction}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${readinessProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {outlineStageReady
                      ? "当前卷战略阶段已经具备完整推进条件。"
                      : readiness.blockingReasons.length > 0
                        ? `还有 ${readiness.blockingReasons.length} 项阻塞条件需要处理。`
                        : "当前可以继续推进本阶段。"}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {readinessSteps.map((item) => (
                    <div key={item.key} className="rounded-xl bg-background/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{item.label}</div>
                        <Badge variant={readiness[item.key] ? "default" : "outline"}>
                          {readiness[item.key] ? "已就绪" : "未就绪"}
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
                  <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{i18next.t("novels.outlineTab.4pr366")}</div>
                )}
                {volumeMessage ? <div className="text-xs text-muted-foreground">{volumeMessage}</div> : null}
              </CardContent>
            </Card>

            <details className="group border-t border-border/60 pt-4">
              <summary className="cursor-pointer list-none">
                <CollapsibleSummary
                  title={i18next.t("dict.gen_35e25adc")}
                  description={i18next.t("dict.gen_d9a6d0d6")}
                  meta={<Badge variant="outline">{volumeCountModeLabel}</Badge>}
                />
              </summary>

              <div className="mt-4 space-y-3">
                <Card className="self-start border-0 bg-muted/15 shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base">{i18next.t("dict.gen_197bb5c2")}</CardTitle>
                      <Badge variant="outline">{volumeCountModeLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_e9fd5ff1")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.chapterBudget} 章</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{i18next.t("novels.outlineTab.kprudb")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.decisionVolumeCountRange.min}-{volumeCountGuidance.decisionVolumeCountRange.max} 卷
                        </div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_3f61fa36")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.systemRecommendedVolumeCount} 卷</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_b027af2e")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.hardPlannedVolumeRange.min}-{volumeCountGuidance.hardPlannedVolumeRange.max} 卷
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
                      当前结构档位：{volumeScaleProfileLabel}。{volumeCountGuidance.volumeCountRationale}
                      章节预算仍会参考 {volumeCountGuidance.targetChapterRange.min}-{volumeCountGuidance.targetChapterRange.max} 章 / 卷，
                      但系统会优先按阶段承诺、卖点切换、局面升级和阶段兑现来建议卷数。
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={customVolumeCountEnabled ? "default" : "outline"}
                        onClick={() => onCustomVolumeCountEnabledChange(!customVolumeCountEnabled)}
                      >
                        {customVolumeCountEnabled ? "收起自定义卷数" : "自定义卷数"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={onRestoreSystemRecommendedVolumeCount}>{i18next.t("novels.outlineTab.sa5a3h")}</Button>
                    </div>

                    {customVolumeCountEnabled ? (
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_auto_auto] sm:items-end">
                          <label className="space-y-1 text-sm">
                            <span className="text-xs text-muted-foreground">{i18next.t("dict.gen_8ee917f8")}</span>
                            <input
                              type="number"
                              min={volumeCountGuidance.allowedVolumeCountRange.min}
                              max={volumeCountGuidance.allowedVolumeCountRange.max}
                              className="w-full rounded-md border bg-background p-2"
                              value={customVolumeCountInput}
                              onChange={(event) => onCustomVolumeCountInputChange(event.target.value)}
                            />
                          </label>
                          <Button size="sm" onClick={onApplyCustomVolumeCount}>{i18next.t("dict.gen_ccaccd00")}</Button>
                          <div className="text-xs text-muted-foreground">
                            允许范围：{volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} 卷。固定卷数会覆盖结构建议。
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
                        <CardTitle className="text-base">{i18next.t("dict.gen_cc89ccce")}</CardTitle>
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
                title={i18next.t("dict.gen_1306a800")}
                description={i18next.t("dict.gen_9a10e283")}
              />
            </summary>

            <div className="mt-4 space-y-3">
              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{i18next.t("dict.gen_6ca5b6b6")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea className="min-h-[220px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{i18next.t("dict.gen_e9a2d9e3")}</CardTitle>
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
                          <div className="text-xs text-muted-foreground">创建时间：{new Date(selectedVersion.createdAt).toLocaleString()}</div>
                          <div className="mt-1 line-clamp-4 text-xs text-muted-foreground">{selectedVersion.diffSummary || "暂无差异摘要"}</div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_b738326a")}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onCreateDraftVersion} disabled={isCreatingDraftVersion || volumes.length === 0}>
                      {isCreatingDraftVersion ? "保存中..." : "保存为草稿版本"}
                    </Button>
                    <Button variant="outline" onClick={onLoadSelectedVersionToDraft} disabled={!selectedVersionId}>{i18next.t("dict.gen_f661191d")}</Button>
                    <Button variant="secondary" onClick={onActivateVersion} disabled={isActivatingVersion || !selectedVersionId}>
                      {isActivatingVersion ? "生效中..." : "设为生效版"}
                    </Button>
                    <Button variant="outline" onClick={onFreezeVersion} disabled={isFreezingVersion || !selectedVersionId}>
                      {isFreezingVersion ? "冻结中..." : "冻结当前版本"}
                    </Button>
                    <Button variant="outline" onClick={onLoadVersionDiff} disabled={isLoadingVersionDiff || !selectedVersionId}>
                      {isLoadingVersionDiff ? "加载中..." : "查看版本差异"}
                    </Button>
                  </div>
                  {diffResult ? (
                    <div className="rounded-md border p-2 text-xs">
                      <div className="font-medium">差异预览 V{diffResult.version}</div>
                      <div className="text-muted-foreground">变更卷 {diffResult.changedVolumeCount} | 波及章节 {diffResult.changedChapterCount} | 变更行数 {diffResult.changedLines}</div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">{i18next.t("dict.gen_e8540d99")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <AiButton variant="outline" onClick={onAnalyzeDraftImpact} disabled={isAnalyzingDraftImpact || volumes.length === 0}>
                      {isAnalyzingDraftImpact ? "分析中..." : "分析当前草稿"}
                    </AiButton>
                    <AiButton variant="outline" onClick={onAnalyzeVersionImpact} disabled={isAnalyzingVersionImpact || !selectedVersionId}>
                      {isAnalyzingVersionImpact ? "分析中..." : "分析当前版本"}
                    </AiButton>
                  </div>
                  {impactResult ? (
                    <div className="space-y-3 rounded-md border p-3 text-xs">
                      <div className="font-medium">{i18next.t("dict.gen_274b40e6")}</div>
                      <div className="text-muted-foreground">影响卷 {impactResult.affectedVolumeCount} | 波及章节 {impactResult.affectedChapterCount} | 变更行数 {impactResult.changedLines}</div>
                      {impactResult.affectedBeats && impactResult.affectedBeats.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {impactResult.defaultImpactAction ? <Badge variant="default">{impactResult.defaultImpactAction}</Badge> : null}
                            {typeof impactResult.staleBeatCount === "number" ? <Badge variant="outline">未写段 {impactResult.staleBeatCount}</Badge> : null}
                            {typeof impactResult.lockedBeatCount === "number" && impactResult.lockedBeatCount > 0 ? (
                              <Badge variant="secondary">锁定段 {impactResult.lockedBeatCount}</Badge>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            {impactResult.affectedBeats.slice(0, 8).map((beat) => (
                              <div key={`${beat.volumeId}-${beat.beatKey}`} className="rounded-md bg-background/70 p-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">第{beat.volumeOrder}卷 · {beat.beatLabel}{beat.beatTitle ? ` · ${beat.beatTitle}` : ""}</span>
                                  <Badge variant={getBeatImpactStatusVariant(beat.status)}>
                                    {getBeatImpactStatusLabel(beat.status)}
                                  </Badge>
                                </div>
                                <div className="mt-1 text-muted-foreground">{formatBeatChapterOrders(beat.chapterOrders)}</div>
                              </div>
                            ))}
                          </div>
                          {impactResult.advancedImpactActions && impactResult.advancedImpactActions.length > 0 ? (
                            <div className="text-muted-foreground">
                              高级动作：{impactResult.advancedImpactActions.join(" / ")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_a94f04e0")}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </details>
        </div>

        <Tabs value={workspaceTab} onValueChange={(value) => setWorkspaceTab(value as OutlineWorkspaceTab)} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start bg-muted/60 p-1">
            <TabsTrigger value="current">{i18next.t("novels.outlineTab.ed3kt")}</TabsTrigger>
            <TabsTrigger value="strategy">{i18next.t("novels.outlineTab.cv2rqy")}</TabsTrigger>
            <TabsTrigger value="assets">{i18next.t("novels.outlineTab.i5kfx8")}</TabsTrigger>
          </TabsList>

        <TabsContent value="strategy" className="mt-0 space-y-4">
        <Card className="border-0 bg-muted/15 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">{i18next.t("dict.gen_72852faa")}</CardTitle>
                <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_434d22e8")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {strategyPlan ? (
                  <>
                    <Badge variant="outline">推荐 {strategyPlan.recommendedVolumeCount} 卷</Badge>
                    <Badge variant="secondary">硬规划 {strategyPlan.hardPlannedVolumeCount} 卷</Badge>
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
                    <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_aa57c00f")}</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.readerRewardLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">{i18next.t("dict.gen_c8b6fdbc")}</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.escalationLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">{i18next.t("dict.midTurn")}</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.midpointShift}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
                  <div className="text-xs">{i18next.t("dict.gen_659ff89a")}</div>
                  <div className="mt-2 leading-6">
                    {strategyPlan.volumes
                      .map((volume) => `第${volume.sortOrder}卷：${volume.roleLabel}，${volume.coreReward}`)
                      .join("；")}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">{i18next.t("novels.outlineTab.q5loom")}</div>
            )}
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-0 space-y-4">
        <BookPayoffLedgerCard
          latestStateSnapshot={latestStateSnapshot}
          payoffLedger={payoffLedger}
        />

        <OutlineResourceCommitments
          selectedVolume={selectedVolume}
          resources={characterResources}
        />
        </TabsContent>

        <TabsContent value="current" className="mt-0">
          <OutlineCurrentVolumeWorkspace
            selectedVolume={selectedVolume}
            strategyPlan={strategyPlan}
            volumes={volumes}
            onSelectedVolumeChange={setSelectedVolumeId}
            onAddVolume={onAddVolume}
            onRemoveVolume={onRemoveVolume}
            onMoveVolume={onMoveVolume}
            onVolumeFieldChange={onVolumeFieldChange}
            onOpenPayoffsChange={onOpenPayoffsChange}
            onGoToStructuredTab={onGoToStructuredTab}
          />
        </TabsContent>
        </Tabs>
      </div>
      </section>
    </div>
  );
}
