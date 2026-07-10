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
    return "已完成";
  }
  if (status === "in_progress") {
    return "进行中";
  }
  if (status === "rework") {
    return "待返工";
  }
  if (status === "blocked") {
    return "受阻";
  }
  return "未开始";
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
    { id: "running", label: "推进中", value: running, tone: running > 0 ? "info" : "neutral" },
    { id: "waiting", label: "待确认", value: waiting, tone: waiting > 0 ? "warning" : "neutral" },
    { id: "ready", label: "可写章节", value: ready, tone: ready > 0 ? "success" : "neutral" },
    { id: "issue", label: "暂停/失败", value: issue, tone: issue > 0 ? "danger" : "neutral" },
  ];
}

export function getWorkflowTone(task?: NovelAutoDirectorTaskSummary | null): NovelListTone {
  if (!task) {
    return "neutral";
  }
  if (task.status === "failed" || task.status === "cancelled") {
    return "danger";
  }
  if (task.status === "waiting_approval") {
    return "warning";
  }
  if (canEnterChapterExecution(task)) {
    return "success";
  }
  if (task.status === "running" || task.status === "queued") {
    return "info";
  }
  return "neutral";
}

export function buildWorkflowDisplay(novel: NovelListItem): WorkflowDisplay {
  const task = novel.latestAutoDirectorTask ?? null;
  const description = getWorkflowDescription(task);
  if (!task) {
    return {
      tone: "neutral",
      label: "资料项目",
      description: novel.description?.trim() || "没有自动导演任务，可以进入项目继续完善资料或章节。",
      progress: 0,
      currentStage: "未进入自动导演",
      currentAction: "",
      lastHealthyStage: "",
      running: false,
    };
  }
  const currentAction = task.currentItemLabel?.trim() || "";
  return {
    tone: getWorkflowTone(task),
    label: task.displayStatus?.trim() || task.resumeAction?.trim() || task.nextActionLabel?.trim() || "自动导演",
    description: description || "系统保留推进状态，可以继续查看或恢复。",
    progress: Math.round(task.progress * 100),
    currentStage: task.currentStage ?? "自动导演",
    currentAction,
    lastHealthyStage: task.lastHealthyStage ?? "",
    running: isWorkflowRunningInBackground(task),
  };
}

export function getPrimaryActionLabel(novel: NovelListItem): string {
  const task = novel.latestAutoDirectorTask ?? null;
  if (canContinueChapterBatchAutoExecution(task)) {
    return task?.resumeAction ?? `继续自动执行${task?.executionScopeLabel ?? "当前章节范围"}`;
  }
  if (canContinueDirector(task)) {
    return task?.resumeAction ?? "继续导演";
  }
  if (requiresCandidateSelection(task)) {
    return task?.resumeAction ?? "继续确认方向";
  }
  if (canEnterChapterExecution(task)) {
    return "进入章节执行";
  }
  if (task) {
    return "查看推进状态";
  }
  return "编辑小说";
}

export function getProjectAssetRows(novel: NovelListItem): Array<{
  label: string;
  value: string;
  tone?: NovelListTone;
}> {
  return [
    { label: "章节", value: String(novel._count.chapters) },
    { label: "角色", value: String(novel._count.characters) },
    {
      label: "世界观",
      value: novel.world?.name ?? "未绑定",
      tone: novel.world?.name ? "neutral" : "warning",
    },
    {
      label: "资源",
      value: `${novel.resourceReadyScore ?? 0}/100`,
      tone: (novel.resourceReadyScore ?? 0) >= 60 ? "success" : "warning",
    },
  ];
}
