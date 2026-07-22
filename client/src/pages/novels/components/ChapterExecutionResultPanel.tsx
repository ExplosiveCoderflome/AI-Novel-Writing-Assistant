import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  Chapter,
  StoryPlan,
} from "@ai-novel/shared/types/novel";
import type { SSEFrame } from "@ai-novel/shared/types/api";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import MarkdownViewer from "@/components/common/MarkdownViewer";
import {
  hasText,
  resolveDisplayedChapterStatus,
  type AssetTabKey,
} from "./chapterExecution.shared";

interface ChapterExecutionResultPanelProps {
  selectedChapter: Chapter | undefined;
  onOpenReferencePanel: (tab: Exclude<AssetTabKey, "content">) => void;
  chapterPlan?: StoryPlan | null;
  streamContent: string;
  isStreaming: boolean;
  streamingChapterId?: string | null;
  streamingChapterLabel?: string | null;
  chapterRunStatus?: Extract<SSEFrame, { type: "run_status" }> | null;
  onAbortStream: () => void;
  onRunFullAudit: () => void;
  isRunningFullAudit: boolean;
  onAutoRepair: () => void;
  isRepairStreaming: boolean;
  repairStreamingChapterId?: string | null;
}

function WorkspaceNotice(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900">
      <div className="font-medium">{props.title}</div>
      <div className="mt-1 leading-6 text-amber-800">{props.description}</div>
    </div>
  );
}

export default function ChapterExecutionResultPanel(props: ChapterExecutionResultPanelProps) {
  const {
    selectedChapter,
    onOpenReferencePanel,
    chapterPlan,
    streamContent,
    isStreaming,
    streamingChapterId,
    streamingChapterLabel,
    chapterRunStatus,
    onAbortStream,
    onRunFullAudit,
    isRunningFullAudit,
    onAutoRepair,
    isRepairStreaming,
    repairStreamingChapterId,
  } = props;

  if (!selectedChapter) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-sm leading-7 text-muted-foreground">
        先从左侧选中一个章节，这里会变成当前章节的主写作区，集中展示正文、任务单、质量反馈和修复记录。
      </div>
    );
  }

  const chapterLabel = `第${selectedChapter.order}章`;
  const chapterTitle = selectedChapter.title || t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_db55d102");
  const chapterObjective = chapterPlan?.objective ?? selectedChapter.expectation ?? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_6fc3748d");
  const savedChapterContent = selectedChapter.content?.trim() ?? "";
  const hasSavedChapterContent = hasText(savedChapterContent);

  const isSelectedChapterStreaming = isStreaming && streamingChapterId === selectedChapter.id;
  const isSelectedChapterFinalizing = isSelectedChapterStreaming && chapterRunStatus?.phase === "finalizing";
  const visibleLiveWritingOutput = streamingChapterId === selectedChapter.id ? streamContent : "";
  const hasVisibleLiveWritingOutput = hasText(visibleLiveWritingOutput);
  const useLiveWritingPanel = isSelectedChapterStreaming || (!hasSavedChapterContent && hasVisibleLiveWritingOutput);
  const contentPanelTitle = isSelectedChapterFinalizing
    ? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_02490291")
    : useLiveWritingPanel
      ? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_27a6eeeb")
      : t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_f0a9f772");
  const contentPanelContent = useLiveWritingPanel
    ? visibleLiveWritingOutput
    : hasSavedChapterContent
      ? savedChapterContent
      : hasVisibleLiveWritingOutput
        ? visibleLiveWritingOutput
        : "";
  const contentPanelWordCount = contentPanelContent.trim().length;

  const isSelectedChapterRepairStreaming = isRepairStreaming && repairStreamingChapterId === selectedChapter.id;

  const writingInOtherChapter = isStreaming && streamingChapterId && streamingChapterId !== selectedChapter.id;

  const contentViewportRef = useRef<HTMLDivElement | null>(null);
  const displayedStatus = resolveDisplayedChapterStatus(selectedChapter);
  const needsAuditPrompt = displayedStatus === "pending_review"
    && selectedChapter.generationState !== "reviewed"
    && selectedChapter.generationState !== "approved";
  const needsConfirmationPrompt = displayedStatus === "pending_review"
    && (selectedChapter.generationState === "reviewed" || selectedChapter.generationState === "approved");
  const needsRepairPrompt = displayedStatus === "needs_repair";

  useEffect(() => {
    if (!isSelectedChapterStreaming && !isSelectedChapterFinalizing) {
      return;
    }
    const viewport = contentViewportRef.current;
    if (!viewport) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contentPanelContent, isSelectedChapterFinalizing, isSelectedChapterStreaming, selectedChapter.id]);

  const openQualityPanel = () => {
    onOpenReferencePanel("quality");
  };

  const openRepairPanel = () => {
    onOpenReferencePanel("repair");
  };

  const runAutoRepairFromWorkspace = () => {
    openRepairPanel();
    onAutoRepair();
  };

  return (
    <div className="h-full">
      <Card className="h-full overflow-hidden border-border/70">
        <CardContent className="flex h-full min-h-0 flex-col gap-5 pt-5">
          {writingInOtherChapter ? (
            <WorkspaceNotice
              title={t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_f7c795f9")}
              description={`${streamingChapterLabel ?? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_08e4466c")} 仍在生成中。切到这一章后不会再把那一章的流式正文带过来，返回对应章节即可继续查看实时输出。`}
            />
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-sm">
            <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={isSelectedChapterStreaming ? "default" : "secondary"}>
                    {isSelectedChapterFinalizing
                      ? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_d1df529f")
                      : isSelectedChapterStreaming
                        ? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_8e29dec6")
                        : t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_e5b868d7")}
                  </Badge>
                  <Badge variant="outline">{chapterLabel}</Badge>
                  <Badge variant="outline">{t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_55d56359", { contentPanelWordCount })}</Badge>
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground">{chapterTitle}</div>
                  <div className="mt-1 text-xs leading-6 text-muted-foreground">
                    {contentPanelTitle}。{isSelectedChapterFinalizing
                      ? (chapterRunStatus?.message ?? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_75007248"))
                      : isSelectedChapterStreaming
                        ? t("gen.pages.novels.components.ChapterExecutionResultPanel.aiOutputtingChapterContentObservingRhythm")
                        : chapterObjective}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_188a315d", { contentPanelWordCount })}</span>
                {needsAuditPrompt ? (
                  <Button size="sm" onClick={onRunFullAudit} disabled={isRunningFullAudit}>
                    {isRunningFullAudit ? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_a9e55039") : t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_604bd4b3")}
                  </Button>
                ) : null}
                {needsConfirmationPrompt ? (
                  <Button size="sm" variant="outline" onClick={openQualityPanel}>
                    查看建议
                  </Button>
                ) : null}
                {(needsConfirmationPrompt || needsRepairPrompt) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={runAutoRepairFromWorkspace}
                    disabled={isSelectedChapterRepairStreaming}
                  >
                    {isSelectedChapterRepairStreaming ? t("gen.pages.novels.components.ChapterExecutionResultPanel.gen_70ae8ad6") : t("gen.pages.novels.components.ChapterExecutionResultPanel.fixButton")}
                  </Button>
                ) : null}
                {isSelectedChapterStreaming && !isSelectedChapterFinalizing ? (
                  <Button size="sm" variant="secondary" onClick={onAbortStream}>
                    停止生成
                  </Button>
                ) : null}
              </div>
            </div>

            <div ref={contentViewportRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
              {contentPanelContent ? (
                <article className="mx-auto max-w-4xl text-[15px] leading-8 text-foreground">
                  <MarkdownViewer content={contentPanelContent} />
                </article>
              ) : (
                <div className="mx-auto max-w-3xl rounded-3xl border border-dashed bg-muted/15 p-8 text-sm leading-7 text-muted-foreground">
                  当前章节还没有正文。建议先补章节计划或任务单，然后从右侧直接执行“写本章”。
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
