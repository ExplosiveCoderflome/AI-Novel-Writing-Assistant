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
  return `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`; } function formatStageLabel(stage: string): string { if (stage === "candidate_selection") return "Book selection direction"; if (stage === "candidate_confirm") return "Project creation"; if (stage === "story_macro") return "Story macro planning"; if (stage === "book_contract") return "Book-level creation conventions"; if (stage === "character_setup") return "Character preparation"; if (stage === "volume_strategy") return "Volume planning"; if (stage === "structured_outline") return "Rhythm and chapter splitting"; if (stage === "chapter_execution") return "Text generation"; if (stage === "quality_repair") return "Quality closed loop"; if (stage === "takeover") return "Taking over an existing project"; return stage; } function formatNextAction(action?: string | null): string { if (!action) return "No additional action suggestions at present"; if (action === "run_chapter_detail_generation") return "Continue to refine the remaining chapter task list"; if (action === "run_chapter_list_generation") return "Continue to complete the volume chapter list"; if (action === "sync_execution_contracts") return "Synchronize the chapter execution contract"; const text = action .replace(/_/g, " ") .replace(/\./g, " ") .trim(); return text || action; } function formatResumeFrom(resumeFrom?: string | null): string { if (!resumeFrom) return "Re-evaluate based on the current situation"; if (resumeFrom === "chapter_detail_bundle") return "Continue from the remaining unrefined chapters"; if (resumeFrom === "chapter_list") return "Continue from the volume chapter list"; if (resumeFrom === "beat_sheet") return "Continue from the volume rhythm sheet"; if (resumeFrom.startsWith("chapter:")) { const rawOrder = resumeFrom.slice("chapter:".length).trim(); const order = Number(rawOrder); if (Number.isFinite(order) && order > 0) { return `第 ${order} 章`;
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
      title: "Check not completed",
      detail: step.inspectError,
    };
  }
  if (step.completed) {
    return {
      tone: "done",
      title: "Confirmed completed",
      detail: "The system has found the real output corresponding to this step and can be reused directly.",
    };
  }
  if (!step.ready) {
    return {
      tone: "blocked",
      title: "Can't be executed yet",
      detail: step.blockers[0]?.reason || "The upstream facts have not been completed yet, so this step cannot be started yet.",
    };
  }
  if (step.isCurrentFactStep) {
    return {
      tone: "current",
      title: "Currently, priority is given to completing this section",
      detail: step.progress?.label || "This is the next main processing step determined by the system based on existing facts.",
    };
  }
  return {
    tone: "working",
    title: "Not closed yet",
    detail: step.progress?.label || "This step already has the conditions for execution, but the fact is that the loop is not completely closed yet.",
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
            {step.isCurrentFactStep ? <Badge>The current judgment will be processed here first</Badge> : null}
            {step.isActiveRuntimeStep ? <Badge variant="outline">This step is happening in the background right now</Badge> : null}
            <Badge variant={toneBadgeVariant(summary.tone)}>{summary.title}</Badge>
          </div>
        </div>
        <div className="text-sm leading-6 text-muted-foreground">{summary.detail}</div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>The completeness of this paragraph</span>
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
            <div className="text-xs text-muted-foreground">Can you continue doing it now?</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {step.ready ? "Can start or continue" : "We also need to supplement the prerequisite facts first"}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">The next step in system judgment</div>
            <div className="mt-1 text-sm font-medium text-foreground">{formatNextAction(step.nextAction)}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">If interrupted, suggestions on where to continue</div>
            <div className="mt-1 text-sm font-medium text-foreground">{formatResumeFrom(step.resumeFrom)}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">The most recent factual description of this step</div>
            <div className="mt-1 text-sm font-medium text-foreground">{step.progress?.label || "No additional description yet"}</div>
          </div>
        </div>

        {step.blockers.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="text-sm font-medium text-destructive">The reason why I'm stuck now</div>
            <ul className="space-y-2 text-sm leading-6 text-destructive/90">
              {step.blockers.map((blocker) => (
                <li key={`${step.stepId}:${blocker.code}`}>{blocker.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {step.evidence ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Judgment basis</div>
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
          debug check
                          </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>Director step completeness check</DialogTitle>
          <DialogDescription>
            Shown here are the inspection results of each step based on real output. You can directly see which step has results, which step lacks preconditions, and where the system is going to make up for it first.
                                </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[calc(90vh-88px)] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                Confirmed completed {summary.completedCount}/{inspection?.steps.length ?? 0}
              </Badge>
              <Badge variant={summary.blockedCount > 0 ? "destructive" : "outline"}>
                Prerequisites need to be supplemented {summary.blockedCount}
              </Badge>
              {summary.currentStep ? (
                <Badge>
                  Watch first now {summary.currentStep.label}
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
              recheck
                                      </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {query.isLoading || query.isFetching ? (
              <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reading the integrity check results of the current director chain...
                                            </div>
            ) : query.isError ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                  This check cannot be completed.{query.error instanceof Error ? query.error.message : "Please try again later."}
                </div>
              </div>
            ) : !inspection ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <div className="max-w-md rounded-lg border border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                  There are currently no director tasks to check. Start or take over the AI ​​director process first, and then the step-by-step inspection results will appear here.
                                                          </div>
              </div>
            ) : (
              <div className="space-y-4">
                {inspection.currentFactEvidence ? (
                  <Card className="rounded-lg border-primary/20 bg-primary/5">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CheckCircle2 className="h-4 w-4" />
                        The current system will fill in this section first.
                                                                                </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                      <div className="text-sm text-foreground">{inspection.currentFactStepLabel || "The system is re-evaluating the next step"}</div>
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
                    Some steps of inspection did not yield complete results. Usually this is because the current mission scene is incomplete, or more factual sources are needed for this paragraph.
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
