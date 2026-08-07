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
  if (status === "active") return "Already effective";
  if (status === "frozen") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  return "draft";
}

function versionStatusVariant(status: "draft" | "active" | "frozen"): "secondary" | "outline" | "default" {
  if (status === "active") return "default";
  if (status === "frozen") return "outline";
  return "secondary";
}

const readinessSteps = [
  {
    key: "canGenerateStrategy",
    label: "volume strategy",
    description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  {
    key: "canGenerateSkeleton",
    label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    description: "Confirm the opening handle, source of pressure and redemption method of each volume.",
  },
  {
    key: "canGenerateBeatSheet",
    label: "rhythm board",
    description: "After the roll skeleton is stable, it is suitable to enter the single roll rhythm splitting.",
  },
  {
    key: "canGenerateChapterList",
    label: "Split chapters",
    description: "Once the rhythm board is ready, you can proceed to the chapter level.",
  },
] as const;

function getNextOutlineAction(readiness: OutlineTabViewProps["readiness"]): string {
  if (!readiness.canGenerateStrategy) return "Mr. Paper Strategy Advice";
  if (!readiness.canGenerateSkeleton) return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (!readiness.canGenerateBeatSheet) return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (!readiness.canGenerateChapterList) return "Make the rhythm board of the current volume first, then split the chapters of the current volume";
  return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
}

function getVolumeScaleProfileLabel(profile: OutlineTabViewProps["volumeCountGuidance"]["volumeScaleProfile"]): string {
  const labels: Record<OutlineTabViewProps["volumeCountGuidance"]["volumeScaleProfile"], string> = {
    short: "short story structure",
    compact: "compact novella",
    standard: "Standard novel",
    long: "Long story expansion",
    epic: "Long story",
    mega: "Very long story",
  };
  return labels[profile] ?? "Structural suggestions";
}

function getBeatImpactStatusLabel(status: VolumeBeatImpactItem["status"]): string {
  if (status === "locked_with_draft") return "Text locked";
  if (status === "pending") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
}

function getBeatImpactStatusVariant(status: VolumeBeatImpactItem["status"]): "secondary" | "outline" | "default" {
  if (status === "locked_with_draft") return "secondary";
  if (status === "pending") return "outline";
  return "default";
}

function formatBeatChapterOrders(chapterOrders: number[]): string {
  if (chapterOrders.length === 0) {
    return "Chapters to be generated";
  }
  const sorted = chapterOrders.slice().sort((left, right) => left - right);
  return sorted[0] === sorted[sorted.length - 1]
    ? `第 ${sorted[0]} 章`
    : `第 ${sorted[0]}-${sorted[sorted.length - 1]} 章`;
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
        title="Takeover from volume strategy"
        description="The AI ​​will first determine whether the roll strategy and roll skeleton are complete, and then decide whether to continue to fill in the missing parts or rerun the current step."
        entry={props.directorTakeoverEntry}
      />
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
      <div className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.38)_100%)] px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Volume Strategy Console</h2>
              <Badge variant={outlineStageReady ? "default" : "outline"}>
                {completedReadinessCount}/{readinessSteps.length} Ready
                                                </Badge>
              {hasUnsavedVolumeDraft ? <Badge variant="secondary">Contains unsaved drafts</Badge> : null}
            </div>
            <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
              First determine the volume-level advancement method for the entire book, and then review the commitment, pressure, fulfillment of the current volume, and the traction for the next volume.
                                          </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AiButton variant="outline" onClick={onGenerateStrategy} disabled={isGeneratingStrategy}>
              {isGeneratingStrategy ? "Generating..." : "Generate Volume Strategy Advice"}
            </AiButton>
            <AiButton variant="outline" onClick={onCritiqueStrategy} disabled={isCritiquingStrategy || !strategyPlan}>
              {isCritiquingStrategy ? "Under review..." : "AI Review Volume Strategy"}
            </AiButton>
            <AiButton onClick={onGenerateSkeleton} disabled={isGeneratingSkeleton || !readiness.canGenerateSkeleton}>
              {isGeneratingSkeleton ? "Generating..." : volumes.length > 0 ? "Reborn into the skeleton of the entire book" : "Generate the skeleton of the entire book"}
            </AiButton>
            <Button variant="secondary" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Save volume workspace"}
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span>It is recommended to complete the characters first, and then create the roll strategy and roll skeleton.</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>Go to character management</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <span>{generationNotice}</span>
          {hasUnsavedVolumeDraft ? <Badge variant="secondary">Contains unsaved drafts</Badge> : null}
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <Card className="self-start border-0 bg-muted/15 shadow-none">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Stage readiness</CardTitle>
                  <Badge variant={outlineStageReady ? "default" : "outline"}>
                    {completedReadinessCount}/{readinessSteps.length} Ready
                                                            </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-xl bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</div>
                  <div className="mt-1 font-medium text-foreground">{nextOutlineAction}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${readinessProgress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {outlineStageReady
                      ? "The current volume strategic stage has complete conditions for advancement."
                      : readiness.blockingReasons.length > 0
                        ? `还有 ${readiness.blockingReasons.length} 项阻塞条件需要处理。`
                        : "This stage can now be continued."}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {readinessSteps.map((item) => (
                    <div key={item.key} className="rounded-xl bg-background/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{item.label}</div>
                        <Badge variant={readiness[item.key] ? "default" : "outline"}>
                          {readiness[item.key] ? "Ready" : "Not ready"}
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
                    The current work area already has the basic conditions for further advancement.
                                                                </div>
                )}
                {volumeMessage ? <div className="text-xs text-muted-foreground">{volumeMessage}</div> : null}
              </CardContent>
            </Card>

            <details className="group border-t border-border/60 pt-4">
              <summary className="cursor-pointer list-none">
                <CollapsibleSummary
                  title="Paper Suggestions and Strategy Review"
                  description="This is decision-making aid information. On the first screen, look at the recommended next step and current volume first, and then proceed to review and volume control when necessary."
                  meta={<Badge variant="outline">{volumeCountModeLabel}</Badge>}
                />
              </summary>

              <div className="mt-4 space-y-3">
                <Card className="self-start border-0 bg-muted/15 shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="text-base">Suggested number of papers</CardTitle>
                      <Badge variant="outline">{volumeCountModeLabel}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">Total Chapter Budget</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.chapterBudget} chapter</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">Structural suggested range</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.decisionVolumeCountRange.min}-{volumeCountGuidance.decisionVolumeCountRange.max} roll
                                                                              </div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">System recommended number of volumes</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{volumeCountGuidance.systemRecommendedVolumeCount} roll</div>
                      </div>
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="text-xs text-muted-foreground">Default hard planning scope</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {volumeCountGuidance.hardPlannedVolumeRange.min}-{volumeCountGuidance.hardPlannedVolumeRange.max} roll
                                                                              </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
                      Current structure gear:{volumeScaleProfileLabel}。{volumeCountGuidance.volumeCountRationale}
                      Chapter budgets will still be referenced {volumeCountGuidance.targetChapterRange.min}-{volumeCountGuidance.targetChapterRange.max} Chapter/Volume,
                                                                    However, the system will give priority to recommending the number of rolls based on phase commitment, selling point switching, situation escalation and phase fulfillment.
                                                                  </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={customVolumeCountEnabled ? "default" : "outline"}
                        onClick={() => onCustomVolumeCountEnabledChange(!customVolumeCountEnabled)}
                      >
                        {customVolumeCountEnabled ? "Collapse custom volumes" : "Custom volume number"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={onRestoreSystemRecommendedVolumeCount}>
                        Recovery system suggestions
                                                                        </Button>
                    </div>

                    {customVolumeCountEnabled ? (
                      <div className="rounded-xl bg-background/70 p-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_auto_auto] sm:items-end">
                          <label className="space-y-1 text-sm">
                            <span className="text-xs text-muted-foreground">Fixed number of rolls</span>
                            <input
                              type="number"
                              min={volumeCountGuidance.allowedVolumeCountRange.min}
                              max={volumeCountGuidance.allowedVolumeCountRange.max}
                              className="w-full rounded-md border bg-background p-2"
                              value={customVolumeCountInput}
                              onChange={(event) => onCustomVolumeCountInputChange(event.target.value)}
                            />
                          </label>
                          <Button size="sm" onClick={onApplyCustomVolumeCount}>Apply a fixed number of volumes</Button>
                          <div className="text-xs text-muted-foreground">
                            Allowed range:{volumeCountGuidance.allowedVolumeCountRange.min}-{volumeCountGuidance.allowedVolumeCountRange.max} roll. Fixed volumes override structural recommendations.
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
                        <CardTitle className="text-base">Volume Strategy Review</CardTitle>
                        <Badge variant={critiqueReport.overallRisk === "high" ? "secondary" : critiqueReport.overallRisk === "medium" ? "outline" : "default"}>
                          risk {critiqueReport.overallRisk}
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
                title="Derived text, version control and impact analysis"
                description="This part is more about finishing and contrasting, and is not something that you have to keep an eye on when editing the skeleton of the current volume."
              />
            </summary>

            <div className="mt-4 space-y-3">
              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Derived text preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea className="min-h-[220px] w-full rounded-md border bg-muted/20 p-3 text-sm" readOnly value={draftText} />
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">version control</CardTitle>
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
                          <div className="text-xs text-muted-foreground">Creation time:{new Date(selectedVersion.createdAt).toLocaleString()}</div>
                          <div className="mt-1 line-clamp-4 text-xs text-muted-foreground">{selectedVersion.diffSummary || "No difference summary yet"}</div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">There is no volume version yet, please save the draft version first.</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onCreateDraftVersion} disabled={isCreatingDraftVersion || volumes.length === 0}>
                      {isCreatingDraftVersion ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Save as draft version"}
                    </Button>
                    <Button variant="outline" onClick={onLoadSelectedVersionToDraft} disabled={!selectedVersionId}>Overwrite current draft</Button>
                    <Button variant="secondary" onClick={onActivateVersion} disabled={isActivatingVersion || !selectedVersionId}>
                      {isActivatingVersion ? "Taking effect..." : "Set as effective version"}
                    </Button>
                    <Button variant="outline" onClick={onFreezeVersion} disabled={isFreezingVersion || !selectedVersionId}>
                      {isFreezingVersion ? "Freezing..." : "Freeze current version"}
                    </Button>
                    <Button variant="outline" onClick={onLoadVersionDiff} disabled={isLoadingVersionDiff || !selectedVersionId}>
                      {isLoadingVersionDiff ? "loading..." : "View version differences"}
                    </Button>
                  </div>
                  {diffResult ? (
                    <div className="rounded-md border p-2 text-xs">
                      <div className="font-medium">Difference Preview V{diffResult.version}</div>
                      <div className="text-muted-foreground">change volume {diffResult.changedVolumeCount} | Affected chapters {diffResult.changedChapterCount} | Change the number of rows {diffResult.changedLines}</div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="self-start border-0 bg-muted/15 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">impact analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <AiButton variant="outline" onClick={onAnalyzeDraftImpact} disabled={isAnalyzingDraftImpact || volumes.length === 0}>
                      {isAnalyzingDraftImpact ? "Analyzing..." : "Analyze current draft"}
                    </AiButton>
                    <AiButton variant="outline" onClick={onAnalyzeVersionImpact} disabled={isAnalyzingVersionImpact || !selectedVersionId}>
                      {isAnalyzingVersionImpact ? "Analyzing..." : "Analyze current version"}
                    </AiButton>
                  </div>
                  {impactResult ? (
                    <div className="space-y-3 rounded-md border p-3 text-xs">
                      <div className="font-medium">Volume level impact preview</div>
                      <div className="text-muted-foreground">impact volume {impactResult.affectedVolumeCount} | Affected chapters {impactResult.affectedChapterCount} | Change the number of rows {impactResult.changedLines}</div>
                      {impactResult.affectedBeats && impactResult.affectedBeats.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {impactResult.defaultImpactAction ? <Badge variant="default">{impactResult.defaultImpactAction}</Badge> : null}
                            {typeof impactResult.staleBeatCount === "number" ? <Badge variant="outline">Unwritten paragraph {impactResult.staleBeatCount}</Badge> : null}
                            {typeof impactResult.lockedBeatCount === "number" && impactResult.lockedBeatCount > 0 ? (
                              <Badge variant="secondary">Lock segment {impactResult.lockedBeatCount}</Badge>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            {impactResult.affectedBeats.slice(0, 8).map((beat) => (
                              <div key={`${beat.volumeId}-${beat.beatKey}`} className="rounded-md bg-background/70 p-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">Section{beat.volumeOrder}roll · {beat.beatLabel}{beat.beatTitle ? ` · ${beat.beatTitle}` : ""}</span>
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
                              Advanced actions:{impactResult.advancedImpactActions.join(" / ")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">It is recommended to conduct a volume-level impact analysis before taking effect.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </details>
        </div>

        <Tabs value={workspaceTab} onValueChange={(value) => setWorkspaceTab(value as OutlineWorkspaceTab)} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start bg-muted/60 p-1">
            <TabsTrigger value="current">current volume</TabsTrigger>
            <TabsTrigger value="strategy">Strategic Overview</TabsTrigger>
            <TabsTrigger value="assets">Asset constraints</TabsTrigger>
          </TabsList>

        <TabsContent value="strategy" className="mt-0 space-y-4">
        <Card className="border-0 bg-muted/15 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">Volume Strategy Summary</CardTitle>
                <div className="text-sm text-muted-foreground">First look at the volume level rewards and upgrade routes of the entire book, and then select a volume below to enter detailed editing.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {strategyPlan ? (
                  <>
                    <Badge variant="outline">recommend {strategyPlan.recommendedVolumeCount} roll</Badge>
                    <Badge variant="secondary">Hard planning {strategyPlan.hardPlannedVolumeCount} roll</Badge>
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
                    <div className="text-xs text-muted-foreground">reader reward gradient</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.readerRewardLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">Upgrade gradient</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.escalationLadder}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">mid game turn</div>
                    <div className="mt-2 text-sm leading-6 text-foreground">{strategyPlan.midpointShift}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">
                  <div className="text-xs">Volume Level Rhythm Overview</div>
                  <div className="mt-2 leading-6">
                    {strategyPlan.volumes
                      .map((volume) => `第${volume.sortOrder}卷：${volume.roleLabel}，${volume.coreReward}`)
                      .join("；")}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                There are currently no volume strategy recommendations. First click "Generate Volume Strategy Suggestions".
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
