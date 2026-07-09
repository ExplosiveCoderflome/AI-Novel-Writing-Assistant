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

type OutlineWorkspaceTab = "current" | "strategy" | "assets";

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

  useEffect(() => {
    if (!volumes.some((volume) => volume.id === selectedVolumeId)) {
      setSelectedVolumeId(volumes[0]?.id ?? "");
    }
  }, [selectedVolumeId, volumes]);

  const selectedVolume = volumes.find((volume) => volume.id === selectedVolumeId) ?? volumes[0];

  return (
    <div className="space-y-5">
      <DirectorTakeoverEntryPanel
        title="从卷战略接管"
        description="AI 会先判断卷战略和卷骨架是否已齐，再决定继续补缺失部分还是重跑当前步骤。"
        entry={props.directorTakeoverEntry}
      />
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
      <div className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.38)_100%)] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">卷战略控制台</h2>
              <Badge variant={outlineStageReady ? "default" : "outline"}>
                {completedReadinessCount}/{readinessSteps.length} 已就绪
              </Badge>
              {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
            </div>
            <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
              先确定整本书的卷级推进方式，再审当前卷的承诺、压力、兑现和下卷牵引。
            </div>
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
            <span>建议先补齐角色，再生成卷战略和卷骨架。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">含未保存草稿</Badge> : null}
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <Card className="self-start border-0 bg-muted/15 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">阶段就绪度</CardTitle>
                  <Badge variant={outlineStageReady ? "default" : "outline"}>
                    {completedReadinessCount}/{readinessSteps.length} 已就绪
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl bg-background/70 p-3">
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
                  title="卷数建议与策略审查"
                  description="这些属于辅助决策信息。首屏先看推荐下一步和当前卷，确实需要时再展开审查与卷数控制。"
                  meta={<Badge variant="outline">{volumeCountModeLabel}</Badge>}
                />
              </summary>

              <div className="mt-4 space-y-3">
                <Card className="self-start border-0 bg-muted/15 shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base">卷数建议</CardTitle>
                      <Badge variant="outline">{volumeCountModeLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">总章节预算</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.chapterBudget} 章</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">推荐卷数区间</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} 卷
                        </div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">系统建议卷数</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.systemRecommendedVolumeCount} 卷</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">默认硬规划范围</div>
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
                        {customVolumeCountEnabled ? "收起自定义卷数" : "自定义卷数"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={onRestoreSystemRecommendedVolumeCount}>
                        恢复系统建议
                      </Button>
                    </div>

                    {customVolumeCountEnabled ? (
                      <div className="rounded-xl bg-background/70 p-3">
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
                  <Card className="self-start border-0 bg-muted/15 shadow-none">
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

          <details className="group border-t border-border/60 pt-4">
            <summary className="cursor-pointer list-none">
              <CollapsibleSummary
                title="派生文本、版本控制与影响分析"
                description="这部分偏向收尾和对比，不是当前卷骨架编辑时必须一直盯着看的内容。"
              />
            </summary>

            <div className="mt-4 space-y-3">
              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">派生文本预览</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea className="min-h-[220px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">版本控制</CardTitle>
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

              <Card className="self-start border-0 bg-muted/15 shadow-none">
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

        <Tabs value={workspaceTab} onValueChange={(value) => setWorkspaceTab(value as OutlineWorkspaceTab)} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start bg-muted/60 p-1">
            <TabsTrigger value="current">当前卷</TabsTrigger>
            <TabsTrigger value="strategy">战略总览</TabsTrigger>
            <TabsTrigger value="assets">资产约束</TabsTrigger>
          </TabsList>

        <TabsContent value="strategy" className="mt-0 space-y-4">
        <Card className="border-0 bg-muted/15 shadow-none">
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
