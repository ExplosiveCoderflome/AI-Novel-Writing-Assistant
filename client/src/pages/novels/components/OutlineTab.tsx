import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WorldInjectionHint from "./WorldInjectionHint";
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

const readinessLabels = [
  { key: "canGenerateStrategy", label: "卷战略" },
  { key: "canGenerateSkeleton", label: "卷骨架" },
  { key: "canGenerateBeatSheet", label: "节奏板" },
  { key: "canGenerateChapterList", label: "拆章节" },
] as const;

export default function OutlineTab(props: OutlineTabViewProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    strategyPlan,
    critiqueReport,
    isGeneratingStrategy,
    onGenerateStrategy,
    isCritiquingStrategy,
    onCritiqueStrategy,
    isGeneratingSkeleton,
    onGenerateSkeleton,
    onGoToCharacterTab,
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

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <CardTitle>卷战略 / 卷骨架</CardTitle>
          <div className="text-sm text-muted-foreground">先让系统帮你决定卷数和硬/软规划，再确认可继续拆节奏板的卷骨架。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onGenerateStrategy} disabled={isGeneratingStrategy}>
            {isGeneratingStrategy ? "生成中..." : "生成卷战略建议"}
          </Button>
          <Button variant="outline" onClick={onCritiqueStrategy} disabled={isCritiquingStrategy || !strategyPlan}>
            {isCritiquingStrategy ? "审查中..." : "AI审查卷战略"}
          </Button>
          <Button onClick={onGenerateSkeleton} disabled={isGeneratingSkeleton || !readiness.canGenerateSkeleton}>
            {isGeneratingSkeleton ? "生成中..." : volumes.length > 0 ? "重生成卷骨架" : "生成/确认卷骨架"}
          </Button>
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
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">阶段就绪度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {readinessLabels.map((item) => (
                  <Badge
                    key={item.key}
                    variant={readiness[item.key] ? "default" : "outline"}
                  >
                    {item.label}
                  </Badge>
                ))}
              </div>
              {readiness.blockingReasons.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {readiness.blockingReasons.map((reason) => <div key={reason}>{reason}</div>)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">当前工作区已经具备继续推进的基础条件。</div>
              )}
              {volumeMessage ? <div className="text-xs text-muted-foreground">{volumeMessage}</div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">卷战略摘要</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {strategyPlan ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">推荐 {strategyPlan.recommendedVolumeCount} 卷</Badge>
                    <Badge variant="secondary">硬规划 {strategyPlan.hardPlannedVolumeCount} 卷</Badge>
                  </div>
                  <div className="rounded-md border p-3 text-xs text-muted-foreground">
                    <div>读者回报梯度：{strategyPlan.readerRewardLadder}</div>
                    <div className="mt-1">升级梯度：{strategyPlan.escalationLadder}</div>
                    <div className="mt-1">中盘转向：{strategyPlan.midpointShift}</div>
                  </div>
                  <div className="space-y-2">
                    {strategyPlan.volumes.map((volume) => (
                      <div key={`${volume.sortOrder}-${volume.roleLabel}`} className="rounded-md border p-2 text-xs">
                        <div className="font-medium">第{volume.sortOrder}卷 · {volume.planningMode === "hard" ? "硬规划" : "软规划"}</div>
                        <div className="mt-1 text-muted-foreground">定位：{volume.roleLabel}</div>
                        <div className="text-muted-foreground">回报：{volume.coreReward}</div>
                        <div className="text-muted-foreground">升级：{volume.escalationFocus}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  当前还没有卷战略建议。先点击“生成卷战略建议”。
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {critiqueReport ? (
          <Card>
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

        <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
          <div className="space-y-3">
            {volumes.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                当前还没有卷骨架。先生成卷战略建议，再点击“生成/确认卷骨架”。
              </div>
            ) : (
              volumes.map((volume, index) => (
                <Card key={volume.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">第{volume.sortOrder}卷</Badge>
                        <span className="text-sm text-muted-foreground">
                          {volume.chapters.length > 0
                            ? `章节 ${volume.chapters[0]?.chapterOrder}-${volume.chapters[volume.chapters.length - 1]?.chapterOrder}`
                            : "未拆章"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onMoveVolume(volume.id, -1)} disabled={index === 0}>上移</Button>
                        <Button size="sm" variant="outline" onClick={() => onMoveVolume(volume.id, 1)} disabled={index === volumes.length - 1}>下移</Button>
                        <Button size="sm" variant="outline" onClick={() => onRemoveVolume(volume.id)} disabled={volumes.length <= 1}>删除</Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="text-xs text-muted-foreground">卷标题</span>
                      <input className="w-full rounded-md border bg-background p-2" value={volume.title} onChange={(event) => onVolumeFieldChange(volume.id, "title", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">卷摘要</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.summary ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "summary", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">开卷抓手</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.openingHook ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "openingHook", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">主承诺</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.mainPromise ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "mainPromise", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">主压迫源</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.primaryPressureSource ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "primaryPressureSource", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">核心卖点</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.coreSellingPoint ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "coreSellingPoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">升级方式</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.escalationMode ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "escalationMode", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">主角变化</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.protagonistChange ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "protagonistChange", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">中段风险</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.midVolumeRisk ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "midVolumeRisk", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">卷末高潮</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.climax ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "climax", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">兑现类型</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.payoffType ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "payoffType", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">下卷钩子</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.nextVolumeHook ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "nextVolumeHook", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs text-muted-foreground">卷间重置点</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" value={volume.resetPoint ?? ""} onChange={(event) => onVolumeFieldChange(volume.id, "resetPoint", event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="text-xs text-muted-foreground">本卷未兑现事项</span>
                      <textarea className="min-h-[84px] w-full rounded-md border bg-background p-2" placeholder="每行一个，或用中文逗号分隔。" value={volume.openPayoffs.join("\n")} onChange={(event) => onOpenPayoffsChange(volume.id, event.target.value)} />
                    </label>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">派生文本预览</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea className="min-h-[260px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
              </CardContent>
            </Card>

            <Card>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">影响分析</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={onAnalyzeDraftImpact} disabled={isAnalyzingDraftImpact || volumes.length === 0}>
                    {isAnalyzingDraftImpact ? "分析中..." : "分析当前草稿"}
                  </Button>
                  <Button variant="outline" onClick={onAnalyzeVersionImpact} disabled={isAnalyzingVersionImpact || !selectedVersionId}>
                    {isAnalyzingVersionImpact ? "分析中..." : "分析当前版本"}
                  </Button>
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
        </div>
      </CardContent>
    </Card>
  );
}
