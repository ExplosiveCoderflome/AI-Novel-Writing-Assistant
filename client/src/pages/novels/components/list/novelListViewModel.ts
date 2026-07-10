import i18next from "i18next";
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
    return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_fad5222c");
  }
  if (status === "in_progress") {
    return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_fb852fc6");
  }
  if (status === "rework") {
    return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_87ebc735");
  }
  if (status === "blocked") {
    return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_644fe1bd");
  }
  return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_dd4e55c3");
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
    { id: "running", label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_007edf50"), value: running, tone: running > 0 ? "info" : "neutral" },
    { id: "waiting", label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_2a2772fa"), value: waiting, tone: waiting > 0 ? "warning" : "neutral" },
    { id: "ready", label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_7d7acbea"), value: ready, tone: ready > 0 ? "success" : "neutral" },
    { id: "issue", label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_0df14edc"), value: issue, tone: issue > 0 ? "danger" : "neutral" },
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
      label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_cdbb5133"),
      description: novel.description?.trim() || i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_476d9bdf"),
      progress: 0,
      currentStage: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_945c0411"),
      currentAction: "",
      lastHealthyStage: "",
      running: false,
    };
  }
  const currentAction = task.currentItemLabel?.trim() || "";
  return {
    tone: getWorkflowTone(task),
    label: task.displayStatus?.trim() || task.resumeAction?.trim() || task.nextActionLabel?.trim() || i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_1772aede"),
    description: description || i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_8766510d"),
    progress: Math.round(task.progress * 100),
    currentStage: task.currentStage ?? i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_1772aede"),
    currentAction,
    lastHealthyStage: task.lastHealthyStage ?? "",
    running: isWorkflowRunningInBackground(task),
  };
}

export function getPrimaryActionLabel(novel: NovelListItem): string {
  const task = novel.latestAutoDirectorTask ?? null;
  if (canContinueChapterBatchAutoExecution(task)) {
    return task?.resumeAction ?? `继续自动执行${task?.executionScopeLabel ?? i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_d7432bb5")}`;
  }
  if (canContinueDirector(task)) {
    return task?.resumeAction ?? i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_1f32f18b");
  }
  if (requiresCandidateSelection(task)) {
    return task?.resumeAction ?? i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_e92496b4");
  }
  if (canEnterChapterExecution(task)) {
    return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_98b5f8b5");
  }
  if (task) {
    return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_ffc75805");
  }
  return i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_699b4b33");
}

export function getProjectAssetRows(novel: NovelListItem): Array<{
  label: string;
  value: string;
  tone?: NovelListTone;
}> {
  return [
    { label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_9290b644"), value: String(novel._count.chapters) },
    { label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_464f3d4e"), value: String(novel._count.characters) },
    {
      label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_cfb83c02"),
      value: novel.world?.name ?? i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_906ad18b"),
      tone: novel.world?.name ? "neutral" : "warning",
    },
    {
      label: i18next.t("gen.pages.novels.components.list.novelListViewModel.gen_eee83a92"),
      value: `${novel.resourceReadyScore ?? 0}/100`,
      tone: (novel.resourceReadyScore ?? 0) >= 60 ? "success" : "warning",
    },
  ];
}
