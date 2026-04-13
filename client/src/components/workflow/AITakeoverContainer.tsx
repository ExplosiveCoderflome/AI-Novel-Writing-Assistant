import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import WorkflowProgressBar, {
  normalizeProgressPercent,
  type WorkflowProgressTone,
} from "./WorkflowProgressBar";

export type AITakeoverMode = "loading" | "running" | "waiting" | "failed";

export interface AITakeoverAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "destructive";
  disabled?: boolean;
}

export interface AITakeoverContainerProps {
  mode: AITakeoverMode;
  title: string;
  description: string;
  progress?: number | null;
  currentAction?: string | null;
  checkpointLabel?: string | null;
  taskId?: string | null;
  actions?: AITakeoverAction[];
  children?: ReactNode;
}

function modeLabel(mode: AITakeoverMode): string {
  if (mode === "loading") {
    return "加载中";
  }
  if (mode === "running") {
    return "AI 接管中";
  }
  if (mode === "waiting") {
    return "等待确认";
  }
  return "执行异常";
}

function shellClass(mode: AITakeoverMode): string {
  if (mode === "loading") {
    return "border-slate-300/60 bg-slate-50/80";
  }
  if (mode === "failed") {
    return "border-destructive/35 bg-destructive/5";
  }
  if (mode === "waiting") {
    return "border-amber-500/35 bg-amber-50/80";
  }
  return "border-sky-400/45 bg-sky-50/80";
}

function progressShellClass(mode: AITakeoverMode): string {
  if (mode === "loading") {
    return "border-slate-300/60 bg-background/75";
  }
  if (mode === "failed") {
    return "border-destructive/20 bg-destructive/[0.03]";
  }
  if (mode === "waiting") {
    return "border-amber-500/20 bg-amber-500/[0.04]";
  }
  return "border-primary/20 bg-primary/[0.05] shadow-sm";
}

function progressTone(mode: AITakeoverMode): WorkflowProgressTone {
  if (mode === "loading") {
    return "loading";
  }
  if (mode === "failed") {
    return "failed";
  }
  if (mode === "waiting") {
    return "waiting";
  }
  return "running";
}

function progressStatusLabel(mode: AITakeoverMode): string | null {
  if (mode === "running") {
    return "实时推进中";
  }
  if (mode === "waiting") {
    return "等待你确认";
  }
  if (mode === "failed") {
    return "已中断";
  }
  return null;
}

export default function AITakeoverContainer({
  mode,
  title,
  description,
  progress,
  currentAction,
  checkpointLabel,
  taskId,
  actions = [],
  children,
}: AITakeoverContainerProps) {
  const resolvedProgress = typeof progress === "number" ? normalizeProgressPercent(progress) : null;

  return (
    <div className={cn("space-y-4 rounded-2xl border p-4", shellClass(mode))}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-foreground">{title}</div>
            <Badge
              variant={
                mode === "failed"
                  ? "destructive"
                  : mode === "waiting" || mode === "loading"
                    ? "secondary"
                    : "default"
              }
            >
              {modeLabel(mode)}
            </Badge>
            {taskId ? <Badge variant="outline">任务 #{taskId.slice(0, 8)}</Badge> : null}
          </div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={action.variant ?? (mode === "running" ? "outline" : "default")}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {resolvedProgress !== null ? (
        <div className={cn("rounded-xl border p-3", progressShellClass(mode))}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              {mode === "running" ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
              ) : null}
              <span className="font-medium text-foreground">流程进度</span>
              {progressStatusLabel(mode) ? (
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {progressStatusLabel(mode)}
                </span>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums text-muted-foreground">{resolvedProgress}%</span>
          </div>

          <WorkflowProgressBar progress={resolvedProgress} tone={progressTone(mode)} className="mt-3" />

          {currentAction ? (
            <div
              className={cn(
                "mt-3 text-sm",
                mode === "running"
                  ? "rounded-lg border border-primary/10 bg-background/80 px-3 py-2 text-foreground"
                  : "text-foreground",
              )}
            >
              {currentAction}
            </div>
          ) : null}
          {checkpointLabel ? (
            <div className="mt-2 text-xs text-muted-foreground">最近检查点：{checkpointLabel}</div>
          ) : null}
        </div>
      ) : null}

      {children ? <div>{children}</div> : null}
    </div>
  );
}
