import i18next from "i18next";
import type { ReactNode } from "react";
import { WorkspaceStateNotice } from "@/components/workspace";
import { TaskQueueMetricGrid, TaskQueueStatusBadge, type TaskQueueMetricItem } from "./TaskQueuePrimitives";

export type TaskQueueSeverity = "blocking" | "quality" | "normal";

const severityTone = {
  blocking: "danger",
  quality: "warning",
  normal: "neutral",
} as const;

const severityLabel = {
  blocking: i18next.t("tasks.levelBlocking"),
  quality: i18next.t("tasks.summaryQuality"),
  normal: i18next.t("taskQueue.taskQueueSemantic.dir9tj"),
} as const;

export function TaskQueueSeverityBadge(props: { severity: TaskQueueSeverity; label?: string }) {
  return <TaskQueueStatusBadge label={props.label ?? severityLabel[props.severity]} tone={severityTone[props.severity]} />;
}

export function TaskQueueImpactNotice(props: {
  severity: TaskQueueSeverity;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <WorkspaceStateNotice
      tone={severityTone[props.severity]}
      title={props.title}
      description={props.description}
      action={props.action}
      compact={props.compact}
    />
  );
}

export function TaskQueueEmptyState(props: { title: string; description: string; action?: ReactNode }) {
  return <WorkspaceStateNotice title={props.title} description={props.description} action={props.action} />;
}

export function TaskQueueSummaryGrid(props: { items: TaskQueueMetricItem[]; className?: string }) {
  return <TaskQueueMetricGrid items={props.items} className={props.className} />;
}
