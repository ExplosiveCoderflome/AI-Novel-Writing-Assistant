import { Link } from "react-router-dom";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { Chapter, StoryPlan } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricBadge, chapterStatusLabel, generationStateLabel, resolveDisplayedChapterStatus } from "../chapterExecution.shared";

interface ChapterExecutionOverviewPanelProps {
  selectedChapter?: Chapter;
  chapterPlan?: StoryPlan | null;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  } | null;
  chapterRuntimePackage?: ChapterRuntimePackage | null;
  reviewResult?: {
    issues?: Array<{ category: string; fixSuggestion: string }>;
  } | null;
  openAuditIssues?: Array<{ id: string; auditType: string; fixSuggestion: string }>;
}

function getQualityBadgeVariant(quality: number): "default" | "outline" | "secondary" {
  if (quality >= 85) {
    return "default";
  }
  if (quality >= 70) {
    return "outline";
  }
  return "secondary";
}

export default function ChapterExecutionOverviewPanel(props: ChapterExecutionOverviewPanelProps) {
  const {
    selectedChapter,
    chapterPlan,
    chapterQualityReport,
    chapterRuntimePackage,
    reviewResult,
    openAuditIssues = [],
  } = props;

  if (!selectedChapter) {
    return null;
  }

  const chapterLabel = `第${selectedChapter.order}章`;
  const chapterTitle = selectedChapter.title || "未命名章节";
  const chapterObjective = chapterPlan?.objective ?? selectedChapter.expectation ?? "这一章还没有明确目标，建议先补章节计划。";
  const runtimePackage = chapterRuntimePackage?.chapterId === selectedChapter.id ? chapterRuntimePackage : null;
  const lengthControl = runtimePackage?.lengthControl ?? null;
  const qualityOverall = chapterQualityReport?.overall ?? selectedChapter.qualityScore ?? null;
  const displayedStatus = resolveDisplayedChapterStatus(selectedChapter);
  const statusLabel = chapterStatusLabel(displayedStatus);
  const generationLabel = generationStateLabel(selectedChapter.generationState);
  const currentWordCount = runtimePackage?.draft.wordCount ?? selectedChapter.content?.trim().length ?? 0;
  const targetWordCount = selectedChapter.targetWordCount ?? null;
  const issueCount = openAuditIssues.length || reviewResult?.issues?.length || 0;
  const updatedAt = selectedChapter.updatedAt ? new Date(selectedChapter.updatedAt).toLocaleString("zh-CN") : "暂无";

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-background/95 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{chapterLabel}</Badge>
            <Badge variant={displayedStatus === "needs_repair" ? "destructive" : displayedStatus === "pending_review" ? "secondary" : "default"}>
              {statusLabel}
            </Badge>
            {generationLabel ? <Badge variant="outline">{generationLabel}</Badge> : null}
            {typeof qualityOverall === "number" ? (
              <Badge variant={getQualityBadgeVariant(qualityOverall)}>质量 {qualityOverall}</Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-base font-semibold text-foreground">章节概览</div>
            <div className="text-lg font-semibold text-foreground">{chapterTitle}</div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {chapterObjective}
            </p>
          </div>
        </div>

        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={`/novels/${selectedChapter.novelId}/chapters/${selectedChapter.id}`}>打开章节编辑器</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricBadge label="当前字数" value={String(currentWordCount)} hint="当前主面板正在显示的正文长度" />
        <MetricBadge label="章节目标" value={targetWordCount ? `${targetWordCount} 字` : "未设定"} hint="用于判断当前篇幅是否足够" />
        <MetricBadge label="待处理问题" value={String(issueCount)} hint="未修复的问题越少，越适合继续推进" />
        <MetricBadge label="最近更新" value={updatedAt} hint="帮助判断这一章是否需要重新检查" />
      </div>

      {lengthControl ? (
        <div className="grid gap-3 md:grid-cols-2">
          <MetricBadge
            label="预算区间"
            value={`${lengthControl.softMinWordCount}-${lengthControl.softMaxWordCount}`}
            hint={`硬上限 ${lengthControl.hardMaxWordCount} 字`}
          />
          <MetricBadge
            label="控字模式"
            value={lengthControl.wordControlMode === "prompt_only" ? "自然优先" : lengthControl.wordControlMode === "balanced" ? "标准控字" : "混合控字"}
            hint={`偏差 ${Math.round(lengthControl.variance * 100)}%`}
          />
        </div>
      ) : null}
    </section>
  );
}
