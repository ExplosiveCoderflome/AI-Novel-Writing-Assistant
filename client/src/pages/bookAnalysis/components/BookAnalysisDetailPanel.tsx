import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type {
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
} from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { AggregatedEvidenceItem, SectionDraft, SectionEvidenceItem } from "../bookAnalysis.types";
import {
  formatDate,
  formatStage,
  formatStatus,
  isBookAnalysisBudgetExceeded,
} from "../bookAnalysis.utils";
import {
  getPreferredBookAnalysisSection,
  isReadableBookAnalysisSection,
  isUnselectedBookAnalysisSection,
  summarizeBookAnalysisSections,
} from "../bookAnalysisWorkspaceViewModel";
import type { BookAnalysisMode } from "../hooks/bookAnalysisWorkspace.types";
import type {
  BookAnalysisChapterHighlightRange,
  BookAnalysisChapterReaderHandle,
} from "../hooks/useBookAnalysisChapterReader";
import BookAnalysisDualPaneLayout from "./BookAnalysisDualPaneLayout";
import BookAnalysisSectionCard from "./BookAnalysisSectionCard";
import SelectControl from "@/components/common/SelectControl";

type ExportFormat = "markdown" | "json";

function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}

interface NovelOption {
  id: string;
  title: string;
}

interface PendingState {
  regenerate: boolean;
  optimizePreview: boolean;
  saveSection: boolean;
  publish: boolean;
}

interface BookAnalysisDetailPanelProps {
  analysisMode: BookAnalysisMode;
  selectedAnalysis: BookAnalysisDetail;
  novelOptions: NovelOption[];
  documentChapters: DocumentChapter[];
  sourceVersionContent: string;
  sourceLoading: boolean;
  sourceError: string;
  chaptersLoading: boolean;
  chaptersError: string;
  selectedNovelId: string;
  publishFeedback: string;
  styleProfileFeedback: string;
  lastPublishResult: BookAnalysisPublishResult | null;
  aggregatedEvidence: AggregatedEvidenceItem[];
  optimizingSectionKey: BookAnalysisSection["sectionKey"] | null;
  isDualPane: boolean;
  currentChapterIndex: number | null;
  chapterHighlightRange: BookAnalysisChapterHighlightRange | null;
  chapterReaderRef: RefObject<BookAnalysisChapterReaderHandle | null>;
  rightColumnExtra?: ReactNode;
  pending: PendingState;
  onActiveChapterChange: (chapterIndex: number) => void;
  onSelectChapter: (chapterIndex: number) => void;
  onEvidenceJump: (chapterIndex: number, range: { start: number; end: number }) => void;
  onRetrySource: () => void;
  onRetryChapters: () => void;
  onSelectedNovelChange: (novelId: string) => void;
  onPublish: () => void;
  onRegenerateSection: (section: BookAnalysisSection) => void;
  onOptimizeSection: (section: BookAnalysisSection) => void;
  onApplyOptimizePreview: (section: BookAnalysisSection) => void;
  onCancelOptimizePreview: (section: BookAnalysisSection) => void;
  onSaveSection: (section: BookAnalysisSection) => void;
  onDraftChange: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  getSectionDraft: (section: BookAnalysisSection) => SectionDraft;
}

export default function BookAnalysisDetailPanel(props: BookAnalysisDetailPanelProps) {
  const {
    analysisMode,
    selectedAnalysis,
    novelOptions,
    documentChapters,
    sourceVersionContent,
    sourceLoading,
    sourceError,
    chaptersLoading,
    chaptersError,
    selectedNovelId,
    publishFeedback,
    styleProfileFeedback,
    lastPublishResult,
    aggregatedEvidence,
    optimizingSectionKey,
    isDualPane,
    currentChapterIndex,
    chapterHighlightRange,
    chapterReaderRef,
    rightColumnExtra,
    pending,
    onActiveChapterChange,
    onSelectChapter,
    onEvidenceJump,
    onRetrySource,
    onRetryChapters,
    onSelectedNovelChange,
    onPublish,
    onRegenerateSection,
    onOptimizeSection,
    onApplyOptimizePreview,
    onCancelOptimizePreview,
    onSaveSection,
    onDraftChange,
    getSectionDraft,
  } = props;
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState("");
  const [readingMode, setReadingMode] = useState<"summary" | "full">("full");
  const [activeSectionKey, setActiveSectionKey] = useState<BookAnalysisSectionKey | "">("");
  const previousAnalysisIdRef = useRef<string | null>(null);
  const previousAnalysisStatusRef = useRef<BookAnalysisDetail["status"] | null>(null);

  const evidenceEntries = useMemo<SectionEvidenceItem[]>(
    () => aggregatedEvidence.map((item, index) => ({
      ...item,
      evidenceKey: `${item.sectionKey}-${index}`,
    })),
    [aggregatedEvidence],
  );

  const evidenceBySection = useMemo(() => {
    const groups = new Map<BookAnalysisSectionKey, SectionEvidenceItem[]>();
    for (const item of evidenceEntries) {
      const next = groups.get(item.sectionKey) ?? [];
      next.push(item);
      groups.set(item.sectionKey, next);
    }
    return groups;
  }, [evidenceEntries]);

  const selectedEvidence = useMemo(() => {
    if (!selectedEvidenceKey) {
      return null;
    }
    return evidenceEntries.find((item) => item.evidenceKey === selectedEvidenceKey) ?? null;
  }, [evidenceEntries, selectedEvidenceKey]);

  const selectedEvidenceChapter = useMemo(() => {
    if (!selectedEvidence || selectedEvidence.chapterIndex === undefined) {
      return null;
    }
    return documentChapters.find((chapter) => chapter.chapterIndex === selectedEvidence.chapterIndex) ?? null;
  }, [documentChapters, selectedEvidence]);

  const selectedChapterContent = selectedEvidenceChapter && sourceVersionContent
    ? sourceVersionContent.slice(selectedEvidenceChapter.startOffset, selectedEvidenceChapter.endOffset)
    : "";

  const handleSelectEvidence = (evidenceKey: string) => {
    const item = evidenceEntries.find((entry) => entry.evidenceKey === evidenceKey);
    const willSelect = selectedEvidenceKey !== evidenceKey;
    setSelectedEvidenceKey(willSelect ? evidenceKey : "");
    if (
      willSelect &&
      isDualPane &&
      item?.chapterIndex !== undefined &&
      item.excerptOffsetRange
    ) {
      onEvidenceJump(item.chapterIndex, item.excerptOffsetRange);
    }
  };

  const sectionStats = useMemo(
    () => summarizeBookAnalysisSections(selectedAnalysis),
    [selectedAnalysis],
  );

  useEffect(() => {
    const analysisChanged = previousAnalysisIdRef.current !== selectedAnalysis.id;
    const previousStatus = previousAnalysisStatusRef.current;
    const generationJustFinished = !analysisChanged
      && (previousStatus === "queued" || previousStatus === "running")
      && selectedAnalysis.status !== "queued"
      && selectedAnalysis.status !== "running";
    previousAnalysisIdRef.current = selectedAnalysis.id;
    previousAnalysisStatusRef.current = selectedAnalysis.status;
    if (analysisChanged) {
      setSelectedEvidenceKey("");
    }
    if (!selectedAnalysis.sections.length) {
      setActiveSectionKey("");
      return;
    }
    const activeSection = selectedAnalysis.sections.find((section) => section.sectionKey === activeSectionKey);
    if (analysisChanged || !activeSection || (generationJustFinished && !isReadableBookAnalysisSection(activeSection))) {
      const preferred = getPreferredBookAnalysisSection(selectedAnalysis.sections);
      setActiveSectionKey((preferred?.sectionKey ?? selectedAnalysis.sections[0].sectionKey) as BookAnalysisSectionKey);
    }
  }, [activeSectionKey, selectedAnalysis]);

  const activeTabValue =
    activeSectionKey || (selectedAnalysis.sections[0]?.sectionKey as BookAnalysisSectionKey | undefined) || "overview";
  const budgetTokens = selectedAnalysis.budgetTokens ?? null;
  const usedTokens = selectedAnalysis.usedTokens ?? 0;
  const budgetUsageRatio = budgetTokens ? Math.min(1, usedTokens / budgetTokens) : 0;
  const budgetExceeded = isBookAnalysisBudgetExceeded(selectedAnalysis.lastError);

  return (
    <div className="space-y-3">

      {selectedAnalysis.lastError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {budgetExceeded
            ? `预算用尽，任务已停止。累计用量 ${formatTokenCount(usedTokens)} / ${formatTokenCount(budgetTokens)} tokens。建议先扩容预算后续跑。`
            : `最近错误：${selectedAnalysis.lastError}`}
        </div>
      ) : null}

      {sourceLoading || chaptersLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-info/25 bg-info/5 p-3 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin text-info" aria-hidden="true" />
          正在加载原文阅读位置，拆书结果仍可继续查看。
        </div>
      ) : null}

      {sourceError || chaptersError ? (
        <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <div className="font-medium text-foreground">原文对照暂时不可用</div>
              <div className="mt-1 text-muted-foreground">
                {chaptersError || sourceError} 已生成的拆书结果不会被隐藏或删除。
              </div>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={chaptersError ? onRetryChapters : onRetrySource}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            重试原文加载
          </Button>
        </div>
      ) : null}

      <BookAnalysisDualPaneLayout
        enabled={isDualPane && !sourceError && !chaptersError}
        chapters={documentChapters}
        sourceVersionContent={sourceVersionContent}
        readerRef={chapterReaderRef}
        currentChapterIndex={currentChapterIndex}
        highlightRange={chapterHighlightRange}
        onActiveChapterChange={onActiveChapterChange}
        onSelectChapter={onSelectChapter}
      >
        <div className="space-y-3">
          <details className="rounded-md border bg-background p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">分析信息与发布</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    计划小节 {sectionStats.readableExpected}/{sectionStats.expected} 可阅读
                    {sectionStats.unselected > 0 ? `，本次未选择 ${sectionStats.unselected} 节` : ""}
                    {sectionStats.frozenReadable > 0 ? `，已冻结结果 ${sectionStats.frozenReadable} 节` : ""}
                  </div>
                </div>
                <Badge variant="outline">展开</Badge>
              </div>
            </summary>
            <div className="mt-3 space-y-3">
              {!selectedAnalysis.isCurrentVersion ? (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-foreground">
                  该分析基于旧版源文档，当前激活文档版本为 v{selectedAnalysis.currentDocumentVersionNumber}。
                </div>
              ) : null}
              {styleProfileFeedback ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  {styleProfileFeedback}
                </div>
              ) : null}
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-2 font-medium">发布到小说知识库</div>
                <div className="flex flex-wrap items-center gap-2">
                  <SelectControl
                    className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm"
                    value={selectedNovelId}
                    onChange={(event) => onSelectedNovelChange(event.target.value)}
                  >
                    <option value="">选择目标小说</option>
                    {novelOptions.map((novel) => (
                      <option key={novel.id} value={novel.id}>
                        {novel.title}
                      </option>
                    ))}
                  </SelectControl>
                  <Button
                    size="sm"
                    onClick={onPublish}
                    disabled={!selectedNovelId || pending.publish || selectedAnalysis.status === "archived"}
                  >
                    发布并绑定
                  </Button>
                </div>
                {publishFeedback ? <div className="mt-2 text-xs text-muted-foreground">{publishFeedback}</div> : null}
                {lastPublishResult ? (
                  <div className="mt-1 text-xs text-muted-foreground">发布时间：{formatDate(lastPublishResult.publishedAt)}</div>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">概要</div>
                  <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
                    {selectedAnalysis.summary?.trim() || "生成总览后会在此显示概要内容。"}
                  </div>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">运行元信息</div>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>提供商：{selectedAnalysis.provider ?? "deepseek"}</div>
                    <div>模型：{selectedAnalysis.model || "默认"}</div>
                    <div>温度：{selectedAnalysis.temperature ?? "默认"}</div>
                    <div>最大 Tokens：{selectedAnalysis.maxTokens ?? "默认"}</div>
                    <div>
                      预算用量：{budgetTokens
                        ? `${formatTokenCount(usedTokens)} / ${formatTokenCount(budgetTokens)} tokens`
                        : "不限"}
                    </div>
                    {budgetTokens ? (
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label="拆书预算使用进度"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(budgetUsageRatio * 100)}
                      >
                        <div
                          className={`h-full rounded-full ${budgetExceeded ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.round(budgetUsageRatio * 100)}%` }}
                        />
                      </div>
                    ) : null}
                    <div>原文范围：{selectedAnalysis.sourceRange?.label ?? "全文"}</div>
                    <div>当前阶段：{formatStage(selectedAnalysis.currentStage)}</div>
                    <div>当前 section：{selectedAnalysis.currentItemLabel ?? "暂无"}</div>
                    <div>最近心跳：{formatDate(selectedAnalysis.heartbeatAt)}</div>
                    <div>最近运行：{formatDate(selectedAnalysis.lastRunAt)}</div>
                    <div>创建时间：{formatDate(selectedAnalysis.createdAt)}</div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <section className="rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">拆书内容</div>
                <Badge variant="outline">可读 {sectionStats.readableExpected}/{sectionStats.expected}</Badge>
                {sectionStats.unselected > 0 ? <Badge variant="secondary">本次未选择 {sectionStats.unselected}</Badge> : null}
                {sectionStats.frozenReadable > 0 ? <Badge variant="secondary">已冻结结果 {sectionStats.frozenReadable}</Badge> : null}
              </div>
              <div className="flex rounded-md border bg-background p-1">
                <Button
                  size="sm"
                  variant={readingMode === "summary" ? "default" : "ghost"}
                  onClick={() => setReadingMode("summary")}
                >
                  重点速览
                </Button>
                <Button
                  size="sm"
                  variant={readingMode === "full" ? "default" : "ghost"}
                  onClick={() => setReadingMode("full")}
                >
                  完整阅读
                </Button>
              </div>
            </div>
            <div className="space-y-3 p-3">
              {selectedAnalysis.sections.length === 0 ? (
                <div className="rounded-md border border-dashed border-warning/40 bg-warning/5 px-5 py-8 text-center">
                  <AlertTriangle className="mx-auto h-5 w-5 text-warning" aria-hidden="true" />
                  <div className="mt-3 text-sm font-medium text-foreground">没有可展示的拆书小节</div>
                  <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                    这份任务没有返回可阅读内容。源文档仍然安全，可以从上方重新生成或打开任务中心查看详情。
                  </p>
                </div>
              ) : (
              <Tabs
                value={activeTabValue}
                onValueChange={(value) => setActiveSectionKey(value as BookAnalysisSectionKey)}
                className="space-y-3"
              >
                <TabsList className="flex h-auto flex-wrap justify-start gap-1">
                  {selectedAnalysis.sections.map((section) => (
                    <TabsTrigger key={section.sectionKey} value={section.sectionKey} className="gap-2">
                      <span>{section.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {section.frozen
                          ? isUnselectedBookAnalysisSection(section) ? "本次未选择" : "已冻结"
                          : formatStatus(section.status)}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {selectedAnalysis.sections.map((section) => {
                  const sectionEvidence = evidenceBySection.get(section.sectionKey as BookAnalysisSectionKey) ?? [];
                  const isSelectedEvidenceInSection = selectedEvidence?.sectionKey === section.sectionKey;
                  return (
                    <TabsContent key={section.sectionKey} value={section.sectionKey} className="mt-0">
                      <BookAnalysisSectionCard
                        analysisMode={analysisMode}
                        section={section}
                        draft={getSectionDraft(section)}
                        readingMode={readingMode}
                        canOperate={selectedAnalysis.status !== "archived"}
                        isRegenerating={pending.regenerate}
                        isOptimizing={pending.optimizePreview && optimizingSectionKey === section.sectionKey}
                        isSaving={pending.saveSection}
                        evidenceItems={sectionEvidence}
                        selectedEvidenceKey={selectedEvidenceKey}
                        selectedEvidence={isSelectedEvidenceInSection ? selectedEvidence : null}
                        selectedEvidenceChapter={isSelectedEvidenceInSection ? selectedEvidenceChapter : null}
                        selectedChapterContent={isSelectedEvidenceInSection ? selectedChapterContent : ""}
                        isDualPane={isDualPane}
                        currentChapterIndex={isDualPane ? currentChapterIndex : null}
                        onSelectEvidence={handleSelectEvidence}
                        onDraftChange={onDraftChange}
                        onRegenerate={onRegenerateSection}
                        onOptimize={onOptimizeSection}
                        onApplyOptimizePreview={onApplyOptimizePreview}
                        onCancelOptimizePreview={onCancelOptimizePreview}
                        onSave={onSaveSection}
                      />
                    </TabsContent>
                  );
                })}
              </Tabs>
              )}
            </div>
          </section>
          {rightColumnExtra}
        </div>
      </BookAnalysisDualPaneLayout>
    </div>
  );
}
