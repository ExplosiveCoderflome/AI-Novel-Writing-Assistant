import { Check, Circle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import OnboardingTip from "@/components/onboarding/OnboardingTip";

export type DirectorPreparationStepStatus = "pending" | "running" | "completed" | "failed";

interface DirectorPreparationStep {
  key: string;
  label: string;
}

interface NovelDirectorPreparationJourneyProps {
  steps: ReadonlyArray<DirectorPreparationStep>;
  statuses: ReadonlyArray<DirectorPreparationStepStatus>;
}

function stepTone(status: DirectorPreparationStepStatus): string {
  if (status === "completed") {
    return "border-emerald-500 bg-emerald-500 text-white";
  }
  if (status === "running") {
    return "border-primary bg-primary text-primary-foreground shadow-[0_0_0_5px_hsl(var(--primary)/0.10)]";
  }
  if (status === "failed") {
    return "border-destructive bg-destructive text-destructive-foreground";
  }
  return "border-border bg-background text-muted-foreground";
}

function connectorTone(
  current: DirectorPreparationStepStatus,
  next: DirectorPreparationStepStatus,
): string {
  return current === "completed" && (next === "completed" || next === "running")
    ? "bg-emerald-400/70"
    : "bg-border/70";
}

function statusLabel(status: DirectorPreparationStepStatus): string {
  if (status === "completed") return "Ready to complete";
  if (status === "running") return "AI is processing";
  if (status === "failed") return "Need to be processed";
  return "Waiting for advancement";
}

export default function NovelDirectorPreparationJourney({
  steps,
  statuses,
}: NovelDirectorPreparationJourneyProps) {
  return (
    <div className="space-y-4">
      <OnboardingTip
        storageKey="director-preparation"
        title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        description="AI will transform completed story directions into characters, volume strategies, pacing, and chapter execution resources; the results on the page can be expanded and viewed at any time."
        next="After all the writing resources are ready, choose simple creation or professional creation."
      />
      <section className="rounded-2xl border border-border/70 bg-background px-4 py-5 shadow-[0_18px_45px_-38px_hsl(var(--foreground)/0.45)] sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Preparation before writing</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              The AI is completing the direction, characters, and chapter resources for the entire book in sequence.
                                      </div>
          </div>
          <div className="text-xs text-muted-foreground">The text has not been generated yet</div>
        </div>

        <ol className={cn(
          "mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
          steps.length > 6 ? "xl:grid-cols-7" : "xl:grid-cols-6",
        )}>
          {steps.map((step, index) => {
            const status = statuses[index] ?? "pending";
            const nextStatus = statuses[index + 1] ?? "pending";
            return (
              <li key={step.key} className="relative min-w-0">
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-8 top-4 hidden h-px w-[calc(100%-1.25rem)] xl:block",
                      connectorTone(status, nextStatus),
                    )}
                  />
                ) : null}
                <div className="relative flex items-start gap-3 lg:block">
                  <span
                    className={cn(
                      "relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition",
                      stepTone(status),
                    )}
                  >
                    {status === "completed"
                      ? <Check className="h-4 w-4" />
                      : status === "pending"
                        ? <Circle className="h-3 w-3" />
                        : index + 1}
                  </span>
                  <div className="min-w-0 lg:mt-3">
                    <div className="truncate text-sm font-medium text-foreground">{step.label}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{statusLabel(status)}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/[0.07] via-background to-background">
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">After the preparation is completed, it is up to you to choose the text production method</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                The system will stop before starting to write and will not generate the text in advance.
                                            </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground">
              Simple Creation · AI to write a complete book
                                      </span>
            <span className="rounded-full border border-border bg-background px-3 py-1.5 font-medium text-foreground">
              Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                      </span>
          </div>
        </div>
      </section>
    </div>
  );
}
