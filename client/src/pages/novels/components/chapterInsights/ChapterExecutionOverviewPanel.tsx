import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
      <section className="rounded-2xl border border-dashed border-border/70 bg-background p-4 text-sm leading-6 text-muted-foreground">{i18next.t("novels.chapterExecutionOverviewPanel.8kyeuf")}</section>
    );
  }

  const chapterLabel = i18next.t("tensionCurve.tensionCurveChapterDetailSidebar.xrxssk", { val1: selectedChapter.order });
  const chapterTitle = selectedChapter.title || i18next.t("dict.gen_db55d102");
  const chapterObjective = chapterPlan?.objective ?? selectedChapter.expectation ?? i18next.t("dict.gen_6fc3748d");
  const runtimePackage = chapterRuntimePackage?.chapterId === selectedChapter.id ? chapterRuntimePackage : null;
  const lengthControl = runtimePackage?.lengthControl ?? null;
  const qualityOverall = chapterQualityReport?.overall ?? selectedChapter.qualityScore ?? null;
  const displayedStatus = resolveDisplayedChapterStatus(selectedChapter);
  const statusLabel = chapterStatusLabel(displayedStatus);
  const generationLabel = generationStateLabel(selectedChapter.generationState);
  const currentWordCount = runtimePackage?.draft.wordCount ?? selectedChapter.content?.trim().length ?? 0;
  const targetWordCount = selectedChapter.targetWordCount ?? null;
  const issueCount = openAuditIssues.length || reviewResult?.issues?.length || 0;
  const updatedAt = selectedChapter.updatedAt ? new Date(selectedChapter.updatedAt).toLocaleString("zh-CN") : i18next.t("common.none");

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
              <Badge variant={getQualityBadgeVariant(qualityOverall)}>{i18next.t("dict.gen_41ed49a3")}</Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{i18next.t("dict.gen_563dff61")}</div>
            <div className="text-base font-semibold text-foreground">{chapterTitle}</div>
            <p className="line-clamp-6 text-sm leading-6 text-muted-foreground">
              {chapterObjective}
            </p>
          </div>
        </div>

        <Button asChild size="sm" variant="outline" className="w-full justify-center">
          <Link to={`/novels/${selectedChapter.novelId}/chapters/${selectedChapter.id}`}>{i18next.t("dict.gen_a90ec8b1")}</Link>
        </Button>
      </div>

      <div className="space-y-2">
        <OverviewStat label={i18next.t("dict.gen_ff9c965e")} value={String(currentWordCount)} hint={i18next.t("dict.panelDisplayLength")} />
        <OverviewStat label={i18next.t("dict.gen_85f9e2b5")} value={targetWordCount ? i18next.t("novels.chapterEditorSidebar.izeb8n", { val1: targetWordCount }) : i18next.t("dict.gen_b25ee1ff")} hint={i18next.t("dict.gen_6a869271")} />
        <OverviewStat label={i18next.t("dict.gen_0dfc9235")} value={String(issueCount)} hint={i18next.t("dict.gen_8527538c")} />
        <OverviewStat label={i18next.t("dict.gen_06dc9b38")} value={updatedAt} hint={i18next.t("dict.gen_bec6b1bc")} />
      </div>

      {lengthControl ? (
        <div className="space-y-2">
          <OverviewStat
            label={i18next.t("dict.gen_58e59c31")}
            value={`${lengthControl.softMinWordCount}-${lengthControl.softMaxWordCount}`}
            hint={i18next.t("novels.chapterExecutionOverviewPanel.9tohbf", { val1: lengthControl.hardMaxWordCount })}
          />
          <OverviewStat
            label={i18next.t("dict.gen_cfebad7b")}
            value={lengthControl.wordControlMode === "prompt_only" ? i18next.t("dict.gen_e25414a2") : lengthControl.wordControlMode === "balanced" ? i18next.t("dict.gen_332305cd") : i18next.t("dict.gen_d15aa8f4")}
            hint={i18next.t("novels.chapterExecutionOverviewPanel.9fipw4", { val1: Math.round(lengthControl.variance * 100) })}
          />
        </div>
      ) : null}
    </section>
  );
}
