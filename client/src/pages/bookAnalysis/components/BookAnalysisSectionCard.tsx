import {
  BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS,
  type BookAnalysisSection,
} from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import { LocateFixed } from "lucide-react";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SectionDraft, SectionEvidenceItem } from "../bookAnalysis.types";
import { formatStatus } from "../bookAnalysis.utils";
import { isUnselectedBookAnalysisSection } from "../bookAnalysisWorkspaceViewModel";
import type { BookAnalysisMode } from "../hooks/bookAnalysisWorkspace.types";
import BookAnalysisStructuredSummary from "./BookAnalysisStructuredSummary";

interface BookAnalysisSectionCardProps {
  analysisMode: BookAnalysisMode;
  section: BookAnalysisSection;
  draft: SectionDraft;
  readingMode: "summary" | "full";
  canOperate: boolean;
  isRegenerating: boolean;
  isOptimizing: boolean;
  isSaving: boolean;
  evidenceItems: SectionEvidenceItem[];
  selectedEvidenceKey: string;
  selectedEvidence: SectionEvidenceItem | null;
  selectedEvidenceChapter: DocumentChapter | null;
  selectedChapterContent: string;
  isDualPane: boolean;
  currentChapterIndex: number | null;
  onSelectEvidence: (evidenceKey: string) => void;
  onDraftChange: (section: BookAnalysisSection, patch: Partial<SectionDraft>) => void;
  onRegenerate: (section: BookAnalysisSection) => void;
  onOptimize: (section: BookAnalysisSection) => void;
  onApplyOptimizePreview: (section: BookAnalysisSection) => void;
  onCancelOptimizePreview: (section: BookAnalysisSection) => void;
  onSave: (section: BookAnalysisSection) => void;
}

function formatEvidenceBinding(item: SectionEvidenceItem): string {
  if (!item.fieldKey) {
    return item.label;
  }
  const label = BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[item.fieldKey] ?? item.fieldKey;
  return item.fieldIndex === undefined ? label : `${label} #${item.fieldIndex + 1}`;
}

export default function BookAnalysisSectionCard(props: BookAnalysisSectionCardProps) {
  const {
    analysisMode,
    section,
    draft,
    readingMode,
    canOperate,
    isRegenerating,
    isOptimizing,
    isSaving,
    evidenceItems,
    selectedEvidenceKey,
    selectedEvidence,
    selectedEvidenceChapter,
    selectedChapterContent,
    isDualPane,
    currentChapterIndex,
    onSelectEvidence,
    onDraftChange,
    onRegenerate,
    onOptimize,
    onApplyOptimizePreview,
    onCancelOptimizePreview,
    onSave,
  } = props;
  const canRegenerate = canOperate && !draft.frozen && !section.frozen && !isRegenerating;
  const canOptimize = canOperate
    && !draft.frozen
    && !section.frozen
    && !isOptimizing
    && draft.optimizeInstruction.trim().length > 0;
  const hasContent = draft.editedContent.trim().length > 0;
  const unselectedSection = isUnselectedBookAnalysisSection(section) && !hasContent;
  const frozenChangePending = draft.frozen !== section.frozen;
  const contentBlock = hasContent ? (
    <MarkdownViewer content={draft.editedContent} />
  ) : (
    <div className="text-sm text-muted-foreground">
      {unselectedSection
        ? "这个小节未纳入本次生成。需要补充时，可先取消跳过并保存，再重新生成。"
        : "当前小节还没有可展示的内容。"}
    </div>
  );

  return (
    <Card id={`book-analysis-section-${section.sectionKey}`} className="scroll-mt-28">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle>{section.title}</CardTitle>
            <Badge variant="outline">{unselectedSection ? "本次未选择" : formatStatus(section.status)}</Badge>
            {draft.frozen && !unselectedSection ? <Badge variant="secondary">已冻结</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRegenerate}
              onClick={() => onRegenerate(section)}
            >
              重新生成
            </Button>
            <Button size="sm" disabled={!canOperate || isSaving} onClick={() => onSave(section)}>
              保存
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <BookAnalysisStructuredSummary
          section={section}
          analysisMode={analysisMode}
          evidenceItems={evidenceItems}
          currentChapterIndex={currentChapterIndex}
        />

        {evidenceItems.length > 0 ? (
          <div className="space-y-2 rounded-md border bg-muted/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">本节证据</div>
              <Badge variant="outline">{evidenceItems.length} 条</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {evidenceItems.map((item) => {
                const selected = selectedEvidenceKey === item.evidenceKey;
                return (
                  <button
                    key={item.evidenceKey}
                    type="button"
                    className={`rounded-md border px-2 py-1 text-left text-xs leading-5 transition-colors ${
                      selected ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted/30"
                    }`}
                    onClick={() => onSelectEvidence(item.evidenceKey)}
                    title={item.excerpt}
                  >
                    {item.fieldKey ? (
                      <>
                        <span className="font-medium">{formatEvidenceBinding(item)}</span>
                        <span className="ml-1 text-muted-foreground">[{item.sourceLabel}]</span>
                      </>
                    ) : (
                      <span className={selected ? "font-medium" : "font-medium text-muted-foreground"}>
                        {formatEvidenceBinding(item)}
                        <span className="ml-1 opacity-70">[{item.sourceLabel}]</span>
                      </span>
                    )}
                    {item.chapterIndex !== undefined && item.excerptOffsetRange ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded border px-1 text-[11px] text-muted-foreground">
                        <LocateFixed className="h-3 w-3" />
                        原文
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {selectedEvidence ? (
              <div className="rounded-md border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{selectedEvidence.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {selectedEvidence.fieldKey
                        ? `${formatEvidenceBinding(selectedEvidence)} | ${selectedEvidence.sourceLabel}`
                        : selectedEvidence.sourceLabel}
                    </div>
                  </div>
                  {selectedEvidence.chapterIndex !== undefined ? (
                    <Badge variant="outline">第 {selectedEvidence.chapterIndex + 1} 章</Badge>
                  ) : null}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{selectedEvidence.excerpt}</div>
                {!isDualPane && selectedEvidenceChapter && selectedEvidence.excerptOffsetRange ? (
                  <div className="mt-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      原文定位：{selectedEvidenceChapter.title}
                    </div>
                    <HighlightedChapterExcerpt
                      chapterContent={selectedChapterContent}
                      chapterStartOffset={selectedEvidenceChapter.startOffset}
                      range={selectedEvidence.excerptOffsetRange}
                    />
                  </div>
                ) : isDualPane && selectedEvidenceChapter && selectedEvidence.excerptOffsetRange ? (
                  <div className="mt-2 text-xs text-muted-foreground">已在左侧原文章节中定位这条证据。</div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">这条证据暂无可跳转的章节定位。</div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {readingMode === "full" ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">分析正文</div>
            <div className="min-h-[220px] rounded-md border bg-muted/20 p-4">
              {contentBlock}
            </div>
          </div>
        ) : (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">查看完整正文</summary>
            <div className="mt-3 min-h-[180px] rounded-md border bg-muted/20 p-4">
              {contentBlock}
            </div>
          </details>
        )}

        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">{canOperate ? "编辑与优化" : "归档内容与备注"}</summary>
          <div className="mt-3 space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.frozen}
                disabled={!canOperate}
                onChange={(event) => onDraftChange(section, { frozen: event.target.checked })}
              />
              跳过自动重跑，并保留这个小节的现有内容。
            </label>

            {draft.frozen || frozenChangePending ? (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-foreground">
                {frozenChangePending
                  ? draft.frozen
                    ? "跳过设置尚未保存。保存后，自动重跑会保留这个小节的现有内容。"
                    : "取消跳过尚未保存。保存后，即可重新生成或使用 AI 优化。"
                  : unselectedSection
                    ? "这个小节未纳入本次生成。需要补充时，请先取消跳过并保存。"
                    : "当前内容已冻结。需要重新生成或 AI 优化时，请先取消跳过并保存。"}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">本节特别关注</div>
              <textarea
                className="min-h-[90px] w-full rounded-md border bg-background p-3 text-sm"
                value={draft.focusInstruction}
                disabled={!canOperate}
                onChange={(event) => onDraftChange(section, { focusInstruction: event.target.value })}
                placeholder="例如：只看阶段推进里的转折证据，或重点检查人物高光是否能复用。"
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">编辑正文</div>
              <textarea
                className="min-h-[220px] w-full rounded-md border bg-background p-3 text-sm"
                value={draft.editedContent}
                disabled={!canOperate}
                onChange={(event) => onDraftChange(section, { editedContent: event.target.value })}
                placeholder="在此直接编辑当前小节草稿。"
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">AI 优化 / 修正</div>
              <textarea
                className="min-h-[90px] w-full rounded-md border bg-background p-2 text-sm"
                value={draft.optimizeInstruction}
                disabled={!canOperate}
                onChange={(event) => onDraftChange(section, { optimizeInstruction: event.target.value })}
                placeholder="输入优化或修正提示词，例如：压缩冗余、突出冲突、保持同样事实。"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canOptimize}
                  onClick={() => onOptimize(section)}
                >
                  {isOptimizing ? "生成预览中..." : "生成优化预览"}
                </Button>
              </div>
            </div>

            {draft.optimizePreview.trim() ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">优化预览</div>
                <div className="max-h-[320px] overflow-auto rounded-md border bg-muted/20 p-4">
                  <MarkdownViewer content={draft.optimizePreview} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!canOperate} onClick={() => onApplyOptimizePreview(section)}>
                    应用到当前草稿
                  </Button>
                  <Button size="sm" variant="outline" disabled={!canOperate} onClick={() => onCancelOptimizePreview(section)}>
                    取消预览
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">备注</div>
              <textarea
                className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
                value={draft.notes}
                disabled={!canOperate}
                onChange={(event) => onDraftChange(section, { notes: event.target.value })}
                placeholder="添加备注、假设或后续行动。"
              />
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function HighlightedChapterExcerpt(props: {
  chapterContent: string;
  chapterStartOffset: number;
  range: { start: number; end: number };
}) {
  const relativeStart = Math.max(0, props.range.start - props.chapterStartOffset);
  const relativeEnd = Math.min(props.chapterContent.length, Math.max(relativeStart, props.range.end - props.chapterStartOffset));
  const previewStart = Math.max(0, relativeStart - 360);
  const previewEnd = Math.min(props.chapterContent.length, relativeEnd + 360);
  const before = props.chapterContent.slice(previewStart, relativeStart);
  const highlight = props.chapterContent.slice(relativeStart, relativeEnd);
  const after = props.chapterContent.slice(relativeEnd, previewEnd);

  return (
    <div className="max-h-[320px] overflow-auto rounded-md border bg-muted/20 p-3 leading-7 whitespace-pre-wrap">
      {previewStart > 0 ? <span className="text-muted-foreground">...</span> : null}
      <span>{before}</span>
      <mark className="rounded bg-warning/20 px-1 text-foreground">{highlight}</mark>
      <span>{after}</span>
      {previewEnd < props.chapterContent.length ? <span className="text-muted-foreground">...</span> : null}
    </div>
  );
}
