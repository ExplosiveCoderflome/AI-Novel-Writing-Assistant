import type { CreativeHubTurnSummary } from "@ai-novel/shared/types/creativeHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CreativeHubTurnSummaryCardProps {
  summary: CreativeHubTurnSummary;
  onQuickAction?: (prompt: string) => void;
}

function toStatusLabel(status: CreativeHubTurnSummary["status"]): string {
  switch (status) {
    case "succeeded":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "interrupted":
      return "To be confirmed";
    case "failed":
      return "fail";
    case "cancelled":
      return "Canceled";
    case "running":
      return "in progress";
    default:
      return status;
  }
}

function toVariant(status: CreativeHubTurnSummary["status"]): "secondary" | "destructive" | "outline" {
  if (status === "failed" || status === "cancelled") {
    return "destructive";
  }
  if (status === "interrupted") {
    return "secondary";
  }
  return "outline";
}

export default function CreativeHubTurnSummaryCard({
  summary,
  onQuickAction,
}: CreativeHubTurnSummaryCardProps) {
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">Creation Promotion Summary</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Current stage:{summary.currentStage}
          </div>
        </div>
        <Badge variant={toVariant(summary.status)}>{toStatusLabel(summary.status)}</Badge>
      </div>

      <div className="mt-4 divide-y divide-border rounded-md border border-border bg-background px-3">
        <div className="py-3">
          <div className="text-xs font-medium text-muted-foreground">Judgment of this round</div>
          <div className="mt-2 text-sm leading-6 text-foreground">{summary.intentSummary}</div>
        </div>
        <div className="py-3">
          <div className="text-xs font-medium text-muted-foreground">This round of advancement</div>
          <div className="mt-2 text-sm leading-6 text-foreground">{summary.actionSummary}</div>
        </div>
        <div className="py-3">
          <div className="text-xs font-medium text-muted-foreground">Change confirmed</div>
          <div className="mt-2 text-sm leading-6 text-foreground">{summary.impactSummary}</div>
        </div>
        <div className="py-3">
          <div className="text-xs font-medium text-muted-foreground">Suggest next round</div>
          <div className="mt-2 text-sm leading-6 text-foreground">{summary.nextSuggestion}</div>
          {onQuickAction && summary.nextSuggestion.trim() ? (
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onQuickAction(summary.nextSuggestion)}
              >
                continue in this direction
                                            </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
