import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import WorkflowProgressBar, { normalizeProgressPercent } from "@/components/workflow/WorkflowProgressBar";
import { cn } from "@/lib/utils";
import type { NovelEditTakeoverState } from "../components/NovelEditView.types";
import {
  getMobileAutoDirectorModeLabel,
  getMobileAutoDirectorStickyLabel,
  shouldShowMobileAutoDirectorProgress,
} from "./mobileAutoDirectorUi";

interface MobileAutoDirectorStatusCardProps {
  takeover: NovelEditTakeoverState;
}

function modeToneClass(mode: NovelEditTakeoverState["mode"]): string {
  switch (mode) {
    case "failed":
      return "border-destructive/25 bg-destructive/[0.04]";
    case "waiting":
    case "action_required":
      return "border-amber-400/35 bg-amber-50/80";
    case "loading":
      return "border-slate-300/70 bg-slate-50/90";
    case "running":
    default:
      return "border-sky-200/80 bg-sky-50/70";
  }
}

function badgeVariant(mode: NovelEditTakeoverState["mode"]): "default" | "secondary" | "destructive" {
  if (mode === "failed") {
    return "destructive";
  }
  if (mode === "running") {
    return "default";
  }
  return "secondary";
}

export default function MobileAutoDirectorStatusCard({ takeover }: MobileAutoDirectorStatusCardProps) {
  const progressValue = takeover.progress;
  const hasProgress = shouldShowMobileAutoDirectorProgress(progressValue);
  const progress = hasProgress ? normalizeProgressPercent(progressValue) : null;
  const stickyLabel = getMobileAutoDirectorStickyLabel({
    title: takeover.title,
    description: takeover.description,
    currentAction: takeover.currentAction,
  });

  return (
    <>
      <section className={cn("rounded-2xl border p-3 shadow-sm", modeToneClass(takeover.mode))}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">{takeover.title}</span>
              <Badge variant={badgeVariant(takeover.mode)}>{getMobileAutoDirectorModeLabel(takeover.mode)}</Badge>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{takeover.description}</p>
          </div>
          {progress !== null ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progress}%</span> : null}
        </div>

        {progress !== null ? <WorkflowProgressBar progress={progress} tone={takeover.mode === "failed" ? "failed" : takeover.mode === "running" ? "running" : "waiting"} className="mt-3 h-1.5" /> : null}

        {stickyLabel ? (
          <div className="mt-2 line-clamp-2 rounded-xl border border-background/80 bg-background/70 px-3 py-2 text-xs leading-5 text-foreground">
            {stickyLabel}
          </div>
        ) : null}

        {takeover.checkpointLabel || takeover.taskId ? (
          <div className="mt-2 flex min-w-0 flex-wrap gap-2 text-[11px] text-muted-foreground">
            {takeover.checkpointLabel ? <span className="truncate">检查点：{takeover.checkpointLabel}</span> : null}
            {takeover.taskId ? <span className="shrink-0">任务 #{takeover.taskId.slice(0, 8)}</span> : null}
          </div>
        ) : null}

        {takeover.actions && takeover.actions.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {takeover.actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                size="sm"
                variant={action.variant ?? (takeover.mode === "running" ? "outline" : "default")}
                disabled={action.disabled}
                onClick={action.onClick}
                className="min-w-0"
              >
                <span className="truncate">{action.label}</span>
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="pointer-events-none sticky top-[4.75rem] z-20 -mx-1 mt-2">
        <div className={cn("mx-1 flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-sm backdrop-blur", modeToneClass(takeover.mode))}>
          <span className="relative flex h-2 w-2 shrink-0">
            {takeover.mode === "running" ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" /> : null}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="shrink-0 font-medium">自动导演</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{stickyLabel}</span>
          {progress !== null ? <span className="shrink-0 tabular-nums text-muted-foreground">{progress}%</span> : null}
        </div>
      </div>
    </>
  );
}
