import { Link } from "react-router-dom";
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { Chapter, StoryPlan } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chapterStatusLabel, generationStateLabel, resolveDisplayedChapterStatus } from "../chapterExecution.shared";

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

function OverviewStat(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-xs text-muted-foreground">{props.label}</div>
        <div className="shrink-0 text-right text-sm font-semibold text-foreground">{props.value}</div>
      </div>
      {props.hint ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
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
    return (
      <section className="rounded-2xl border border-dashed border-border/70 bg-background p-4 text-sm leading-6 text-muted-foreground">
        选中章节后，这里显示本章状态、目标、字数、质量和待处理问题。
      </section>
    );
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
    <section className="space-y-3 rounded-2xl border border-border/70 bg-background/95 p-4">
      <div className="flex flex-col gap-3">
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
            <div className="text-xs font-medium text-muted-foreground">章节概览</div>
            <div className="text-base font-semibold text-foreground">{chapterTitle}</div>
            <p className="line-clamp-6 text-sm leading-6 text-muted-foreground">
              {chapterObjective}
            </p>
          </div>
        </div>

        <Button asChild size="sm" variant="outline" className="w-full justify-center">
          <Link to={`/novels/${selectedChapter.novelId}/chapters/${selectedChapter.id}`}>打开章节编辑器</Link>
        </Button>
      </div>

      <div className="space-y-2">
        <OverviewStat label="当前字数" value={String(currentWordCount)} hint="主面板正在显示的正文长度。" />
        <OverviewStat label="章节目标" value={targetWordCount ? `${targetWordCount} 字` : "未设定"} hint="用于判断当前篇幅是否足够。" />
        <OverviewStat label="待处理问题" value={String(issueCount)} hint="问题越少，越适合继续推进。" />
        <OverviewStat label="最近更新" value={updatedAt} hint="用于判断这一章是否需要重新检查。" />
      </div>

      {lengthControl ? (
        <div className="space-y-2">
          <OverviewStat
            label="预算区间"
            value={`${lengthControl.softMinWordCount}-${lengthControl.softMaxWordCount}`}
            hint={`硬上限 ${lengthControl.hardMaxWordCount} 字`}
          />
          <OverviewStat
            label="控字模式"
            value={lengthControl.wordControlMode === "prompt_only" ? "自然优先" : lengthControl.wordControlMode === "balanced" ? "标准控字" : "混合控字"}
            hint={`偏差 ${Math.round(lengthControl.variance * 100)}%`}
          />
        </div>
      ) : null}
    </section>
  );
}
