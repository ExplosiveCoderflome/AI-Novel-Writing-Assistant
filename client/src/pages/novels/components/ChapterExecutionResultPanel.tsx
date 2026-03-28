import type { Chapter, ReplanRecommendation, ReplanResult, StoryPlan, StoryStateSnapshot, AuditReport } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import StreamOutput from "@/components/common/StreamOutput";
import { ChapterRuntimeAuditCard, ChapterRuntimeContextCard } from "./ChapterRuntimePanels";
import { hasText, type AssetTabKey, MetricBadge } from "./chapterExecution.shared";

interface ChapterExecutionResultPanelProps {
  novelId: string;
  selectedChapter: Chapter | undefined;
  assetTab: AssetTabKey;
  onAssetTabChange: (tab: AssetTabKey) => void;
  chapterPlan?: StoryPlan | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterAuditReports: AuditReport[];
  replanRecommendation?: ReplanRecommendation | null;
  onReplanChapter: () => void;
  isReplanningChapter: boolean;
  lastReplanResult?: ReplanResult | null;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  };
  reviewResult: {
    issues?: Array<{ category: string; fixSuggestion: string }>;
  } | null;
  openAuditIssues: Array<{ id: string; auditType: string; fixSuggestion: string }>;
  streamContent: string;
  isStreaming: boolean;
  onAbortStream: () => void;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  onAbortRepair: () => void;
}

export default function ChapterExecutionResultPanel(props: ChapterExecutionResultPanelProps) {
  const {
    novelId,
    selectedChapter,
    assetTab,
    onAssetTabChange,
    chapterPlan,
    latestStateSnapshot,
    chapterAuditReports,
    replanRecommendation,
    onReplanChapter,
    isReplanningChapter,
    lastReplanResult,
    chapterQualityReport,
    reviewResult,
    openAuditIssues,
    streamContent,
    isStreaming,
    onAbortStream,
    repairStreamContent,
    isRepairStreaming,
    onAbortRepair,
  } = props;

  if (!selectedChapter) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        左侧先选择一个章节，再查看正文结果和 AI 建议。
      </div>
    );
  }

  const savedChapterContent = selectedChapter.content?.trim() ?? "";
  const hasSavedChapterContent = hasText(savedChapterContent);
  const hasLiveWritingOutput = hasText(streamContent);
  const useLiveWritingPanel = isStreaming || (!hasSavedChapterContent && hasLiveWritingOutput);
  const contentPanelTitle = useLiveWritingPanel ? "本章写作输出" : "当前保存正文";
  const contentPanelContent = useLiveWritingPanel
    ? streamContent
    : hasSavedChapterContent
      ? savedChapterContent
      : hasLiveWritingOutput
        ? streamContent
        : "";
  const contentPanelWordCount = contentPanelContent.trim().length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base">当前章节结果</CardTitle>
              <div className="text-sm text-muted-foreground">正文放在正中主视图，任务单、场景拆解、质量报告和修复记录都退到二级标签。</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={`/novels/${novelId}/chapters/${selectedChapter.id}`}>打开编辑器</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={assetTab} onValueChange={(value) => onAssetTabChange(value as AssetTabKey)}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="content">正文</TabsTrigger>
              <TabsTrigger value="taskSheet">任务单</TabsTrigger>
              <TabsTrigger value="sceneCards">场景拆解</TabsTrigger>
              <TabsTrigger value="quality">质量报告</TabsTrigger>
              <TabsTrigger value="repair">修复记录</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-3">
              <div className="rounded-md border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{contentPanelTitle}</span>
                  <div className="flex items-center gap-2">
                    {isStreaming ? (
                      <span className="text-xs text-muted-foreground">正在生成...</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">字数: {contentPanelWordCount}</span>
                    )}
                    {isStreaming ? (
                      <Button size="sm" variant="secondary" onClick={onAbortStream}>
                        停止生成
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                  <MarkdownViewer content={contentPanelContent || "当前章节尚未生成正文。"} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="taskSheet" className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-2 text-xs text-muted-foreground">本章任务单</div>
                <div className="whitespace-pre-wrap text-sm leading-7">
                  {selectedChapter.taskSheet?.trim() || "暂无任务单。你可以先让 AI 生成任务单，再继续细修。"}
                </div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="mb-2 text-xs text-muted-foreground">章节目标</div>
                <div className="text-sm leading-7 text-muted-foreground">
                  {chapterPlan?.objective ?? selectedChapter.expectation ?? "暂无明确章节目标。"}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sceneCards" className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-2 text-xs text-muted-foreground">场景拆解</div>
                <div className="whitespace-pre-wrap text-sm leading-7">
                  {selectedChapter.sceneCards?.trim() || "暂无场景拆解。"}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="quality" className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <MetricBadge label="总体" value={String(chapterQualityReport?.overall ?? selectedChapter.qualityScore ?? "-")} />
                <MetricBadge label="连贯性" value={String(chapterQualityReport?.coherence ?? "-")} />
                <MetricBadge label="重复度" value={String(chapterQualityReport?.repetition ?? "-")} />
                <MetricBadge label="节奏" value={String(chapterQualityReport?.pacing ?? selectedChapter.pacingScore ?? "-")} />
                <MetricBadge label="文风" value={String(chapterQualityReport?.voice ?? "-")} />
                <MetricBadge label="吸引力" value={String(chapterQualityReport?.engagement ?? "-")} />
              </div>

              <div className="rounded-xl border p-4 text-sm">
                <div className="font-medium">最近审校问题</div>
                {reviewResult?.issues?.length ? (
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {reviewResult.issues.slice(0, 5).map((item, index) => (
                      <div key={`${item.category}-${index}`} className="rounded-md border p-2">
                        <div className="font-medium text-foreground">{item.category}</div>
                        <div className="mt-1">{item.fixSuggestion}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">当前没有最近审校问题。</div>
                )}
              </div>

              <div className="rounded-xl border p-4 text-sm">
                <div className="font-medium">结构化审计问题</div>
                {openAuditIssues.length > 0 ? (
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {openAuditIssues.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-md border p-2">
                        <div className="font-medium text-foreground">{item.auditType}</div>
                        <div className="mt-1">{item.fixSuggestion}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">当前没有结构化审计问题。</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="repair" className="space-y-3">
              {(isRepairStreaming || hasText(repairStreamContent)) ? (
                <StreamOutput
                  title="问题修复输出"
                  emptyText="等待修复输出..."
                  content={repairStreamContent}
                  isStreaming={isRepairStreaming}
                  onAbort={onAbortRepair}
                />
              ) : null}
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-2 text-xs text-muted-foreground">修复记录</div>
                <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-7">
                  {selectedChapter.repairHistory?.trim() || "暂无修复记录。"}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Tabs defaultValue="context">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="context">本章目标与上下文</TabsTrigger>
          <TabsTrigger value="audit">当前问题与修复建议</TabsTrigger>
        </TabsList>
        <TabsContent value="context">
          <ChapterRuntimeContextCard
            runtimePackage={null}
            chapterPlan={chapterPlan}
            stateSnapshot={latestStateSnapshot}
          />
        </TabsContent>
        <TabsContent value="audit">
          <ChapterRuntimeAuditCard
            runtimePackage={null}
            auditReports={chapterAuditReports}
            replanRecommendation={replanRecommendation}
            onReplan={onReplanChapter}
            isReplanning={isReplanningChapter}
            lastReplanResult={lastReplanResult}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
