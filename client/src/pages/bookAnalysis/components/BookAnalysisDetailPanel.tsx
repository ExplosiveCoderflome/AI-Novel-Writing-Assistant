import type { BookAnalysisDetail, BookAnalysisPublishResult, BookAnalysisSection } from "@ai-novel/shared/types/bookAnalysis";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AggregatedEvidenceItem, SectionDraft } from "../bookAnalysis.types";
import { formatDate, formatStage, formatStatus } from "../bookAnalysis.utils";
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
  selectedAnalysis?: BookAnalysisDetail;
  novelOptions: NovelOption[];
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
    selectedAnalysis,
    novelOptions,
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{selectedAnalysis.title}</CardTitle>
              <div className="text-sm text-muted-foreground">
                {selectedAnalysis.documentTitle} | 源版本 v{selectedAnalysis.documentVersionNumber}
                {selectedAnalysis.isCurrentVersion ? "" : ` | 当前激活版本 v${selectedAnalysis.currentDocumentVersionNumber}`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{formatStatus(selectedAnalysis.status)}</Badge>
              {selectedAnalysis.publishedDocumentId && (
                <Badge variant="secondary">已发布</Badge>
              )}
              <Badge variant="outline">进度 {Math.round(selectedAnalysis.progress * 100)}%</Badge>
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
                <Link to={`/tasks?kind=book_analysis&id=${selectedAnalysis.id}`}>在任务中心查看</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDownload("markdown")}>
                导出 Markdown
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
                {pending.createStyleProfile ? "生成写法中..." : "从拆书生成写法"}
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
        </CardHeader>
        <CardContent className="space-y-3">
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
          {selectedAnalysis.lastError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              最近错误：{selectedAnalysis.lastError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedAnalysis.sections.map((section) => (
        <BookAnalysisSectionCard
          key={section.id}
          section={section}
          draft={getSectionDraft(section)}
          canOperate={Boolean(selectedAnalysis)}
          isRegenerating={pending.regenerate}
          isOptimizing={pending.optimizePreview && optimizingSectionKey === section.sectionKey}
          isSaving={pending.saveSection}
          onDraftChange={onDraftChange}
          onRegenerate={onRegenerateSection}
          onOptimize={onOptimizeSection}
          onApplyOptimizePreview={onApplyOptimizePreview}
          onCancelOptimizePreview={onCancelOptimizePreview}
          onSave={onSaveSection}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>证据面板</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {aggregatedEvidence.map((item, index) => (
            <div key={`${item.sectionTitle}-${index}`} className="rounded-md border p-3 text-sm">
              <div className="font-medium">
                {item.sectionTitle} | [{item.sourceLabel}] {item.label}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.excerpt}</div>
            </div>
          ))}
          {aggregatedEvidence.length === 0 ? (
            <div className="text-sm text-muted-foreground">当前分析暂无证据内容。</div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
