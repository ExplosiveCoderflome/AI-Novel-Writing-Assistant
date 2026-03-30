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
    replanRecommendation,
    lastReplanResult,
    chapterPlan,
    latestStateSnapshot,
    chapterAuditReports,
    isGeneratingChapterPlan,
    isReplanningChapter,
    isRunningFullAudit,
    chapterQualityReport,
    repairStreamContent,
    isRepairStreaming,
    repairStreamingChapterId,
    repairStreamingChapterLabel,
    onAbortRepair,
    streamContent,
    isStreaming,
    streamingChapterId,
    streamingChapterLabel,
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
    () => replanRecommendation ?? buildReplanRecommendationFromAuditReports(chapterAuditReports),
    [chapterAuditReports, replanRecommendation],
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
      { key: "review", label: "待修整" },
      { key: "completed", label: "已完成" },
    ] as const).map((item) => ({
      ...item,
      count: chapters.filter((chapter) => chapterMatchesQueueFilter(chapter, item.key)).length,
    })),
    [chapters],
  );

  const selectedChapterHasRuntimePlan = Boolean(
    selectedChapter && hasText(chapterPlan?.objective),
  );
  const selectedChapterHasContent = hasText(selectedChapter?.content);
  const unresolvedIssueCount = openAuditIssues.length > 0 ? openAuditIssues.length : (reviewResult?.issues?.length ?? 0);
  const qualityOverall = chapterQualityReport?.overall ?? selectedChapter?.qualityScore ?? null;
  const selectedChapterStreaming = Boolean(selectedChapter && isStreaming && streamingChapterId === selectedChapter.id);
  const selectedChapterRepairing = Boolean(selectedChapter && isRepairStreaming && repairStreamingChapterId === selectedChapter.id);

  const primaryAction = useMemo<PrimaryAction | null>(() => {
    if (!selectedChapter) {
      return null;
    }
    if (selectedChapterRepairing) {
      return {
        label: "停止修复",
        reason: "AI 正在修复当前章节，先观察输出是否符合预期，不满意时再停止这轮修复。",
        variant: "outline",
        onClick: onAbortRepair,
      };
    }
    if (selectedChapterStreaming) {
      return {
        label: "停止生成",
        reason: "AI 正在写这一章，先在主正文区观察节奏和手感，再决定是否中止。",
        variant: "outline",
        onClick: onAbortStream,
      };
    }
    if (!hasCharacters) {
      return {
        label: "去角色管理",
        reason: "至少先补 1 个角色，章节生成和审校才能更稳定地识别参与者与关系变化。",
        variant: "outline",
        onClick: onGoToCharacterTab,
      };
    }
    if (
      !selectedChapterHasContent
      || selectedChapter.chapterStatus === "unplanned"
      || selectedChapter.chapterStatus === "pending_generation"
      || selectedChapter.chapterStatus === "generating"
    ) {
      return {
        label: "写本章",
        reason: selectedChapterHasRuntimePlan
          ? "这章已经具备执行计划，现在适合直接生成正文。"
          : hasText(selectedChapter.expectation)
            ? "系统会先根据当前章节细化和最新状态自动补齐执行计划，再开始写正文。"
            : "系统会先为这一章自动补齐执行计划，再开始写正文。",
        variant: "default",
        onClick: onGenerateSelectedChapter,
      };
    }
    if (selectedChapter.chapterStatus === "needs_repair" || unresolvedIssueCount > 0) {
      return {
        label: isRepairingChapter ? "修复中..." : "修复本章问题",
        reason: "这一章还有待处理问题，建议先修复，再继续润色。",
        variant: "secondary",
        onClick: onAutoRepair,
        disabled: isRepairingChapter,
      };
    }
    if (selectedChapter.chapterStatus === "pending_review" || selectedChapter.generationState === "drafted") {
      return {
        label: isRunningFullAudit ? "审校中..." : "运行完整审校",
        reason: "正文已经写出一版了，先检查问题，再决定是修复还是调整后续章节。",
        variant: "default",
        onClick: onRunFullAudit,
        disabled: isRunningFullAudit,
      };
    }
    if (activeReplanRecommendation?.recommended) {
      return {
        label: isReplanningChapter ? "调整中..." : "调整后续章节计划",
        reason: activeReplanRecommendation.reason || "系统判断这一章的问题已经开始影响后续章节，适合现在重排。",
        variant: "outline",
        onClick: onReplanChapter,
        disabled: isReplanningChapter,
      };
    }
    return {
      label: "打开章节编辑器",
      reason: "当前章节已经进入可精修状态，可以转到编辑器里做人工润色和确认。",
      variant: "outline",
      href: `/novels/${novelId}/chapters/${selectedChapter.id}`,
    };
  }, [
    activeReplanRecommendation?.reason,
    activeReplanRecommendation?.recommended,
    hasCharacters,
    isRepairingChapter,
    isReplanningChapter,
    isRunningFullAudit,
    novelId,
    onAbortRepair,
    onAbortStream,
    onAutoRepair,
    onGenerateSelectedChapter,
    onGoToCharacterTab,
    onReplanChapter,
    onRunFullAudit,
    selectedChapter,
    selectedChapterHasContent,
    selectedChapterHasRuntimePlan,
    selectedChapterRepairing,
    selectedChapterStreaming,
    unresolvedIssueCount,
  ]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b bg-gradient-to-b from-muted/25 via-background to-background">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
            <CardTitle>章节执行</CardTitle>
            <div className="text-sm leading-6 text-muted-foreground">
              把这里收成真正的主工作台：左侧只管切章，中间完整承接正文，右侧专心放 AI 动作和策略。
            </div>
          </div>
          <Button onClick={onCreateChapter} disabled={isCreatingChapter}>
            {isCreatingChapter ? "创建中..." : "新建章节"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

        {chapterOperationMessage ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
            {chapterOperationMessage}
          </div>
        ) : null}

        {!hasCharacters ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
            <span>请先添加至少 1 个角色，再生成章节内容。这样 AI 更容易识别出场者、关系变化和情节承接。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}

        {selectedChapter ? (
          <Card className="overflow-hidden border-border/70">
            <CardContent className="bg-gradient-to-br from-slate-50 via-background to-amber-50/40 p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">第{selectedChapter.order}章</Badge>
                    <Badge variant="secondary">{chapterStatusLabel(selectedChapter.chapterStatus)}</Badge>
                    {selectedChapterStreaming ? <Badge>当前写作中</Badge> : null}
                    {selectedChapterRepairing ? <Badge variant="secondary">当前修复中</Badge> : null}
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
                    <div className="text-xl font-semibold text-foreground">
                      {selectedChapter.title || "未命名章节"}
                    </div>
                    <div className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">
                      {chapterPlan?.objective ?? selectedChapter.expectation ?? "这一章还没有明确目标；开始写作时系统会先自动补齐执行计划。"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {planParticipants.length > 0 ? <span>参与角色：{planParticipants.join("、")}</span> : null}
                    {latestStateSnapshot?.summary ? <span className="line-clamp-1">最新状态：{latestStateSnapshot.summary}</span> : null}
                  </div>

                  <RiskBadgeList risks={riskFlags} />

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricBadge label="当前字数" value={String(selectedChapter.content?.length ?? 0)} />
                    <MetricBadge label="目标字数" value={String(selectedChapter.targetWordCount ?? "-")} />
                    <MetricBadge label="待处理问题" value={String(unresolvedIssueCount)} />
                    <MetricBadge label="最近更新" value={selectedChapter.updatedAt ? new Date(selectedChapter.updatedAt).toLocaleString("zh-CN") : "暂无"} />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/85 p-4">
                  <div className="text-xs text-muted-foreground">推荐下一步</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{primaryAction?.label ?? "先选择一个章节"}</div>
                  <div className="mt-2 text-sm leading-7 text-muted-foreground">
                    {primaryAction?.reason ?? "从左侧选择章节后，系统会根据当前状态推荐更合适的动作。"}
                  </div>
                  <div className="mt-4">
                    <PrimaryActionButton action={primaryAction} />
                  </div>
                  {(isStreaming && streamingChapterLabel && streamingChapterId && streamingChapterId !== selectedChapter.id) || (isRepairStreaming && repairStreamingChapterLabel && repairStreamingChapterId && repairStreamingChapterId !== selectedChapter.id) ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-800">
                      {isStreaming && streamingChapterLabel && streamingChapterId !== selectedChapter.id ? `${streamingChapterLabel} 仍在后台写作。` : ""}
                      {isRepairStreaming && repairStreamingChapterLabel && repairStreamingChapterId !== selectedChapter.id ? `${isStreaming && streamingChapterLabel && streamingChapterId !== selectedChapter.id ? " " : ""}${repairStreamingChapterLabel} 仍在后台修复。` : ""}
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-sm leading-7 text-muted-foreground">
            先在左侧选择一个章节，系统会把当前章节的正文、建议动作和质量反馈集中到中间工作区。
          </div>
        )}

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="w-full xl:w-[300px] xl:flex-none">
            <ChapterExecutionQueueCard
              chapters={filteredChapters}
              selectedChapterId={selectedChapterId}
              queueFilter={queueFilter}
              queueFilters={queueFilters}
              streamingChapterId={streamingChapterId}
              repairStreamingChapterId={repairStreamingChapterId}
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
              lastReplanResult={lastReplanResult}
              chapterQualityReport={chapterQualityReport}
              reviewResult={reviewResult}
              openAuditIssues={openAuditIssues}
              streamContent={streamContent}
              isStreaming={isStreaming}
              streamingChapterId={streamingChapterId}
              streamingChapterLabel={streamingChapterLabel}
              onAbortStream={onAbortStream}
              repairStreamContent={repairStreamContent}
              isRepairStreaming={isRepairStreaming}
              repairStreamingChapterId={repairStreamingChapterId}
              repairStreamingChapterLabel={repairStreamingChapterLabel}
              onAbortRepair={onAbortRepair}
            />
          </div>

          <div className="w-full xl:w-[320px] xl:flex-none">
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
