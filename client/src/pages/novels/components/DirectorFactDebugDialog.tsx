import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bug, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type { DirectorTaskFactInspectionStep } from "@ai-novel/shared/types/directorRuntime";
import { getDirectorNovelFactInspection } from "@/api/novelDirector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function formatPercent(ratio: number): string {
  return `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`;
}

function formatStageLabel(stage: string): string {
  if (stage === "candidate_selection") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_db34cba7");
  if (stage === "candidate_confirm") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_39da6755");
  if (stage === "story_macro") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_15183ae2");
  if (stage === "book_contract") return t("gen.pages.novels.components.DirectorFactDebugDialog.chapterCreationConvention");
  if (stage === "character_setup") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_3ed577c6");
  if (stage === "volume_strategy") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_19ac37e4");
  if (stage === "structured_outline") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_07abcd19");
  if (stage === "chapter_execution") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_513aefd9");
  if (stage === "quality_repair") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_5c8a4a0e");
  if (stage === "takeover") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_c258cefe");
  return stage;
}

function formatNextAction(action?: string | null): string {
  if (!action) return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_085734d3");
  if (action === "run_chapter_detail_generation") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_47e55577");
  if (action === "run_chapter_list_generation") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_58de0846");
  if (action === "sync_execution_contracts") return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_aef4a566");
  const text = action
    .replace(/_/g, " ")
    .replace(/\./g, " ")
    .trim();
  return text || action;
}

function formatResumeFrom(resumeFrom?: string | null): string {
  if (!resumeFrom) return t("gen.pages.novels.components.DirectorFactDebugDialog.gen_5faa720d");
  if (resumeFrom === "chapter_detail_bundle") return t("gen.pages.novels.components.DirectorFactDebugDialog.continueFromRemainingUnrefinedChapters");
  if (resumeFrom === "chapter_list") return t("gen.pages.novels.components.DirectorFactDebugDialog.continueFromChapterListSplittingVolume");
  if (resumeFrom === "beat_sheet") return t("gen.pages.novels.components.DirectorFactDebugDialog.continueFromRhythmBoardVolume");
  if (resumeFrom.startsWith("chapter:")) {
    const rawOrder = resumeFrom.slice("chapter:".length).trim();
    const order = Number(rawOrder);
    if (Number.isFinite(order) && order > 0) {
      return `第 ${order} 章`;
    }
  }
  return resumeFrom.replace(/_/g, " ").trim() || resumeFrom;
}

function summarizeStep(step: DirectorTaskFactInspectionStep): {
  tone: "done" | "current" | "blocked" | "working" | "error";
  title: string;
  detail: string;
} {
  if (step.inspectError) {
    return {
      tone: "error",
      title: t("gen.pages.novels.components.DirectorFactDebugDialog.gen_b97d14c2"),
      detail: step.inspectError,
    };
  }
  if (step.completed) {
    return {
      tone: "done",
      title: t("gen.pages.novels.components.DirectorFactDebugDialog.gen_b84241f1"),
      detail: t("gen.pages.novels.components.DirectorFactDebugDialog.gen_5d2a16ba"),
    };
  }
  if (!step.ready) {
    return {
      tone: "blocked",
      title: t("gen.pages.novels.components.DirectorFactDebugDialog.gen_7edf2c7f"),
      detail: step.blockers[0]?.reason || t("gen.pages.novels.components.DirectorFactDebugDialog.upstreamIncomplete"),
    };
  }
  if (step.isCurrentFactStep) {
    return {
      tone: "current",
      title: t("gen.pages.novels.components.DirectorFactDebugDialog.gen_c9810fff"),
      detail: step.progress?.label || t("gen.pages.novels.components.DirectorFactDebugDialog.gen_77a7e85b"),
    };
  }
  return {
    tone: "working",
    title: t("gen.pages.novels.components.DirectorFactDebugDialog.gen_ffdc5d4f"),
    detail: step.progress?.label || t("gen.pages.novels.components.DirectorFactDebugDialog.gen_2d97c3ca"),
  };
}

function toneBadgeVariant(tone: ReturnType<typeof summarizeStep>["tone"]): "default" | "secondary" | "outline" | "destructive" {
  if (tone === "done") return "secondary";
  if (tone === "current") return "default";
  if (tone === "blocked" || tone === "error") return "destructive";
  return "outline";
}

function StepFactCard({ step }: { step: DirectorTaskFactInspectionStep }) {
  const summary = summarizeStep(step);

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3 p-4 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-foreground">{step.label}</div>
            <div className="text-xs text-muted-foreground">{formatStageLabel(step.stage)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step.isCurrentFactStep ? <Badge>{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_df0185d4")}</Badge> : null}
            {step.isActiveRuntimeStep ? <Badge variant="outline">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_b56fba98")}</Badge> : null}
            <Badge variant={toneBadgeVariant(summary.tone)}>{summary.title}</Badge>
          </div>
        </div>
        <div className="text-sm leading-6 text-muted-foreground">{summary.detail}</div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_307c7085")}</span>
            <span>{formatPercent(step.completenessRatio)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: formatPercent(step.completenessRatio) }}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_c817f93d")}</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {step.ready ? t("gen.pages.novels.components.DirectorFactDebugDialog.gen_02bb8d1e") : t("gen.pages.novels.components.DirectorFactDebugDialog.gen_bdb5226b")}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_e6a0c6f1")}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{formatNextAction(step.nextAction)}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_7cf2439f")}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{formatResumeFrom(step.resumeFrom)}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_59999bb7")}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_stepprogre_scdv")}</div>
          </div>
        </div>

        {step.blockers.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="text-sm font-medium text-destructive">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_4ea05beb")}</div>
            <ul className="space-y-2 text-sm leading-6 text-destructive/90">
              {step.blockers.map((blocker) => (
                <li key={`${step.stepId}:${blocker.code}`}>{blocker.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {step.evidence ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_398b9519")}</div>
            <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              {JSON.stringify(step.evidence, null, 2)}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function DirectorFactDebugDialog(input: {
  novelId: string;
  taskId?: string | null;
  disabled?: boolean;
}) {
  const { novelId, disabled = false } = input;
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["director-novel-fact-inspection", novelId],
    queryFn: () => getDirectorNovelFactInspection(novelId),
    enabled: open && Boolean(novelId),
    staleTime: 0,
  });

  const inspection = query.data?.data?.inspection ?? null;
  const summary = useMemo(() => {
    const steps = inspection?.steps ?? [];
    return {
      completedCount: steps.filter((step) => step.completed).length,
      blockedCount: steps.filter((step) => !step.completed && !step.ready).length,
      currentStep: steps.find((step) => step.isCurrentFactStep) ?? null,
    };
  }, [inspection]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled || !novelId}>
          <Bug className="h-4 w-4" />
          调试检查
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>{t("gen.pages.novels.components.DirectorFactDebugDialog.gen_e04600ca")}</DialogTitle>
          <DialogDescription>
            这里展示的是每一步基于真实产出的检查结果。你可以直接看到哪一步已经有结果、哪一步缺前置条件、系统现在准备先补哪里。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[calc(90vh-88px)] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                已确认完成 {summary.completedCount}/{inspection?.steps.length ?? 0}
              </Badge>
              <Badge variant={summary.blockedCount > 0 ? "destructive" : "outline"}>
                还需补前置条件 {summary.blockedCount}
              </Badge>
              {summary.currentStep ? (
                <Badge>
                  当前先看 {summary.currentStep.label}
                </Badge>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
              disabled={query.isFetching || !novelId}
            >
              {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              重新检查
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {query.isLoading || query.isFetching ? (
              <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在读取当前导演链的完整度检查结果...
              </div>
            ) : query.isError ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                  无法完成这次检查。{query.error instanceof Error ? query.error.message : t("gen.pages.novels.components.DirectorFactDebugDialog.gen_d6108225")}
                </div>
              </div>
            ) : !inspection ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <div className="max-w-md rounded-lg border border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                  当前还没有可检查的导演任务。先启动或接手一次 AI 导演流程，这里才会出现逐步骤检查结果。
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {inspection.currentFactEvidence ? (
                  <Card className="rounded-lg border-primary/20 bg-primary/5">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CheckCircle2 className="h-4 w-4" />
                        当前系统会先补这一段
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                      <div className="text-sm text-foreground">{t("gen.pages.novels.components.DirectorFactDebugDialog.inspectionStatus")}</div>
                      <pre className="overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-5 text-muted-foreground">
                        {JSON.stringify(inspection.currentFactEvidence, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="grid gap-4">
                  {inspection.steps.map((step) => (
                    <StepFactCard key={step.stepId} step={step} />
                  ))}
                </div>

                {inspection.steps.some((step) => step.inspectError) ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    有些步骤的检查没有拿到完整结果。通常是因为当前任务现场不完整，或者这一段还需要补更多事实来源。
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
