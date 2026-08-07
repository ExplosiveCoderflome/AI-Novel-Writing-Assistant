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
          The original text reading position is being loaded. The results of unpacking the book can still be viewed.
                          </div>
      ) : null}

      {sourceError || chaptersError ? (
        <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <div className="font-medium text-foreground">Original text comparison is temporarily unavailable</div>
              <div className="mt-1 text-muted-foreground">
                {chaptersError || sourceError} The generated book-opening results will not be hidden or deleted.
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
            Retry original text loading
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
                  <div className="text-sm font-medium">Analyzing information and publishing</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    planning section {sectionStats.readableExpected}/{sectionStats.expected} Readable
                                                          {sectionStats.unselected > 0 ? `，本次未选择 ${sectionStats.unselected} 节` : ""}
                    {sectionStats.frozenReadable > 0 ? `，已冻结结果 ${sectionStats.frozenReadable} 节` : ""}
                  </div>
                </div>
                <Badge variant="outline">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</Badge>
              </div>
            </summary>
            <div className="mt-3 space-y-3">
              {!selectedAnalysis.isCurrentVersion ? (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-foreground">
                  This analysis is based on an older version of the source document, currently the active document version is v{selectedAnalysis.currentDocumentVersionNumber}。
                </div>
              ) : null}
              {styleProfileFeedback ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  {styleProfileFeedback}
                </div>
              ) : null}
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-2 font-medium">Publish to novel knowledge base</div>
                <div className="flex flex-wrap items-center gap-2">
                  <SelectControl
                    className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm"
                    value={selectedNovelId}
                    onChange={(event) => onSelectedNovelChange(event.target.value)}
                  >
                    <option value="">Select target novel</option>
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
                    publish and bind
                                                        </Button>
                </div>
                {publishFeedback ? <div className="mt-2 text-xs text-muted-foreground">{publishFeedback}</div> : null}
                {lastPublishResult ? (
                  <div className="mt-1 text-xs text-muted-foreground">Release time:{formatDate(lastPublishResult.publishedAt)}</div>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">Summary</div>
                  <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
                    {selectedAnalysis.summary?.trim() || "The summary will be displayed here after the overview is generated."}
                  </div>
                </div>
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">Run meta information</div>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>Provider:{selectedAnalysis.provider ?? "deepseek"}</div>
                    <div>Model:{selectedAnalysis.model || "default"}</div>
                    <div>temperature:{selectedAnalysis.temperature ?? "default"}</div>
                    <div>Maximum Tokens:{selectedAnalysis.maxTokens ?? "default"}</div>
                    <div>
                      Budget usage:{budgetTokens
                        ? `${formatTokenCount(usedTokens)} / ${formatTokenCount(budgetTokens)} tokens`
                        : "No limit"}
                    </div>
                    {budgetTokens ? (
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label="Book splitting budget usage progress"
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
                    <div>Original scope:{selectedAnalysis.sourceRange?.label ?? "full text"}</div>
                    <div>Current stage:{formatStage(selectedAnalysis.currentStage)}</div>
                    <div>Current section:{selectedAnalysis.currentItemLabel ?? "None yet"}</div>
                    <div>Recent heartbeat:{formatDate(selectedAnalysis.heartbeatAt)}</div>
                    <div>Recently run:{formatDate(selectedAnalysis.lastRunAt)}</div>
                    <div>Creation time:{formatDate(selectedAnalysis.createdAt)}</div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <section className="rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">Open book content</div>
                <Badge variant="outline">readable {sectionStats.readableExpected}/{sectionStats.expected}</Badge>
                {sectionStats.unselected > 0 ? <Badge variant="secondary">Not selected this time {sectionStats.unselected}</Badge> : null}
                {sectionStats.frozenReadable > 0 ? <Badge variant="secondary">Results frozen {sectionStats.frozenReadable}</Badge> : null}
              </div>
              <div className="flex rounded-md border bg-background p-1">
                <Button
                  size="sm"
                  variant={readingMode === "summary" ? "default" : "ghost"}
                  onClick={() => setReadingMode("summary")}
                >
                  Highlights
                                                  </Button>
                <Button
                  size="sm"
                  variant={readingMode === "full" ? "default" : "ghost"}
                  onClick={() => setReadingMode("full")}
                >
                  Read in full
                                                  </Button>
              </div>
            </div>
            <div className="space-y-3 p-3">
              {selectedAnalysis.sections.length === 0 ? (
                <div className="rounded-md border border-dashed border-warning/40 bg-warning/5 px-5 py-8 text-center">
                  <AlertTriangle className="mx-auto h-5 w-5 text-warning" aria-hidden="true" />
                  <div className="mt-3 text-sm font-medium text-foreground">There is no unpacking section to display</div>
                  <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                    This task returned no readable content. The source document is still safe and can be regenerated from above or open the Task Center to view details.
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
                        {section.frozen ? isUnselectedBookAnalysisSection(section) ? "Not selected this time" : "Frozen" : formatStatus(section.status)}
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
