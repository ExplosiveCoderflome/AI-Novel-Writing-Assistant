import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  overlay?: boolean;
  overlayMessage?: string | null;
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
    return "等待审核";
  }
  return "执行异常";
}

function progressBarClass(mode: AITakeoverMode): string {
  if (mode === "loading") {
    return "bg-slate-500";
  }
  if (mode === "failed") {
    return "bg-destructive";
  }
  if (mode === "waiting") {
    return "bg-amber-500";
  }
  return "bg-primary";
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

export default function AITakeoverContainer({
  mode,
  title,
  description,
  progress,
  currentAction,
  checkpointLabel,
  taskId,
  overlay = false,
  overlayMessage,
  actions = [],
  children,
}: AITakeoverContainerProps) {
  const resolvedProgress = typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress * 100))) : null;

  return (
    <div className={`space-y-4 rounded-2xl border p-4 ${shellClass(mode)}`}>
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
        <div className="rounded-xl border border-border/60 bg-background/75 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">流程进度</span>
            <span className="text-muted-foreground">{resolvedProgress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${progressBarClass(mode)}`}
              style={{ width: `${resolvedProgress}%` }}
            />
          </div>
          {currentAction ? (
            <div className="mt-3 text-sm text-foreground">{currentAction}</div>
          ) : null}
          {checkpointLabel ? (
            <div className="mt-1 text-xs text-muted-foreground">最近检查点：{checkpointLabel}</div>
          ) : null}
        </div>
      ) : null}

      {children ? (
        <div className="relative">
          {children}
          {overlay ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/72 backdrop-blur-[1px]">
              <div className="max-w-md rounded-2xl border bg-background/95 px-5 py-4 text-center shadow-sm">
                <div className="text-sm font-medium text-foreground">
                  {overlayMessage?.trim() || (
                    mode === "loading"
                      ? "正在同步当前自动流程状态，请稍候。"
                      : mode === "running"
                        ? "AI 正在接管当前区域，暂时不建议手动修改。"
                        : "当前区域暂时由流程状态控制。"
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
