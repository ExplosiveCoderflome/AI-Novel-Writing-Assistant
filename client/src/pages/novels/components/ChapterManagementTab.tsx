import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReplanRecommendationFromAuditReports } from "../chapterPlanning.shared";
import type { ChapterTabViewProps } from "./NovelEditView.types";
import WorldInjectionHint from "./WorldInjectionHint";
import ChapterExecutionActionPanel from "./ChapterExecutionActionPanel";
import ChapterExecutionQueueCard from "./ChapterExecutionQueueCard";
import ChapterExecutionResultPanel from "./ChapterExecutionResultPanel";
import {
  chapterMatchesQueueFilter,
  chapterStatusLabel,
  generationStateLabel,
  hasText,
  MetricBadge,
  parseRiskFlags,
  PrimaryActionButton,
  RiskBadgeList,
  shouldShowGenerationStateBadge,
  type AssetTabKey,
  type PrimaryAction,
  type QueueFilterKey,
} from "./chapterExecution.shared";

export default function ChapterManagementTab(props: ChapterTabViewProps) {
  const {
    novelId,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter,
    onGoToCharacterTab,
    onCreateChapter,
    isCreatingChapter,
    chapterOperationMessage,
    strategy,
    onStrategyChange,
    onApplyStrategy,
    isApplyingStrategy,
    onGenerateSelectedChapter,
    onRewriteChapter,
    onExpandChapter,
    onCompressChapter,
    onSummarizeChapter,
    onGenerateTaskSheet,
    onGenerateSceneCards,
    onGenerateChapterPlan,
    onReplanChapter,
    onRunFullAudit,
    onCheckContinuity,
    onCheckCharacterConsistency,
    onCheckPacing,
    onAutoRepair,
    onStrengthenConflict,
    onEnhanceEmotion,
    onUnifyStyle,
    onAddDialogue,
    onAddDescription,
    isReviewingChapter,
    isRepairingChapter,
    reviewResult,
    chapterPlan,
    latestStateSnapshot,
    chapterAuditReports,
    isGeneratingChapterPlan,
    isReplanningChapter,
    isRunningFullAudit,
    chapterQualityReport,
    repairStreamContent,
    isRepairStreaming,
    onAbortRepair,
    streamContent,
    isStreaming,
    onAbortStream,
  } = props;

  const [assetTab, setAssetTab] = useState<AssetTabKey>("content");
  const [queueFilter, setQueueFilter] = useState<QueueFilterKey>("all");

  const riskFlags = useMemo(() => parseRiskFlags(selectedChapter?.riskFlags), [selectedChapter?.riskFlags]);
  const openAuditIssues = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => ({
      ...issue,
      auditType: report.auditType,
    }))),
    [chapterAuditReports],
  );
  const planParticipants = useMemo(() => {
    if (!chapterPlan?.participantsJson) {
      return [];
    }
    try {
      const parsed = JSON.parse(chapterPlan.participantsJson) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [chapterPlan?.participantsJson]);
  const activeReplanRecommendation = useMemo(
    () => props.replanRecommendation ?? buildReplanRecommendationFromAuditReports(chapterAuditReports),
    [chapterAuditReports, props.replanRecommendation],
  );

  const filteredChapters = useMemo(
    () => chapters.filter((chapter) => chapterMatchesQueueFilter(chapter, queueFilter)),
    [chapters, queueFilter],
  );

  const queueFilters = useMemo(
    () => ([
      { key: "all", label: "全部" },
      { key: "setup", label: "待准备" },
      { key: "draft", label: "待写作" },
      { key: "review", label: "待修订" },
      { key: "completed", label: "已完成" },
    ] as const).map((item) => ({
      ...item,
      count: chapters.filter((chapter) => chapterMatchesQueueFilter(chapter, item.key)).length,
    })),
    [chapters],
  );

  const selectedChapterHasPlan = Boolean(
    selectedChapter && (hasText(chapterPlan?.objective) || hasText(selectedChapter.expectation)),
  );
  const selectedChapterHasTaskSheet = hasText(selectedChapter?.taskSheet);
  const selectedChapterHasSceneCards = hasText(selectedChapter?.sceneCards);
  const selectedChapterHasContent = hasText(selectedChapter?.content);
  const unresolvedIssueCount = openAuditIssues.length > 0 ? openAuditIssues.length : (reviewResult?.issues?.length ?? 0);
  const qualityOverall = chapterQualityReport?.overall ?? selectedChapter?.qualityScore ?? null;

  const primaryAction = useMemo<PrimaryAction | null>(() => {
    if (!selectedChapter) {
      return null;
    }
    if (isRepairStreaming) {
      return {
        label: "停止修复",
        reason: "AI 正在修复当前章节，先等待结果，或在确实不满意时停止本次修复。",
        variant: "outline",
        onClick: onAbortRepair,
      };
    }
    if (isStreaming) {
      return {
        label: "停止生成",
        reason: "AI 正在写本章，先观察当前输出是否符合预期，再决定是否停止本次生成。",
        variant: "outline",
        onClick: onAbortStream,
      };
    }
    if (!hasCharacters) {
      return {
        label: "去角色管理",
        reason: "当前至少需要 1 个角色，章节生成和审校才能更稳定地识别参与者和关系变化。",
        variant: "outline",
        onClick: onGoToCharacterTab,
      };
    }
    if (!selectedChapterHasPlan || selectedChapter.chapterStatus === "unplanned") {
      return {
        label: isGeneratingChapterPlan ? "规划中..." : "生成本章计划",
        reason: "先补齐本章目标、冲突和出场角色，后续写正文会更稳。",
        variant: "default",
        onClick: onGenerateChapterPlan,
        disabled: isGeneratingChapterPlan,
      };
    }
    if (!selectedChapterHasContent || selectedChapter.chapterStatus === "pending_generation" || selectedChapter.chapterStatus === "generating") {
      return {
        label: "写本章",
        reason: "这章已经具备基础规划，现在适合直接生成正文。",
        variant: "default",
        onClick: onGenerateSelectedChapter,
      };
    }
    if (selectedChapter.chapterStatus === "needs_repair" || unresolvedIssueCount > 0) {
      return {
        label: isRepairingChapter ? "修复中..." : "修复本章问题",
        reason: "当前章节还有待处理问题，建议先修复再继续润色。",
        variant: "secondary",
        onClick: onAutoRepair,
        disabled: isRepairingChapter,
      };
    }
    if (selectedChapter.chapterStatus === "pending_review" || selectedChapter.generationState === "drafted") {
      return {
        label: isRunningFullAudit ? "审计中..." : "运行完整审计",
        reason: "正文已经写出一版了，先检查问题，再决定是修复还是重规划。",
        variant: "default",
        onClick: onRunFullAudit,
        disabled: isRunningFullAudit,
      };
    }
    if (activeReplanRecommendation?.recommended) {
      return {
        label: isReplanningChapter ? "调整中..." : "调整后续章节计划",
        reason: activeReplanRecommendation.reason || "系统判断这章的问题可能已经影响后续章节。",
        variant: "outline",
        onClick: onReplanChapter,
        disabled: isReplanningChapter,
      };
    }
    return {
      label: "打开编辑器",
      reason: "当前章节已经进入可细修状态，可以转到编辑器做人工润色和确认。",
      variant: "outline",
      href: `/novels/${novelId}/chapters/${selectedChapter.id}`,
    };
  }, [
    activeReplanRecommendation?.reason,
    activeReplanRecommendation?.recommended,
    hasCharacters,
    isGeneratingChapterPlan,
    isRepairStreaming,
    isRepairingChapter,
    isReplanningChapter,
    isRunningFullAudit,
    isStreaming,
    novelId,
    onAbortRepair,
    onAbortStream,
    onAutoRepair,
    onGenerateChapterPlan,
    onGenerateSelectedChapter,
    onGoToCharacterTab,
    onReplanChapter,
    onRunFullAudit,
    selectedChapter,
    selectedChapterHasContent,
    selectedChapterHasPlan,
    unresolvedIssueCount,
  ]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>章节执行</CardTitle>
            <div className="text-sm text-muted-foreground">把这页收回成真正的工作台：左侧选章，中间看当前结果，右侧执行 AI 动作。</div>
          </div>
          <Button onClick={onCreateChapter} disabled={isCreatingChapter}>
            {isCreatingChapter ? "创建中..." : "新建章节"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

        {chapterOperationMessage ? (
          <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            {chapterOperationMessage}
          </div>
        ) : null}

        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <span>请先添加至少 1 个角色，再生成章节内容。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}

        {selectedChapter ? (
          <Card>
            <CardContent className="p-4 lg:p-5">
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="min-w-0 space-y-3 lg:col-span-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">第{selectedChapter.order}章</Badge>
                    <Badge variant="secondary">{chapterStatusLabel(selectedChapter.chapterStatus)}</Badge>
                    {shouldShowGenerationStateBadge(selectedChapter.generationState) ? (
                      <Badge variant="outline">{generationStateLabel(selectedChapter.generationState)}</Badge>
                    ) : null}
                    {typeof qualityOverall === "number" ? (
                      <Badge variant={qualityOverall >= 85 ? "default" : qualityOverall >= 70 ? "outline" : "secondary"}>
                        质量 {qualityOverall}
                      </Badge>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-foreground">第{selectedChapter.order}章：{selectedChapter.title || "未命名章节"}</div>
                    <div className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {chapterPlan?.objective ?? selectedChapter.expectation ?? "这章还没有明确目标，建议先补章节计划。"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {planParticipants.length > 0 ? <span>参与角色：{planParticipants.join("、")}</span> : null}
                    {latestStateSnapshot?.summary ? <span className="line-clamp-1">最新状态：{latestStateSnapshot.summary}</span> : null}
                  </div>
                  <RiskBadgeList risks={riskFlags} />
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricBadge label="当前字数" value={String(selectedChapter.content?.length ?? 0)} />
                    <MetricBadge label="目标字数" value={String(selectedChapter.targetWordCount ?? "-")} />
                    <MetricBadge label="待处理问题" value={String(unresolvedIssueCount)} />
                    <MetricBadge label="最近更新" value={selectedChapter.updatedAt ? new Date(selectedChapter.updatedAt).toLocaleString() : "暂无"} />
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/20 p-4 lg:col-span-4">
                  <div className="text-xs text-muted-foreground">推荐下一步</div>
                  <div className="mt-1 text-base font-semibold text-foreground">{primaryAction?.label ?? "先选择一章"}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">{primaryAction?.reason ?? "左侧选择章节后，系统会给出建议动作。"}</div>
                  <div className="mt-3">
                    <PrimaryActionButton action={primaryAction} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            左侧先选择一个章节，系统会根据当前状态推荐下一步动作。
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="w-full lg:w-[260px] lg:flex-none">
            <ChapterExecutionQueueCard
              chapters={filteredChapters}
              selectedChapterId={selectedChapterId}
              queueFilter={queueFilter}
              queueFilters={queueFilters}
              onQueueFilterChange={setQueueFilter}
              onSelectChapter={onSelectChapter}
            />
          </div>

          <div className="min-w-0 flex-1">
            <ChapterExecutionResultPanel
              novelId={novelId}
              selectedChapter={selectedChapter}
              assetTab={assetTab}
              onAssetTabChange={setAssetTab}
              chapterPlan={chapterPlan}
              latestStateSnapshot={latestStateSnapshot}
              chapterAuditReports={chapterAuditReports}
              replanRecommendation={activeReplanRecommendation}
              onReplanChapter={onReplanChapter}
              isReplanningChapter={isReplanningChapter}
              lastReplanResult={props.lastReplanResult}
              chapterQualityReport={chapterQualityReport}
              reviewResult={reviewResult}
              openAuditIssues={openAuditIssues}
              streamContent={streamContent}
              isStreaming={isStreaming}
              onAbortStream={onAbortStream}
              repairStreamContent={repairStreamContent}
              isRepairStreaming={isRepairStreaming}
              onAbortRepair={onAbortRepair}
            />
          </div>

          <div className="w-full lg:w-[300px] lg:flex-none">
            <ChapterExecutionActionPanel
              novelId={novelId}
              selectedChapter={selectedChapter}
              hasCharacters={hasCharacters}
              strategy={strategy}
              onStrategyChange={onStrategyChange}
              onApplyStrategy={onApplyStrategy}
              isApplyingStrategy={isApplyingStrategy}
              onGenerateSelectedChapter={onGenerateSelectedChapter}
              onRewriteChapter={onRewriteChapter}
              onExpandChapter={onExpandChapter}
              onCompressChapter={onCompressChapter}
              onSummarizeChapter={onSummarizeChapter}
              onGenerateTaskSheet={onGenerateTaskSheet}
              onGenerateSceneCards={onGenerateSceneCards}
              onGenerateChapterPlan={onGenerateChapterPlan}
              onReplanChapter={onReplanChapter}
              onRunFullAudit={onRunFullAudit}
              onCheckContinuity={onCheckContinuity}
              onCheckCharacterConsistency={onCheckCharacterConsistency}
              onCheckPacing={onCheckPacing}
              onAutoRepair={onAutoRepair}
              onStrengthenConflict={onStrengthenConflict}
              onEnhanceEmotion={onEnhanceEmotion}
              onUnifyStyle={onUnifyStyle}
              onAddDialogue={onAddDialogue}
              onAddDescription={onAddDescription}
              isReviewingChapter={isReviewingChapter}
              isRepairingChapter={isRepairingChapter}
              isGeneratingChapterPlan={isGeneratingChapterPlan}
              isReplanningChapter={isReplanningChapter}
              isRunningFullAudit={isRunningFullAudit}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
