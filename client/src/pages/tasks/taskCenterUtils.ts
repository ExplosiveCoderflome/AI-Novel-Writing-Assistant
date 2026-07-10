import i18next from "i18next";
﻿import type {
  AutoDirectorAction,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import type {
  NovelWorkflowMilestoneType,
  NovelWorkflowResumeTarget,
} from "@ai-novel/shared/types/novelWorkflow";

export const ACTIVE_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);
export const ANOMALY_STATUSES = new Set<TaskStatus>(["failed", "cancelled"]);
export const ARCHIVABLE_STATUSES = new Set<TaskStatus>(["succeeded", "failed", "cancelled"]);

export type TaskSortMode = "default" | "updated_desc" | "updated_asc" | "heartbeat_desc" | "heartbeat_asc";

export function getTaskListPriority(status: TaskStatus): number {
  return status === "failed" ? 0 : 1;
}

export function getTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return new Date(value).getTime();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_f61f4cf6");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_f61f4cf6");
  }
  return date.toLocaleString();
}

export function formatTokenCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));
}

export function formatKind(kind: TaskKind): string {
  if (kind === "book_analysis") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_f90e9a49");
  }
  if (kind === "novel_workflow") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_227c1a99");
  }
  if (kind === "novel_pipeline") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_14f29641");
  }
  if (kind === "knowledge_document") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_a2a62a77");
  }
  if (kind === "style_extraction") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_f94905b4");
  }
  if (kind === "agent_run") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.agentRunning");
  }
  return i18next.t("gen.pages.tasks.taskCenterUtils.gen_c7741980");
}

export function formatCheckpoint(checkpoint: NovelWorkflowMilestoneType | null | undefined, scopeLabel?: string | null): string {
  const resolvedScopeLabel = scopeLabel?.trim() || i18next.t("gen.pages.tasks.taskCenterUtils.gen_dd4d6c1f");
  if (checkpoint === "rewrite_snapshot_created") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_40c91bfe");
  }
  if (checkpoint === "candidate_selection_required") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_dbc67929");
  }
  if (checkpoint === "book_contract_ready") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_BookContra_ppep");
  }
  if (checkpoint === "character_setup_required") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_67358797");
  }
  if (checkpoint === "volume_strategy_ready") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_c3eafe6f");
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolvedScopeLabel}自动执行已暂停`;
  }
  if (checkpoint === "replan_required") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_73ce2a55");
  }
  if (checkpoint === "workflow_completed") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.mainProcessComplete");
  }
  return i18next.t("gen.pages.tasks.taskCenterUtils.gen_f61f4cf6");
}

export function formatResumeTarget(target: NovelWorkflowResumeTarget | null | undefined): string {
  if (!target) {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_f61f4cf6");
  }
  if (target.route === "/novels/create") {
    return target.mode === "director" ? i18next.t("gen.pages.tasks.taskCenterUtils.gen_c25b9441") : i18next.t("gen.pages.tasks.taskCenterUtils.gen_7792a178");
  }
  if (target.stage === "story_macro") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_da67aefa");
  }
  if (target.stage === "character") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_fe7246de");
  }
  if (target.stage === "outline") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_b36113e5");
  }
  if (target.stage === "structured") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_d5891c2e");
  }
  if (target.stage === "chapter") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_ce7f7916");
  }
  if (target.stage === "pipeline") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_c5a96912");
  }
  return i18next.t("gen.pages.tasks.taskCenterUtils.gen_99336744");
}

export function formatStatus(status: TaskStatus): string {
  if (status === "queued") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_e5ac1d20");
  }
  if (status === "running") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_d679aea3");
  }
  if (status === "waiting_approval") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_3ced7e48");
  }
  if (status === "succeeded") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_fad5222c");
  }
  if (status === "failed") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.gen_acd5cb84");
  }
  return i18next.t("gen.pages.tasks.taskCenterUtils.gen_2111ccbb");
}

export function toStatusVariant(status: TaskStatus): "default" | "outline" | "secondary" | "destructive" {
  if (status === "running") {
    return "default";
  }
  if (status === "waiting_approval") {
    return "secondary";
  }
  if (status === "queued") {
    return "secondary";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "outline";
}

export function serializeListParams(input: {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
}): string {
  return JSON.stringify({
    kind: input.kind || null,
    status: input.status || null,
    keyword: input.keyword.trim() || null,
  });
}

export function createIdempotencyKey(taskId: string, actionCode: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${taskId}:${actionCode}:${globalThis.crypto.randomUUID()}`;
  }
  return `${taskId}:${actionCode}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function formatFollowUpPriority(priority: "P0" | "P1" | "P2"): string {
  if (priority === "P0") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.p0ProcessImmediately");
  }
  if (priority === "P1") {
    return i18next.t("gen.pages.tasks.taskCenterUtils.p1ProcessSoon");
  }
  return i18next.t("gen.pages.tasks.taskCenterUtils.p2ProcessLater");
}

export function followUpActionVariant(action: AutoDirectorAction): "default" | "outline" {
  return action.kind === "navigation" || action.riskLevel !== "low" ? "outline" : "default";
}
