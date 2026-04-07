import { useEffect, useState } from "react";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CollapsibleSummary from "./CollapsibleSummary";
import WorldInjectionHint from "./WorldInjectionHint";
import VolumePayoffOverviewCard from "./VolumePayoffOverviewCard";
import type { OutlineTabViewProps } from "./NovelEditView.types";

function versionStatusLabel(status: "draft" | "active" | "frozen"): string {
  if (status === "active") return "已生效";
  if (status === "frozen") return "已冻结";
  return "草稿";
}

function versionStatusVariant(status: "draft" | "active" | "frozen"): "secondary" | "outline" | "default" {
  if (status === "active") return "default";
  if (status === "frozen") return "outline";
  return "secondary";
}

const readinessSteps = [
  {
    key: "canGenerateStrategy",
    label: "卷战略",
    description: "先拿到推荐卷数、硬/软规划和升级梯度。",
  },
  {
    key: "canGenerateSkeleton",
    label: "卷骨架",
    description: "确认每卷的开卷抓手、压迫源和兑现方式。",
  },
  {
    key: "canGenerateBeatSheet",
    label: "节奏板",
    description: "卷骨架稳定后，才适合进入单卷节奏拆分。",
  },
  {
    key: "canGenerateChapterList",
    label: "拆章节",
    description: "节奏板准备好后，才能继续拆到章节级别。",
  },
] as const;

function getNextOutlineAction(readiness: OutlineTabViewProps["readiness"]): string {
  if (!readiness.canGenerateStrategy) return "先生成卷战略建议";
  if (!readiness.canGenerateSkeleton) return "现在适合生成全书卷骨架";
  if (!readiness.canGenerateBeatSheet) return "卷骨架已准备好，下一步进入节奏 / 拆章";
  if (!readiness.canGenerateChapterList) return "先做当前卷节奏板，再拆当前卷章节";
  return "卷战略阶段已齐备，可以继续进入节奏 / 拆章";
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
    latestStateSnapshot,
    payoffLedger,
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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>卷战略 / 卷骨架</CardTitle>
          <div className="text-sm text-muted-foreground">先让系统帮你决定卷数和硬/软规划，再确认可继续拆节奏板的卷骨架。</div>
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
      </CardHeader>
      <CardContent className="space-y-4">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>建议先补齐角色，再生成卷战略和卷骨架。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/20 p-2 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <Card className="self-start">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">阶段就绪度</CardTitle>
                  <Badge variant={outlineStageReady ? "default" : "outline"}>
                    {completedReadinessCount}/{readinessSteps.length} 已就绪
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">推荐下一步</div>
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
                    <div key={item.key} className="rounded-xl border border-border/70 p-3">
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
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {readiness.blockingReasons.map((reason) => <div key={reason}>{reason}</div>)}
                  </div>
                ) : (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    当前工作区已经具备继续推进的基础条件。
                  </div>
                )}
                {volumeMessage ? <div className="text-xs text-muted-foreground">{volumeMessage}</div> : null}
              </CardContent>
            </Card>

            <details className="group rounded-2xl border border-border/70 bg-background/95 p-4">
              <summary className="cursor-pointer list-none">
                <CollapsibleSummary
                  title="卷数建议与策略审查"
                  description="这些属于辅助决策信息。首屏先看推荐下一步和当前卷，确实需要时再展开审查与卷数控制。"
                  meta={<Badge variant="outline">{volumeCountModeLabel}</Badge>}
                />
              </summary>

              <div className="mt-4 space-y-3">
                <Card className="self-start">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base">卷数建议</CardTitle>
                      <Badge variant="outline">{volumeCountModeLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">总章节预算</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.chapterBudget} 章</div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">推荐卷数区间</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} 卷
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">系统建议卷数</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.systemRecommendedVolumeCount} 卷</div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">默认硬规划范围</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.hardPlannedVolumeRange.min}-{volumeCountGuidance.hardPlannedVolumeRange.max} 卷
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
                      标准卷尺度按 {volumeCountGuidance.targetChapterRange.min}-{volumeCountGuidance.targetChapterRange.max} 章 / 卷设计，
                      理想值约 {volumeCountGuidance.targetChapterRange.ideal} 章 / 卷。超长篇默认通过增加卷数来保持每卷的阶段感、升级节点和卷级回报，不再压成少数巨卷。
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={customVolumeCountEnabled ? "default" : "outline"}
                        onClick={() => onCustomVolumeCountEnabledChange(!customVolumeCountEnabled)}
                      >
                        {customVolumeCountEnabled ? "收起自定义卷数" : "自定义卷数"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={onRestoreSystemRecommendedVolumeCount}>
                        恢复系统建议
                      </Button>
                    </div>

                    {customVolumeCountEnabled ? (
                      <div className="rounded-xl border border-border/70 p-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_auto_auto] sm:items-end">
                          <label className="space-y-1 text-sm">
                            <span className="text-xs text-muted-foreground">固定卷数</span>
                            <input
                              type="number"
                              min={volumeCountGuidance.allowedVolumeCountRange.min}
                              max={volumeCountGuidance.allowedVolumeCountRange.max}
                              className="w-full rounded-md border bg-background p-2"
                              value={customVolumeCountInput}
                              onChange={(event) => onCustomVolumeCountInputChange(event.target.value)}
                            />
                          </label>
                          <Button size="sm" onClick={onApplyCustomVolumeCount}>应用固定卷数</Button>
                          <div className="text-xs text-muted-foreground">
                            允许范围：{volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} 卷
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {critiqueReport ? (
                  <Card className="self-start">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">卷战略审稿</CardTitle>
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

          <details className="group rounded-2xl border border-border/70 bg-background/95 p-4">
            <summary className="cursor-pointer list-none">
              <CollapsibleSummary
                title="派生文本、版本控制与影响分析"
                description="这部分偏向收尾和对比，不是当前卷骨架编辑时必须一直盯着看的内容。"
              />
            </summary>

            <div className="mt-4 space-y-3">
              <Card className="self-start">
                <CardHeader>
                  <CardTitle className="text-base">派生文本预览</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea className="min-h-[220px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
                </CardContent>
              </Card>

              <Card className="self-start">
                <CardHeader>
                  <CardTitle className="text-base">版本控制</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {volumeVersions.length > 0 ? (
                    <>
                      <select className="w-full rounded-md border bg-background p-2 text-sm" value={selectedVersionId} onChange={(event) => onSelectedVersionChange(event.target.value)}>
                        {volumeVersions.map((version) => (
                          <option key={version.id} value={version.id}>
                            V{version.version} · {versionStatusLabel(version.status)}
                          </option>
                        ))}
                      </select>
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
                    <div className="text-xs text-muted-foreground">还没有卷版本，请先保存草稿版本。</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onCreateDraftVersion} disabled={isCreatingDraftVersion || volumes.length === 0}>
                      {isCreatingDraftVersion ? "保存中..." : "保存为草稿版本"}
                    </Button>
                    <Button variant="outline" onClick={onLoadSelectedVersionToDraft} disabled={!selectedVersionId}>覆盖当前草稿</Button>
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

              <Card className="self-start">
                <CardHeader>
                  <CardTitle className="text-base">影响分析</CardTitle>
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
                    <div className="rounded-md border p-2 text-xs">
                      <div className="font-medium">卷级影响预览</div>
                      <div className="text-muted-foreground">影响卷 {impactResult.affectedVolumeCount} | 波及章节 {impactResult.affectedChapterCount} | 变更行数 {impactResult.changedLines}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">建议在生效前先做卷级影响分析。</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </details>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">卷战略摘要</CardTitle>
                <div className="text-sm text-muted-foreground">先看整本书的卷级回报和升级路线，再在下面选择某一卷进入详细编辑。</div>
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
                    <div className="text-xs text-muted-foreground">读者回报梯度</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.readerRewardLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">升级梯度</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.escalationLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">中盘转向</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.midpointShift}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
                  <div className="text-xs">卷级节奏总览</div>
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

        <div className="grid items-start gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="self-start xl:sticky xl:top-4">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">卷导航</CardTitle>
                  <div className="text-sm text-muted-foreground">左侧用卷标题和卷描述定位当前要编辑的卷。</div>
                </div>
                <Button size="sm" variant="outline" onClick={onAddVolume}>新增卷</Button>
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
                          <Badge variant={isSelected ? "default" : "outline"}>第{volume.sortOrder}卷</Badge>
                          {strategyVolume ? (
                            <Badge variant={strategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                              {strategyVolume.planningMode === "hard" ? "硬规划" : "软规划"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {volume.title || strategyVolume?.roleLabel || `第${volume.sortOrder}卷`}
                        </div>
                        <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {volume.summary || volume.mainPromise || strategyVolume?.coreReward || "先补这卷的标题和描述，便于后续导航。"}
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
                  latestStateSnapshot={latestStateSnapshot}
                  payoffLedger={payoffLedger}
                />
                <Card key={selectedVolume.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">第{selectedVolume.sortOrder}卷</Badge>
                        {selectedStrategyVolume ? (
                          <Badge variant={selectedStrategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                            {selectedStrategyVolume.planningMode === "hard" ? "硬规划" : "软规划"}
                          </Badge>
                        ) : null}
                        {selectedStrategyVolume?.roleLabel ? <span className="text-sm text-muted-foreground">{selectedStrategyVolume.roleLabel}</span> : null}
                        <span className="text-sm text-muted-foreground">
                          {selectedVolume.chapters.length > 0
                            ? `章节 ${selectedVolume.chapters[0]?.chapterOrder}-${selectedVolume.chapters[selectedVolume.chapters.length - 1]?.chapterOrder}`
                            : "未拆章"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, -1)} disabled={selectedVolume.sortOrder === 1}>上移</Button>
                        <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, 1)} disabled={selectedVolume.sortOrder === volumes.length}>下移</Button>
                        <Button size="sm" variant="outline" onClick={() => onRemoveVolume(selectedVolume.id)} disabled={volumes.length <= 1}>删除</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="text-xs text-muted-foreground">卷标题</span>
                      <input className="w-full rounded-md border bg-background p-2" value={selectedVolume.title} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "title", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">卷摘要</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.summary ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "summary", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">开卷抓手</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.openingHook ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "openingHook", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">主承诺</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.mainPromise ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "mainPromise", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">主压迫源</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.primaryPressureSource ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "primaryPressureSource", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">核心卖点</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.coreSellingPoint ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "coreSellingPoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">升级方式</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.escalationMode ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "escalationMode", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">主角变化</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.protagonistChange ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "protagonistChange", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">中段风险</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.midVolumeRisk ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "midVolumeRisk", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">卷末高潮</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.climax ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "climax", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">兑现类型</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.payoffType ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "payoffType", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">下卷钩子</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.nextVolumeHook ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "nextVolumeHook", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">卷间重置点</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={selectedVolume.resetPoint ?? ""} onChange={(event) => onVolumeFieldChange(selectedVolume.id, "resetPoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="text-xs text-muted-foreground">本卷未兑现事项</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" placeholder="每行一个，或用中文逗号分隔。" value={selectedVolume.openPayoffs.join("\n")} onChange={(event) => onOpenPayoffsChange(selectedVolume.id, event.target.value)} />
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
  );
}
