import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, CircleAlert, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import type { DashboardView, DirectorAction, DirectorCommand } from "@/api/directorNext";
import { submitDirectorCommand } from "@/api/directorNext";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DirectorBadgeProps {
  view: DashboardView;
  novelId: string;
  onActionComplete?: () => void;
  compact?: boolean;
  preview?: boolean;
  currentNavigationTarget?: string;
}

function statusLabel(mode: DashboardView["mode"]): string {
  switch (mode) {
    case "queued": return "等待开始";
    case "running": return "推进中";
    case "waiting_gate": return "等待确认";
    case "paused": return "暂停中";
    case "completed": return "已完成";
    case "failed": return "需要处理";
    case "cancelled": return "已取消";
  }
}

function driverLabel(driver: DashboardView["driver"]): string {
  return driver === "auto" ? "全自动推进" : "按阶段确认（半自动）";
}

function statusTone(mode: DashboardView["mode"]): string {
  if (mode === "failed") return "border-destructive/30 bg-destructive/5 text-destructive";
  if (mode === "waiting_gate" || mode === "paused") return "border-primary/30 bg-primary/5 text-foreground";
  if (mode === "completed" || mode === "running") return "border-transparent bg-muted/50 text-primary";
  return "border-border bg-muted/35 text-muted-foreground";
}

function StatusIcon({ mode }: { mode: DashboardView["mode"] }) {
  if (mode === "running") return <Activity className="h-4 w-4" aria-hidden="true" />;
  if (mode === "waiting_gate" || mode === "paused") return <PauseCircle className="h-4 w-4" aria-hidden="true" />;
  if (mode === "completed") return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
  if (mode === "failed") return <CircleAlert className="h-4 w-4" aria-hidden="true" />;
  if (mode === "cancelled") return <XCircle className="h-4 w-4" aria-hidden="true" />;
  return <PlayCircle className="h-4 w-4" aria-hidden="true" />;
}

function commandFor(action: DirectorAction, view: DashboardView, novelId: string): DirectorCommand | null {
  const idempotencyKey = `director-next:${view.runId}:${action.id}:${Date.now()}`;
  if (action.command === "open_run") {
    return { type: "open_run", novelId, driver: view.driver, stepIdsInScope: null, idempotencyKey };
  }
  if (action.command === "resume") {
    return { type: "resume", runId: view.runId, expectedVersion: view.sourceTrace.controlVersion, idempotencyKey };
  }
  if (action.command === "cancel") {
    return { type: "cancel", runId: view.runId, expectedVersion: view.sourceTrace.controlVersion, idempotencyKey };
  }
  return null;
}

export default function DirectorBadge({ view, novelId, onActionComplete, compact = false, preview = false, currentNavigationTarget }: DirectorBadgeProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: DirectorAction) => {
      const command = commandFor(action, view, novelId);
      if (!command) throw new Error("当前动作需要从来源页处理。");
      return submitDirectorCommand(command);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.directorNext.summary(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directorNext.detail(novelId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directorNext.runs(false) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directorNext.runs(true) }),
      ]);
      onActionComplete?.();
    },
  });

  const visibleActions = useMemo(
    () => view.availableActions.filter((action) => !currentNavigationTarget
      || action.kind !== "navigate" || action.target !== currentNavigationTarget),
    [currentNavigationTarget, view.availableActions],
  );
  const primaryAction = useMemo(
    () => visibleActions.find((action) => action.primary) ?? null,
    [visibleActions],
  );
  const secondaryActions = useMemo(
    () => visibleActions.filter((action) => action !== primaryAction && action.command !== "handoff"),
    [primaryAction, visibleActions],
  );

  const renderAction = (action: DirectorAction, primary: boolean) => {
    const actionClassName = "h-auto max-w-full whitespace-normal py-2";
    if (action.command === "open_run") return preview ? <Button key={action.id} className={actionClassName} disabled>{action.label}</Button> : <Button key={action.id} className={actionClassName} asChild variant={primary ? "default" : "ghost"}><a href="#director-start">{action.label}</a></Button>;
    if (action.kind === "navigate" && action.target) {
      return (
        <Button key={action.id} className={actionClassName} asChild size={primary ? "default" : "sm"} variant={primary ? "default" : "ghost"}>
          <Link to={action.target}>{action.label}</Link>
        </Button>
      );
    }
    if (action.kind === "command") {
      return (
        <Button
          key={action.id}
          className={actionClassName}
          type="button"
          size={primary ? "default" : "sm"}
          variant={primary ? "default" : "ghost"}
          disabled={preview || mutation.isPending}
          onClick={() => mutation.mutate(action)}
        >
          {mutation.isPending && primary ? "处理中…" : action.label}
        </Button>
      );
    }
    return null;
  };

  return (
    <section className={cn("flex min-w-0 flex-col gap-3", compact ? "py-1" : "py-3")} aria-label="导演状态">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="outline" className={cn("flex shrink-0 items-center gap-1.5", statusTone(view.mode))}>
          <StatusIcon mode={view.mode} />
          {statusLabel(view.mode)}
        </Badge>
        <span className="text-xs font-medium leading-6 text-muted-foreground" aria-label="创作方式">模式：{driverLabel(view.driver)}</span>
      </div>
      <p className="min-w-0 break-words text-sm leading-6 text-foreground" title={view.headline}>{view.headline}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {primaryAction ? renderAction(primaryAction, true) : null}
        {secondaryActions.map((action) => renderAction(action, false))}
      </div>
      {mutation.isError ? <p role="alert" className="w-full text-sm text-destructive">{mutation.error instanceof Error ? mutation.error.message : "动作提交失败。"}</p> : null}
    </section>
  );
}

export { statusLabel as directorStatusLabel, driverLabel as directorDriverLabel };
