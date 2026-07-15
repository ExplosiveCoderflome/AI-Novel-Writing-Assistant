import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  workspaceToneSurfaceClass,
  workspaceToneTextClass,
  type WorkspaceTone,
} from "@/components/workspace";

export interface TaskQueueMetricItem {
  key: string;
  label: string;
  value: string | number;
  detail?: string;
  tone?: WorkspaceTone;
}

export function TaskQueueMetricGrid(props: { items: TaskQueueMetricItem[]; className?: string }) {
  return (
    <section aria-label="任务状态摘要" className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", props.className)}>
      {props.items.map((item) => {
        const tone = item.tone ?? "neutral";
        return (
          <div key={item.key} className={cn("rounded-md border px-4 py-3", workspaceToneSurfaceClass[tone])}>
            <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
            <div className={cn("mt-2 text-xl font-semibold leading-none", workspaceToneTextClass[tone])}>{item.value}</div>
            {item.detail ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</div> : null}
          </div>
        );
      })}
    </section>
  );
}

export function TaskQueueStatusBadge(props: { label: string; tone?: WorkspaceTone; className?: string }) {
  const tone = props.tone ?? "neutral";
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-current bg-background/70",
        workspaceToneTextClass[tone],
        props.className,
      )}
    >
      {props.label}
    </Badge>
  );
}

export function TaskQueueItem(props: {
  selected: boolean;
  tone?: WorkspaceTone;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  const tone = props.tone ?? "neutral";
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className={cn(
        "w-full min-w-0 rounded-md border p-3 text-left transition-colors hover:border-primary/40",
        props.selected ? "border-primary bg-primary/5" : workspaceToneSurfaceClass[tone],
        props.className,
      )}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function TaskQueueSection(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border/80 bg-card", props.className)}>
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{props.title}</h2>
          {props.description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p> : null}
        </div>
        {props.actions ? <div className="mobile-full-actions shrink-0">{props.actions}</div> : null}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

export function TaskQueueActionRow(props: {
  title: string;
  consequence: string;
  action: ReactNode;
  tone?: WorkspaceTone;
}) {
  const tone = props.tone ?? "neutral";
  return (
    <div className={cn("flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between", workspaceToneSurfaceClass[tone])}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{props.title}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">执行后：{props.consequence}</div>
      </div>
      <div className="mobile-full-actions shrink-0">{props.action}</div>
    </div>
  );
}
