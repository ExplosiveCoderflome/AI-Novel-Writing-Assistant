import type { CreativeHubNovelSetupStatus } from "@ai-novel/shared/types/creativeHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CreativeHubNovelSetupCardProps {
  setup: CreativeHubNovelSetupStatus;
  actionDisabled?: boolean;
  onQuickAction?: (prompt: string) => void;
}

function stageLabel(stage: CreativeHubNovelSetupStatus["stage"]): string {
  switch (stage) {
    case "ready_for_production":
      return "Can enter production";
    case "ready_for_planning":
      return "Can enter planning";
    default:
      return "Initializing";
  }
}

function itemTone(status: "missing" | "partial" | "ready"): string {
  switch (status) {
    case "ready":
      return "border-success/30 bg-success/5 text-success";
    case "partial":
      return "border-warning/30 bg-warning/5 text-warning";
    default:
      return "border-border bg-muted/20 text-muted-foreground";
  }
}

export default function CreativeHubNovelSetupCard({
  setup,
  actionDisabled = false,
  onQuickAction,
}: CreativeHubNovelSetupCardProps) {
  const pendingItems = setup.checklist.filter((item) => item.status !== "ready");

  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">Book opening information</div>
        <Badge variant="outline">{stageLabel(setup.stage)}</Badge>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">{setup.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ready {setup.completedCount}/{setup.totalCount} item
                                      </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-foreground">{setup.completionRatio}%</div>
            <div className="text-[11px] text-muted-foreground">Completion</div>
          </div>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Completeness of book opening information"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={setup.completionRatio}
          aria-valuetext={`开书信息完成 ${setup.completionRatio}%`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${setup.completionRatio}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {setup.checklist.map((item) => (
          <div
            key={item.key}
            className={cn("rounded-md border px-3 py-2", itemTone(item.status))}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="flex items-center gap-2 text-[11px]">
                {item.requiredForProduction ? (
                  <span className="rounded-md border border-current/20 bg-background/70 px-2 py-0.5">
                    Confirm before production
                                                  </span>
                ) : null}
                <span>
                  {item.status === "ready" ? "Ready" : item.status === "partial" ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Missing"}
                </span>
              </div>
            </div>
            {item.currentValue ? (
              <div className="mt-1 text-[11px] text-muted-foreground">current:{item.currentValue}</div>
            ) : null}
            <div className="mt-1 text-xs leading-5">{item.summary}</div>
            {item.status !== "ready" && (item.recommendedAction || item.optionPrompt) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.recommendedAction ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionDisabled}
                    onClick={() => onQuickAction?.(item.recommendedAction!)}
                  >
                    Make up for this
                                                  </Button>
                ) : null}
                {item.optionPrompt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionDisabled}
                    onClick={() => onQuickAction?.(item.optionPrompt!)}
                  >
                    Give me alternatives
                                                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pendingItems.length > 0 ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="text-xs font-medium text-warning">To be confirmed before production</div>
          <div className="mt-2 text-sm leading-6 text-foreground">
            {pendingItems.slice(0, 4).map((item) => item.label).join("、")}
            {pendingItems.length > 4 ? " etc": ""}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={actionDisabled}
              onClick={() => onQuickAction?.("Summarize the conditions that still need to be confirmed before the current novel enters full production, and give the order of completion according to priority.")}
            >
              Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                      </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionDisabled}
              onClick={() => onQuickAction?.("Based on the current novel information, 3 alternative answers are given for each of the key conditions that are missing before production, so that I can choose one by one.")}
            >
              Give me options in batches
                                      </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-info/30 bg-info/5 p-3">
        <div className="text-xs font-medium text-info">Next information</div>
        <div className="mt-2 text-sm leading-6 text-foreground">{setup.nextQuestion}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={actionDisabled}
          onClick={() => onQuickAction?.(setup.recommendedAction)}
        >
          Follow the guidance to continue
                          </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={actionDisabled}
          onClick={() => onQuickAction?.("Summarize the initial completion of this book and tell me what key information is missing.")}
        >
          View initialization summary
                          </Button>
      </div>
    </div>
  );
}
