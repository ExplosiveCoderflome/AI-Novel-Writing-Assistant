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
import { featureFlags } from "@/config/featureFlags";

export type NovelListItem = NovelListResponse["items"][number];
export type StatusFilter = "all" | "draft" | "published";
export type WritingModeFilter = "all" | "original" | "continuation";
export type NovelListTone = "neutral" | "info" | "success" | "warning" | "danger";

export const DIRECTOR_CREATE_LINK = "/novels/auto-director";
export const SHORT_STORY_CREATE_LINK = featureFlags.creationStudioEnabled
  ? "/create?form=short_story"
  : null;
export const PRIMARY_CREATE_LABEL = "AI 自动导演开书";
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

export function getNovelWorkflowTask(novel: NovelListItem): NovelAutoDirectorTaskSummary | null {
  return novel.narrativeForm === "short_story"
    ? novel.latestCreationStudioTask ?? null
    : novel.latestAutoDirectorTask ?? null;
}

export function getNovelWorkspaceHref(novel: NovelListItem): string {
  if (novel.narrativeForm === "short_story") {
    return `/novels/${novel.id}/story`;
  }
  if (novel.creationExperience === "simple") {
    return `/novels/${novel.id}/simple`;
  }
  const task = novel.latestAutoDirectorTask;
  return task?.id
    ? `/novels/${novel.id}/edit?directorTaskId=${encodeURIComponent(task.id)}`
    : `/novels/${novel.id}/edit`;
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
    return i18next.t("tasks.filterStatusSucceeded");
  }
  if (status === "in_progress") {
    return i18next.t("tasks.levelRunning");
  }
  if (status === "rework") {
    return i18next.t("dict.gen_87ebc735");
  }
  if (status === "blocked") {
    return i18next.t("dict.gen_644fe1bd");
  }
  return i18next.t("dict.gen_dd4e55c3");
}

export function formatTokenCount(value?: number | null): string {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
  return new Intl.NumberFormat("zh-CN").format(normalized);
}

export function buildNovelListSummary(novels: NovelListItem[]): NovelListSummaryItem[] {
  const running = novels.filter((novel) => {
    const task = getNovelWorkflowTask(novel);
    return task?.status === "queued" || task?.status === "running";
  }).length;
  const waiting = novels.filter((novel) => getNovelWorkflowTask(novel)?.status === "waiting_approval").length;
  const ready = novels.filter((novel) => (
    novel.narrativeForm === "short_story"
      ? getNovelWorkflowTask(novel)?.status === "succeeded"
      : canEnterChapterExecution(getNovelWorkflowTask(novel))
  )).length;
  const issue = novels.filter((novel) => {
    const status = getNovelWorkflowTask(novel)?.status;
    return status === "failed" || status === "cancelled";
  }).length;

  return [
    { id: "running", label: i18next.t("dict.gen_007edf50"), value: running, tone: running > 0 ? "info" : "neutral" },
    { id: "waiting", label: i18next.t("dict.gen_2a2772fa"), value: waiting, tone: waiting > 0 ? "warning" : "neutral" },
    { id: "ready", label: i18next.t("dict.gen_4281b2b4"), value: ready, tone: ready > 0 ? "success" : "neutral" },
    { id: "issue", label: i18next.t("dict.gen_0df14edc"), value: issue, tone: issue > 0 ? "danger" : "neutral" },
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
  const task = getNovelWorkflowTask(novel);
  if (novel.narrativeForm === "short_story") {
    return {
      tone: task?.status === "failed" ? "danger" : task?.status === "succeeded" ? "success" : "info",
      label: task?.status === "succeeded" ? "完整短篇" : "短篇创作中",
      description: task?.checkpointSummary?.trim()
        || task?.currentItemLabel?.trim()
        || novel.description?.trim()
        || "AI 正在把已确认的方向写成一篇连续作品。",
      progress: Math.round((task?.progress ?? 0) * 100),
      currentStage: i18next.t("novels.novelListViewModel.io83jo"),
      currentAction: task?.currentItemLabel?.trim() || "",
      lastHealthyStage: "",
      running: task?.status === "queued" || task?.status === "running",
    };
  }
  const description = getWorkflowDescription(task);
  if (!task) {
    return {
      tone: "neutral",
      label: i18next.t("dict.gen_cdbb5133"),
      description: novel.description?.trim() || "没有自动导演任务，可以进入项目继续完善资料或章节。",
      progress: 0,
      currentStage: i18next.t("dict.gen_945c0411"),
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
  if (novel.narrativeForm === "short_story") {
    return i18next.t("novels.novelListViewModel.csr73m");
  }
  const task = getNovelWorkflowTask(novel);
  if (canContinueChapterBatchAutoExecution(task)) {
    return task?.resumeAction ?? i18next.t("novels.novelEditTakeover.shared.lpivmv", { val1: (task?.executionScopeLabel ?? "当前章节范围") });
  }
  if (canContinueDirector(task)) {
    return task?.resumeAction ?? "继续导演";
  }
  if (requiresCandidateSelection(task)) {
    return task?.resumeAction ?? "继续确认方向";
  }
  if (canEnterChapterExecution(task)) {
    return i18next.t("dict.gen_98b5f8b5");
  }
  if (task) {
    return i18next.t("dict.gen_ffc75805");
  }
  return i18next.t("dict.gen_699b4b33");
}

export function getProjectAssetRows(novel: NovelListItem): Array<{
  label: string;
  value: string;
  tone?: NovelListTone;
}> {
  if (novel.narrativeForm === "short_story") {
    return [
      { label: i18next.t("novels.novelListFilterBar.gqul"), value: i18next.t("novels.novelListFilterBar.l2t6") },
      { label: i18next.t("dict.gen_73e82552"), value: i18next.t("novels.chapterEditorSidebar.izeb8n", { val1: ((novel.targetWordCount ?? 0).toLocaleString()) }) },
      { label: i18next.t("dict.gen_58378f0d"), value: getNovelWorkflowTask(novel)?.status === "succeeded" ? "已完成" : "生成中", tone: "info" },
      { label: i18next.t("dict.gen_26ca20b1"), value: novel.derivedFromNovelId ? "派生作品" : "原创" },
    ];
  }
  return [
    { label: i18next.t("dict.gen_9290b644"), value: String(novel._count.chapters) },
    { label: i18next.t("dict.gen_464f3d4e"), value: String(novel._count.characters) },
    {
      label: i18next.t("dict.gen_cfb83c02"),
      value: novel.world?.name ?? "未绑定",
      tone: novel.world?.name ? "neutral" : "warning",
    },
    {
      label: i18next.t("dict.gen_eee83a92"),
      value: `${novel.resourceReadyScore ?? 0}/100`,
      tone: (novel.resourceReadyScore ?? 0) >= 60 ? "success" : "warning",
    },
  ];
}
