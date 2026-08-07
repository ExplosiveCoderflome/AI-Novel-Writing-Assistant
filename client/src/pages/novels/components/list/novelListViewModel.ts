import type {
  NovelAutoDirectorTaskSummary,
  ProjectProgressStatus,
} from "@ai-novel/shared/types/novel";
import type { NovelListResponse } from "@/api/novel/shared";
import {
  canContinueChapterBatchAutoExecution,
  canContinueDirector,
  canEnterChapterExecution,
  getWorkflowDescription,
  isWorkflowRunningInBackground,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";

export type NovelListItem = NovelListResponse["items"][number];
export type StatusFilter = "all" | "draft" | "published";
export type WritingModeFilter = "all" | "original" | "continuation";
export type NovelListTone = "neutral" | "info" | "success" | "warning" | "danger";

export const DIRECTOR_CREATE_LINK = "/novels/auto-director";
export const MANUAL_CREATE_LINK = "/novels/create";
export const NOVEL_LIST_PAGE_SIZE = 24;

export interface NovelListSummaryItem {
  id: string;
  label: string;
  value: number;
  tone: NovelListTone;
}

export interface WorkflowDisplay {
  tone: NovelListTone;
  label: string;
  description: string;
  progress: number;
  currentStage: string;
  currentAction: string;
  lastHealthyStage: string;
  running: boolean;
}

export function filterNovelList(input: {
  novels: NovelListItem[];
  status: StatusFilter;
  writingMode: WritingModeFilter;
}): NovelListItem[] {
  return input.novels.filter((item) => {
    if (input.status !== "all" && item.status !== input.status) {
      return false;
    }
    if (input.writingMode !== "all" && item.writingMode !== input.writingMode) {
      return false;
    }
    return true;
  });
}

export function formatProgressStatus(status?: ProjectProgressStatus | null): string {
  if (status === "completed") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (status === "in_progress") {
    return "in progress";
  }
  if (status === "rework") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (status === "blocked") {
    return "blocked";
  }
  return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
}

export function formatTokenCount(value?: number | null): string {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
  return new Intl.NumberFormat("zh-CN").format(normalized);
}

export function buildNovelListSummary(novels: NovelListItem[]): NovelListSummaryItem[] {
  const running = novels.filter((novel) => {
    const task = novel.latestAutoDirectorTask;
    return task?.status === "queued" || task?.status === "running";
  }).length;
  const waiting = novels.filter((novel) => novel.latestAutoDirectorTask?.status === "waiting_approval").length;
  const ready = novels.filter((novel) => canEnterChapterExecution(novel.latestAutoDirectorTask ?? null)).length;
  const issue = novels.filter((novel) => {
    const status = novel.latestAutoDirectorTask?.status;
    return status === "failed" || status === "cancelled";
  }).length;

  return [
    { id: "running", label: "Advancing", value: running, tone: running > 0 ? "info" : "neutral" },
    { id: "waiting", label: "To be confirmed", value: waiting, tone: waiting > 0 ? "warning" : "neutral" },
    { id: "ready", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", value: ready, tone: ready > 0 ? "success" : "neutral" },
    { id: "issue", label: "pause/fail", value: issue, tone: issue > 0 ? "danger" : "neutral" }, ]; } export function getWorkflowTone(task?: NovelAutoDirectorTaskSummary | null): NovelListTone { if (!task) { return "neutral"; } if (task.status === "failed" || task.status === "cancelled") { return "danger"; } if (task.status === "waiting_approval") { return "warning"; } if (canEnterChapterExecution(task)) { return "success"; } if (task.status === "running" || task.status === "queued") { return "info"; } return "neutral"; } export function buildWorkflowDisplay(novel: NovelListItem): WorkflowDisplay { const task = novel.latestAutoDirectorTask ?? null; const description = getWorkflowDescription(task); if (!task) { return { tone: "neutral", label: "Data Project", description: novel.description?.trim() || "No auto-director task. You can enter the project to continue improving the data or chapters.", progress: 0, currentStage: "Not in auto-director", currentAction: "", lastHealthyStage: "", running: false, }; } const currentAction = task.currentItemLabel?.trim() || ""; return { tone: getWorkflowTone(task), label: task.displayStatus?.trim() || task.resumeAction?.trim() || task.nextActionLabel?.trim() || "Auto-director", description: description || "The system retains the progress status. You can continue to view or resume.", progress: Math.round(task.progress * 100), currentStage: task.currentStage ?? "Auto-director", currentAction, lastHealthyStage: task.lastHealthyStage ?? "", running: isWorkflowRunningInBackground(task), }; } export function getPrimaryActionLabel(novel: NovelListItem): string { const task = novel.latestAutoDirectorTask ?? null; if (canContinueChapterBatchAutoExecution(task)) { return task?.resumeAction ?? `Continue automatic execution ${task?.executionScopeLabel ?? "Current chapter scope"}`; } if (canContinueDirector(task)) { return task?.resumeAction ?? "Continue directing"; } if (requiresCandidateSelection(task)) { return task?.resumeAction ?? "Continue confirming direction"; } if (canEnterChapterExecution(task)) { return "Enter chapter execution"; } if (task) { return "Check progress status"; } return "Edit novel"; } export function getProjectAssetRows(novel: NovelListItem): Array<{
  label: string;
  value: string;
  tone?: NovelListTone;
}> {
  return [
    { label: "chapter", value: String(novel._count.chapters) },
    { label: "Role", value: String(novel._count.characters) },
    {
      label: "world view",
      value: novel.world?.name ?? "Not bound",
      tone: novel.world?.name ? "neutral" : "warning",
    },
    {
      label: "resource",
      value: `${novel.resourceReadyScore ?? 0}/100`,
      tone: (novel.resourceReadyScore ?? 0) >= 60 ? "success" : "warning",
    },
  ];
}
