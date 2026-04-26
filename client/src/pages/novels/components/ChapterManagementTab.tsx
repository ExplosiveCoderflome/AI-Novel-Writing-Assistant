import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
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
import DirectorTakeoverEntryPanel from "./DirectorTakeoverEntryPanel";

type ChapterResourceContextItem = NonNullable<ChapterTabViewProps["chapterResourceContext"]>["availableItems"][number];
type ChapterResourceProposal = NonNullable<ChapterTabViewProps["pendingCharacterResourceProposals"]>[number];

function getResourceStatusLabel(status: ChapterResourceContextItem["status"]): string {
  const labels: Record<ChapterResourceContextItem["status"], string> = {
    available: "可用",
    hidden: "隐藏",
    borrowed: "借用",
    transferred: "转交",
    lost: "丢失",
    consumed: "已消耗",
    damaged: "受损",
    destroyed: "毁坏",
    stale: "淡出",
  };
  return labels[status] ?? status;
}

function getResourceLine(item: ChapterResourceContextItem): string {
  const holder = item.holderCharacterName ? `${item.holderCharacterName}持有` : "持有者待确认";
  const window = item.expectedUseEndChapterOrder
    ? `第${item.expectedUseStartChapterOrder ?? "?"}章至第${item.expectedUseEndChapterOrder}章`
    : "";
  return [holder, getResourceStatusLabel(item.status), window].filter(Boolean).join(" · ");
}

function getProposalSourceLabel(proposal: ChapterResourceProposal): string {
  return proposal.sourceType === "chapter_background_sync" ? "自动同步发现" : "手动复查发现";
}

function ResourceGroup(props: {
  title: string;
  items: ChapterResourceContextItem[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <div className="text-xs font-medium text-muted-foreground">{props.title}</div>
      {props.items.length > 0 ? (
        <div className="mt-2 space-y-2">
          {props.items.slice(0, 4).map((item) => (
            <div key={item.id} className="rounded-md border border-border/60 bg-muted/15 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{item.name}</span>
                <Badge variant="outline">{getResourceStatusLabel(item.status)}</Badge>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{getResourceLine(item)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-5 text-muted-foreground">{props.emptyText}</div>
      )}
    </div>
  );
}

function CurrentChapterResourcePanel(props: {
  chapterResourceContext: ChapterTabViewProps["chapterResourceContext"];
  isLoadingChapterResourceContext?: boolean;
  resourceWorkflowMode?: ChapterTabViewProps["resourceWorkflowMode"];
  pendingCharacterResourceProposals: NonNullable<ChapterTabViewProps["pendingCharacterResourceProposals"]>;
  onExtractChapterResources?: ChapterTabViewProps["onExtractChapterResources"];
  isExtractingChapterResources?: boolean;
  onConfirmCharacterResourceProposal?: ChapterTabViewProps["onConfirmCharacterResourceProposal"];
  onRejectCharacterResourceProposal?: ChapterTabViewProps["onRejectCharacterResourceProposal"];
  confirmingCharacterResourceProposalId?: string;
  rejectingCharacterResourceProposalId?: string;
}) {
  const {
    chapterResourceContext,
    isLoadingChapterResourceContext,
    resourceWorkflowMode = "manual",
    pendingCharacterResourceProposals,
    onExtractChapterResources,
    isExtractingChapterResources = false,
    onConfirmCharacterResourceProposal,
    onRejectCharacterResourceProposal,
    confirmingCharacterResourceProposalId = "",
    rejectingCharacterResourceProposalId = "",
  } = props;
  const isAutoDirectorMode = resourceWorkflowMode === "auto_director";
  const modeHint = isAutoDirectorMode
    ? "自动导演会记录常规资源变化，只把影响后续写作的高风险变更留给你判断。"
    : "改完正文后可以复查本章资源变化，确认后的结果会影响后续写作。";

  return (
    <div className="rounded-xl border border-border/70 bg-background p-4">
      <div className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold leading-none tracking-tight">本章关键资源</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {isLoadingChapterResourceContext
                ? "资源边界读取中。"
                : chapterResourceContext?.summary ?? "选择章节后，系统会提示本章可用、需铺垫和不可直接使用的资源。"}
            </div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{modeHint}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={isAutoDirectorMode ? "secondary" : "outline"}>
              {isAutoDirectorMode ? "自动同步" : "手动复查"}
            </Badge>
            {pendingCharacterResourceProposals.length > 0 ? (
              <Badge variant="secondary">{pendingCharacterResourceProposals.length}</Badge>
            ) : null}
          </div>
        </div>
        {!isAutoDirectorMode ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExtractChapterResources?.()}
            disabled={isExtractingChapterResources || !onExtractChapterResources}
            className="w-full justify-center gap-2"
          >
            <RefreshCw className={isExtractingChapterResources ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {isExtractingChapterResources ? "复查中..." : "复查本章资源"}
          </Button>
        ) : null}
      </div>
      <div className="space-y-3">
        <ResourceGroup
          title="可用资源"
          items={chapterResourceContext?.availableItems ?? []}
          emptyText="没有需要特别依赖的可用资源。"
        />
        <ResourceGroup
          title="需要铺垫"
          items={chapterResourceContext?.setupNeededItems ?? []}
          emptyText="没有必须先铺垫的资源。"
        />
        <ResourceGroup
          title="不能提前使用"
          items={chapterResourceContext?.blockedItems ?? []}
          emptyText="没有被消耗、丢失或毁坏的关键资源。"
        />
        <ResourceGroup
          title="待确认"
          items={chapterResourceContext?.pendingReviewItems ?? []}
          emptyText="没有需要你确认的高风险资源。"
        />

        {pendingCharacterResourceProposals.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs font-medium text-muted-foreground">需要判断的资源变更</div>
            {pendingCharacterResourceProposals.slice(0, 2).map((proposal) => (
              <div key={proposal.id} className="space-y-2 rounded-md border border-border/70 bg-background p-2">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium leading-5">{proposal.summary}</div>
                  <Badge variant="outline">{getProposalSourceLabel(proposal)}</Badge>
                </div>
                {proposal.evidence[0] ? (
                  <div className="text-[11px] leading-5 text-muted-foreground">证据：{proposal.evidence[0]}</div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onConfirmCharacterResourceProposal?.(proposal.id)}
                    disabled={confirmingCharacterResourceProposalId === proposal.id}
                  >
                    {confirmingCharacterResourceProposalId === proposal.id ? "确认中..." : "确认"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRejectCharacterResourceProposal?.(proposal.id)}
                    disabled={rejectingCharacterResourceProposalId === proposal.id}
                  >
                    {rejectingCharacterResourceProposalId === proposal.id ? "处理中..." : "忽略"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
              streamingPhase={streamingChapterId ? (chapterRunStatus?.phase ?? "streaming") : null}
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
              chapterRuntimePackage={chapterRuntimePackage}
              reviewResult={reviewResult}
              openAuditIssues={openAuditIssues}
              streamContent={streamContent}
              isStreaming={isStreaming}
              streamingChapterId={streamingChapterId}
              streamingChapterLabel={streamingChapterLabel}
              chapterRunStatus={chapterRunStatus}
              onAbortStream={onAbortStream}
              onRunFullAudit={onRunFullAudit}
              isRunningFullAudit={isRunningFullAudit}
              onAutoRepair={onAutoRepair}
              repairStreamContent={repairStreamContent}
              isRepairStreaming={isRepairStreaming}
              repairStreamingChapterId={repairStreamingChapterId}
              repairStreamingChapterLabel={repairStreamingChapterLabel}
              repairRunStatus={repairRunStatus}
              onAbortRepair={onAbortRepair}
            />
          </div>

          <div className="w-full space-y-4 xl:w-[320px] xl:flex-none">
            <CurrentChapterResourcePanel
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
          </div>
        </div>
      </CardContent>
      </Card>
    </div>
  );
}
