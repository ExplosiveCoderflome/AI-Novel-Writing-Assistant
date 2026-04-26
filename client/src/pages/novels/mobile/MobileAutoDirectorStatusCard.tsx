import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import WorkflowProgressBar, {
  normalizeProgressPercent,
  type WorkflowProgressTone,
} from "@/components/workflow/WorkflowProgressBar";
import { cn } from "@/lib/utils";
import type { NovelEditTakeoverState } from "../components/NovelEditView.types";

interface MobileAutoDirectorStatusCardProps {
  takeover: NovelEditTakeoverState;
}

function modeLabel(mode: NovelEditTakeoverState["mode"]): string {
  switch (mode) {
    case "loading":
      return "加载中";
    case "running":
      return "接管中";
    case "waiting":
      return "等待确认";
    case "action_required":
      return "待处理";
    case "failed":
    default:
      return "异常";
  }
}

function progressTone(mode: NovelEditTakeoverState["mode"]): WorkflowProgressTone {
  if (mode === "failed") {
    return "failed";
  }
  if (mode === "waiting" || mode === "action_required") {
    return "waiting";
  }
  if (mode === "loading") {
    return "loading";
  }
  return "running";
}

function cardClass(mode: NovelEditTakeoverState["mode"]): string {
  if (mode === "failed") {
    return "border-destructive/35 bg-destructive/5";
  }
  if (mode === "waiting" || mode === "action_required") {
    return "border-amber-500/35 bg-amber-50/80";
  }
  return "border-primary/25 bg-primary/[0.04]";
}

export default function MobileAutoDirectorStatusCard({ takeover }: MobileAutoDirectorStatusCardProps) {
  const resolvedProgress = typeof takeover.progress === "number"
    ? normalizeProgressPercent(takeover.progress)
    : null;

  return (
    <section className={cn("mobile-auto-director-status-card rounded-xl border p-3", cardClass(takeover.mode))}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{takeover.title}</h2>
            <Badge variant={takeover.mode === "failed" ? "destructive" : "secondary"} className="shrink-0">
              {modeLabel(takeover.mode)}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{takeover.description}</p>
        </div>
        {resolvedProgress !== null ? (
          <div className="shrink-0 rounded-full bg-background/80 px-2 py-1 text-xs tabular-nums text-muted-foreground">
            {resolvedProgress}%
          </div>
        ) : null}
      </div>

      {resolvedProgress !== null ? (
        <WorkflowProgressBar progress={resolvedProgress} tone={progressTone(takeover.mode)} className="mt-3" />
      ) : null}

      {takeover.currentAction || takeover.checkpointLabel ? (
        <div className="mt-2 min-w-0 space-y-1 text-xs">
          {takeover.currentAction ? (
            <div className="truncate text-foreground">{takeover.currentAction}</div>
          ) : null}
          {takeover.checkpointLabel ? (
            <div className="truncate text-muted-foreground">检查点：{takeover.checkpointLabel}</div>
          ) : null}
        </div>
      ) : null}

      {takeover.actions && takeover.actions.length > 0 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {takeover.actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant={action.variant ?? (takeover.mode === "running" ? "outline" : "default")}
              disabled={action.disabled}
              className="shrink-0"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
