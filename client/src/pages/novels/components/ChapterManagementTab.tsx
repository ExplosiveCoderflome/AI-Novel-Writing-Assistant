import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildReplanRecommendationFromAuditReports } from "../chapterPlanning.shared";
import type { ChapterTabViewProps } from "./NovelEditView.types";
import WorldInjectionHint from "./WorldInjectionHint";
import ChapterExecutionActionPanel from "./ChapterExecutionActionPanel";
import ChapterExecutionInsightsSidebar from "./chapterInsights";
import ChapterExecutionReferencePanel from "./chapterInsights/ChapterExecutionReferencePanel";
import ChapterExecutionQueueCard from "./ChapterExecutionQueueCard";
import ChapterExecutionResultPanel from "./ChapterExecutionResultPanel";
import {
  chapterMatchesQueueFilter,
  type AssetTabKey,
  type QueueFilterKey,
} from "./chapterExecution.shared";
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";

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
    isGeneratingTaskSheet,
    isGeneratingSceneCards,
    isSummarizingChapter,
    reviewActionKind,
    repairActionKind,
    generationActionKind,
    isReviewingChapter,
    isRepairingChapter,
    reviewResult,
    replanRecommendation,
    lastReplanResult,
    chapterPlan,
    latestStateSnapshot,
    chapterStateSnapshot,
    chapterTimeline,
    isLoadingChapterTimeline,
    chapterResourceContext,
    isLoadingChapterResourceContext,
    resourceWorkflowMode = "manual",
    pendingCharacterResourceProposals = [],
    onExtractChapterResources,
    isExtractingChapterResources = false,
    onConfirmCharacterResourceProposal,
    onRejectCharacterResourceProposal,
    confirmingCharacterResourceProposalId = "",
    rejectingCharacterResourceProposalId = "",
    chapterAuditReports,
    backgroundSyncActivities,
    isGeneratingChapterPlan,
    isReplanningChapter,
    isRunningFullAudit,
    chapterQualityReport,
    chapterRuntimePackage,
    repairStreamContent,
    isRepairStreaming,
    repairStreamingChapterId,
    repairStreamingChapterLabel,
    repairRunStatus,
    onAbortRepair,
    streamContent,
    isStreaming,
    streamingChapterId,
    streamingChapterLabel,
    chapterRunStatus,
    onAbortStream,
    directorTakeoverEntry,
  } = props;

  const [assetTab, setAssetTab] = useState<AssetTabKey>("content");
  const [queueFilter, setQueueFilter] = useState<QueueFilterKey>("all");
  const [rightRailTab, setRightRailTab] = useState<"insights" | "reference" | "agent">("insights");

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
    <div className="space-y-4">
      <DirectorTakeoverEntryPanel
        title="从章节执行接管"
        description="AI 会先判断当前是否有活动批次、检查点或可执行章节范围，再决定恢复当前批次还是按你的选择新开批次。"
        entry={directorTakeoverEntry}
      />
      <Card className="overflow-visible border-0 bg-transparent shadow-none">
      <CardHeader className="gap-3 rounded-2xl bg-muted/20 px-5 py-4">
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

      <CardContent className="space-y-4 px-0 pt-5">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />

        {chapterOperationMessage ? (
          <div className="rounded-2xl bg-muted/20 px-4 py-3 text-xs leading-6 text-muted-foreground">
            {chapterOperationMessage}
          </div>
        ) : null}

        {!hasCharacters ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
            <span>请先添加至少 1 个角色，再生成章节内容。这样 AI 更容易识别出场者、关系变化和情节承接。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 xl:grid xl:h-[calc(100dvh-8rem)] xl:grid-cols-[300px_minmax(0,1fr)_332px] xl:items-stretch">
          <div className="h-full min-h-0">
            <ChapterExecutionQueueCard
              chapters={filteredChapters}
              selectedChapterId={selectedChapterId}
              queueFilter={queueFilter}
              queueFilters={queueFilters}
              streamingChapterId={streamingChapterId}
              streamingPhase={streamingChapterId ? (chapterRunStatus?.phase ?? "streaming") : null}
              repairStreamingChapterId={repairStreamingChapterId}
              onQueueFilterChange={setQueueFilter}
              onSelectChapter={onSelectChapter}
            />
          </div>

          <div className="min-h-0 min-w-0 h-full">
            <ChapterExecutionResultPanel
              selectedChapter={selectedChapter}
              onOpenReferencePanel={(tab) => {
                setAssetTab(tab);
                setRightRailTab("reference");
              }}
              chapterPlan={chapterPlan}
              streamContent={streamContent}
              isStreaming={isStreaming}
              streamingChapterId={streamingChapterId}
              streamingChapterLabel={streamingChapterLabel}
              chapterRunStatus={chapterRunStatus}
              onAbortStream={onAbortStream}
              onRunFullAudit={onRunFullAudit}
              isRunningFullAudit={isRunningFullAudit}
              onAutoRepair={onAutoRepair}
              isRepairStreaming={isRepairStreaming}
              repairStreamingChapterId={repairStreamingChapterId}
            />
          </div>

          <div className="h-full min-h-0 xl:sticky xl:top-4">
            <Tabs
              value={rightRailTab}
              onValueChange={(value) => {
                const nextTab = value as "insights" | "reference" | "agent";
                if (nextTab === "reference" && assetTab === "content") {
                  setAssetTab("taskSheet");
                }
                setRightRailTab(nextTab);
              }}
              className="flex h-full min-h-0 flex-col"
            >
              <TabsList className="grid h-auto w-full shrink-0 grid-cols-3 rounded-xl bg-muted/50 p-1.5">
                <TabsTrigger value="insights" className="rounded-lg px-3 py-2 text-sm">动态栏</TabsTrigger>
                <TabsTrigger value="reference" className="rounded-lg px-3 py-2 text-sm">资料诊断</TabsTrigger>
                <TabsTrigger value="agent" className="rounded-lg px-3 py-2 text-sm">AI 执行台</TabsTrigger>
              </TabsList>
              <TabsContent value="insights" className="mt-3 min-h-0 flex-1">
                <ChapterExecutionInsightsSidebar
                  selectedChapter={selectedChapter}
                  chapterTimeline={chapterTimeline}
                  isLoadingChapterTimeline={isLoadingChapterTimeline}
                  latestStateSnapshot={latestStateSnapshot}
                  chapterStateSnapshot={chapterStateSnapshot}
                  chapterRuntimePackage={chapterRuntimePackage}
                  chapterPlan={chapterPlan}
                  chapterQualityReport={chapterQualityReport}
                  reviewResult={reviewResult}
                  openAuditIssues={openAuditIssues}
                  chapterResourceContext={chapterResourceContext}
                  isLoadingChapterResourceContext={isLoadingChapterResourceContext}
                  resourceWorkflowMode={resourceWorkflowMode}
                  pendingCharacterResourceProposals={pendingCharacterResourceProposals}
                  onExtractChapterResources={onExtractChapterResources}
                  isExtractingChapterResources={isExtractingChapterResources}
                  onConfirmCharacterResourceProposal={onConfirmCharacterResourceProposal}
                  onRejectCharacterResourceProposal={onRejectCharacterResourceProposal}
                  confirmingCharacterResourceProposalId={confirmingCharacterResourceProposalId}
                  rejectingCharacterResourceProposalId={rejectingCharacterResourceProposalId}
                />
              </TabsContent>
              <TabsContent value="reference" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <ChapterExecutionReferencePanel
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
                  chapterRuntimePackage={chapterRuntimePackage}
                  reviewResult={reviewResult}
                  openAuditIssues={openAuditIssues}
                  repairStreamContent={repairStreamContent}
                  isRepairStreaming={isRepairStreaming}
                  repairStreamingChapterId={repairStreamingChapterId}
                  repairStreamingChapterLabel={repairStreamingChapterLabel}
                  repairRunStatus={repairRunStatus}
                  onAbortRepair={onAbortRepair}
                />
              </TabsContent>
              <TabsContent value="agent" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
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
                  isGeneratingTaskSheet={isGeneratingTaskSheet}
                  isGeneratingSceneCards={isGeneratingSceneCards}
                  isSummarizingChapter={isSummarizingChapter}
                  reviewActionKind={reviewActionKind}
                  repairActionKind={repairActionKind}
                  generationActionKind={generationActionKind}
                  isReviewingChapter={isReviewingChapter}
                  isRepairingChapter={isRepairingChapter}
                  isGeneratingChapterPlan={isGeneratingChapterPlan}
                  isReplanningChapter={isReplanningChapter}
                  isRunningFullAudit={isRunningFullAudit}
                  isStreaming={isStreaming}
                  streamingChapterId={streamingChapterId}
                  chapterAuditReports={chapterAuditReports}
                  chapterRuntimePackage={chapterRuntimePackage}
                  latestStateSnapshot={latestStateSnapshot}
                  chapterStateSnapshot={chapterStateSnapshot}
                  backgroundSyncActivities={backgroundSyncActivities}
                  chapterRunStatus={chapterRunStatus}
                  repairRunStatus={repairRunStatus}
                  repairStreamingChapterId={repairStreamingChapterId}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
