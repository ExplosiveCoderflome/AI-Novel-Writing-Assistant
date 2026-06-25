import { useEffect, useMemo, useState } from "react";
import type {
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
} from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AggregatedEvidenceItem, SectionDraft, SectionEvidenceItem } from "../bookAnalysis.types";
import { formatDate, formatStage, formatStatus } from "../bookAnalysis.utils";
import type { BookAnalysisMode } from "../hooks/bookAnalysisWorkspace.types";
import BookAnalysisSectionCard from "./BookAnalysisSectionCard";

type ExportFormat = "markdown" | "json";

interface NovelOption {
  id: string;
  title: string;
}

interface PendingState {
  copy: boolean;
  rebuild: boolean;
  archive: boolean;
  regenerate: boolean;
  optimizePreview: boolean;
  saveSection: boolean;
  publish: boolean;
  createStyleProfile: boolean;
}

interface BookAnalysisDetailPanelProps {
  analysisMode: BookAnalysisMode;
  selectedAnalysis?: BookAnalysisDetail;
  novelOptions: NovelOption[];
  documentChapters: DocumentChapter[];
  sourceVersionContent: string;
  selectedNovelId: string;
  publishFeedback: string;
  styleProfileFeedback: string;
  lastPublishResult: BookAnalysisPublishResult | null;
  aggregatedEvidence: AggregatedEvidenceItem[];
  optimizingSectionKey: BookAnalysisSection["sectionKey"] | null;
  pending: PendingState;
  onSelectedNovelChange: (novelId: string) => void;
  onCopy: () => void;
  onRebuild: (analysisId: string) => void;
  onArchive: (analysisId: string) => void;
  onDownload: (format: ExportFormat) => void;
  onPublish: () => void;
  onCreateStyleProfile: () => void;
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
    selectedNovelId,
    publishFeedback,
    styleProfileFeedback,
    lastPublishResult,
    aggregatedEvidence,
    optimizingSectionKey,
    pending,
    onSelectedNovelChange,
    onCopy,
    onRebuild,
    onArchive,
    onDownload,
    onPublish,
    onCreateStyleProfile,
    onRegenerateSection,
    onOptimizeSection,
    onApplyOptimizePreview,
    onCancelOptimizePreview,
    onSaveSection,
    onDraftChange,
    getSectionDraft,
  } = props;
  const [selectedEvidenceKey, setSelectedEvidenceKey] = useState("");
  const [readingMode, setReadingMode] = useState<"summary" | "full">("summary");
  const [activeSectionKey, setActiveSectionKey] = useState<BookAnalysisSectionKey | "">("");

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

  const sectionStats = useMemo(() => {
    if (!selectedAnalysis) {
      return {
        total: 0,
        succeeded: 0,
        active: 0,
        frozen: 0,
      };
    }
    return selectedAnalysis.sections.reduce(
      (acc, section) => {
        acc.total += 1;
        if (section.status === "succeeded") {
          acc.succeeded += 1;
        }
        if (!section.frozen) {
          acc.active += 1;
        }
        if (section.frozen) {
          acc.frozen += 1;
        }
        return acc;
      },
      { total: 0, succeeded: 0, active: 0, frozen: 0 },
    );
  }, [selectedAnalysis]);

  useEffect(() => {
    if (!selectedAnalysis?.sections.length) {
      return;
    }
    const hasActiveSection = selectedAnalysis.sections.some((section) => section.sectionKey === activeSectionKey);
    if (!hasActiveSection) {
      setActiveSectionKey(selectedAnalysis.sections[0].sectionKey as BookAnalysisSectionKey);
    }
  }, [activeSectionKey, selectedAnalysis]);

  if (!selectedAnalysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>拆书分析工作区</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          请先在左侧选择一个分析，或从知识文档创建新分析。
        </CardContent>
      </Card>
    );
  }

  const activeTabValue =
    activeSectionKey || (selectedAnalysis.sections[0]?.sectionKey as BookAnalysisSectionKey | undefined) || "overview";

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-30 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-normal">{selectedAnalysis.title}</h2>
              <Badge variant="outline">{formatStatus(selectedAnalysis.status)}</Badge>
              {selectedAnalysis.publishedDocumentId ? <Badge variant="secondary">已发布</Badge> : null}
              <Badge variant="outline">进度 {Math.round(selectedAnalysis.progress * 100)}%</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedAnalysis.documentTitle} | 源版本 v{selectedAnalysis.documentVersionNumber}
              {selectedAnalysis.isCurrentVersion ? "" : ` | 当前激活版本 v${selectedAnalysis.currentDocumentVersionNumber}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onCopy} disabled={pending.copy}>
              复制
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRebuild(selectedAnalysis.id)}
              disabled={pending.rebuild || selectedAnalysis.status === "archived"}
            >
              重新生成
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/tasks?kind=book_analysis&id=${selectedAnalysis.id}`}>任务中心</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDownload("markdown")}>
              导出 MD
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDownload("json")}>
              导出 JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCreateStyleProfile}
              disabled={pending.createStyleProfile || selectedAnalysis.status === "archived"}
            >
              {pending.createStyleProfile ? "生成写法中..." : "生成写法"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onArchive(selectedAnalysis.id)}
              disabled={pending.archive || selectedAnalysis.status === "archived"}
            >
              归档
            </Button>
          </div>
        </div>
      </div>

      {selectedAnalysis.lastError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          最近错误：{selectedAnalysis.lastError}
        </div>
      ) : null}

      <details className="rounded-md border bg-background p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">分析信息与发布</div>
              <div className="mt-1 text-xs text-muted-foreground">
                完成 {sectionStats.succeeded}/{sectionStats.total}，生成 {sectionStats.active} 项
                {sectionStats.frozen > 0 ? `，冻结 ${sectionStats.frozen} 项` : ""}
              </div>
            </div>
            <Badge variant="outline">展开</Badge>
          </div>
        </summary>
        <div className="mt-3 space-y-3">
          {!selectedAnalysis.isCurrentVersion ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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
              <select
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
              </select>
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
            <Badge variant="outline">完成 {sectionStats.succeeded}/{sectionStats.total}</Badge>
            <Badge variant="outline">生成 {sectionStats.active} 项</Badge>
            {sectionStats.frozen > 0 ? <Badge variant="secondary">冻结 {sectionStats.frozen} 项</Badge> : null}
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
                    {section.frozen ? "冻结" : formatStatus(section.status)}
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
                    canOperate={Boolean(selectedAnalysis)}
                    isRegenerating={pending.regenerate}
                    isOptimizing={pending.optimizePreview && optimizingSectionKey === section.sectionKey}
                    isSaving={pending.saveSection}
                    evidenceItems={sectionEvidence}
                    selectedEvidenceKey={selectedEvidenceKey}
                    selectedEvidence={isSelectedEvidenceInSection ? selectedEvidence : null}
                    selectedEvidenceChapter={isSelectedEvidenceInSection ? selectedEvidenceChapter : null}
                    selectedChapterContent={isSelectedEvidenceInSection ? selectedChapterContent : ""}
                    onSelectEvidence={(evidenceKey) => setSelectedEvidenceKey((current) => current === evidenceKey ? "" : evidenceKey)}
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
        </div>
      </section>
    </div>
  );
}
