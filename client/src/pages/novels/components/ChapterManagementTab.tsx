import { useMemo, useState } from "react";
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
  type AssetTabKey,
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

  const openAuditIssues = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => ({
      ...issue,
      auditType: report.auditType,
    }))),
    [chapterAuditReports],
  );
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
