import i18next from "i18next";
import type { TaskOverviewSummary } from "@ai-novel/shared/types/task";
import type { NovelListResponse } from "@/api/novel/shared";
import {
  canContinueChapterBatchAutoExecution,
  canContinueDirector,
  canEnterChapterExecution,
  getWorkflowDescription,
  isWorkflowActionRequired,
  isWorkflowRunningInBackground,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";

export const HOME_NOVEL_FETCH_LIMIT = 12;
export const HOME_RECENT_LIMIT = 6;
export const DIRECTOR_CREATE_LINK = "/novels/auto-director";
export const MANUAL_CREATE_LINK = "/novels/create";

export type HomeNovelItem = NovelListResponse["items"][number];
export type HomeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface HomeMetric {
  id: string;
  title: string;
  value: string | number;
  hint: string;
  tone: HomeTone;
}

export interface HomeAttentionItem {
  id: string;
  title: string;
  description: string;
  tone: HomeTone;
  to?: string;
  actionLabel?: string;
}

export interface HomeAssetHealthItem {
  id: string;
  title: string;
  value: string;
  description: string;
  tone: HomeTone;
}

export interface HomeNextAction {
  kind: "novel" | "starter";
  eyebrow: string;
  title: string;
  description: string;
  reason: string;
  tone: HomeTone;
}

export function formatHomeDate(value: string | undefined): string {
  if (!value) {
    return i18next.t("gen.pages.home.homeViewModel.gen_f61f4cf6");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return i18next.t("gen.pages.home.homeViewModel.gen_f61f4cf6");
  }
  return date.toLocaleString();
}

export function getNovelPriorityScore(novel: HomeNovelItem): number {
  const task = novel.latestAutoDirectorTask ?? null;
  if (canContinueChapterBatchAutoExecution(task)) {
    return 0;
  }
  if (requiresCandidateSelection(task)) {
    return 1;
  }
  if (canContinueDirector(task)) {
    return 2;
  }
  if (task?.status === "running" || task?.status === "queued") {
    return 3;
  }
  if (canEnterChapterExecution(task)) {
    return 4;
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return 5;
  }
  return 6;
}

export function getNovelLeadSummary(novel: HomeNovelItem): string {
  const workflowDescription = getWorkflowDescription(novel.latestAutoDirectorTask ?? null);
  if (workflowDescription) {
    return workflowDescription;
  }
  if (novel.description?.trim()) {
    return novel.description.trim();
  }
  if (novel.world?.name) {
    return `当前项目绑定世界观「${novel.world.name}」，可以继续创作。`;
  }
  return i18next.t("gen.pages.home.homeViewModel.gen_93364b21");
}

export function selectPrimaryNovel(novels: HomeNovelItem[]): HomeNovelItem | null {
  if (novels.length === 0) {
    return null;
  }
  return novels.reduce<HomeNovelItem | null>((selected, current) => {
    if (!selected) {
      return current;
    }
    const selectedPriority = getNovelPriorityScore(selected);
    const currentPriority = getNovelPriorityScore(current);
    return currentPriority < selectedPriority ? current : selected;
  }, null);
}

export function buildHomeNextAction(primaryNovel: HomeNovelItem | null): HomeNextAction {
  if (!primaryNovel) {
    return {
      kind: "starter",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_de6465aa"),
      title: i18next.t("gen.pages.home.homeViewModel.gen_9c3aa028"),
      description: i18next.t("gen.pages.home.homeViewModel.gen_059a2612"),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_eace0878"),
      tone: "info",
    };
  }

  const task = primaryNovel.latestAutoDirectorTask ?? null;
  if (canContinueChapterBatchAutoExecution(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_9ff48c30"),
      title: `恢复《${primaryNovel.title}》的章节执行`,
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_036b9ab0"),
      tone: "danger",
    };
  }
  if (requiresCandidateSelection(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_9ff48c30"),
      title: `确认《${primaryNovel.title}》的书级方向`,
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_c2813e84"),
      tone: "warning",
    };
  }
  if (canContinueDirector(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_9ff48c30"),
      title: `继续《${primaryNovel.title}》的自动导演`,
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_7aa3fedb"),
      tone: "warning",
    };
  }
  if (task?.status === "running" || task?.status === "queued") {
    return {
      kind: "novel",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_daf87615"),
      title: `关注《${primaryNovel.title}》的后台进度`,
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_e3f5c26f"),
      tone: "info",
    };
  }
  if (canEnterChapterExecution(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_9ff48c30"),
      title: `进入《${primaryNovel.title}》的章节执行`,
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_c69fb4b4"),
      tone: "success",
    };
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return {
      kind: "novel",
      eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_54dc8247"),
      title: `查看《${primaryNovel.title}》的推进状态`,
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("gen.pages.home.homeViewModel.gen_9c5e9796"),
      tone: "danger",
    };
  }
  return {
    kind: "novel",
    eyebrow: i18next.t("gen.pages.home.homeViewModel.gen_9ff48c30"),
    title: `继续编辑《${primaryNovel.title}》`,
    description: getNovelLeadSummary(primaryNovel),
    reason: i18next.t("gen.pages.home.homeViewModel.gen_083bfa9b"),
    tone: "neutral",
  };
}

export function buildHomeMetrics(input: {
  novels: HomeNovelItem[];
  taskOverview?: TaskOverviewSummary | null;
}): HomeMetric[] {
  const liveWorkflowCount = input.novels.filter((novel) => (
    isWorkflowRunningInBackground(novel.latestAutoDirectorTask ?? null)
  )).length;
  const actionRequiredCount = input.novels.filter((novel) => (
    isWorkflowActionRequired(novel.latestAutoDirectorTask ?? null)
  )).length;
  const readyForExecutionCount = input.novels.filter((novel) => (
    canEnterChapterExecution(novel.latestAutoDirectorTask ?? null)
  )).length;
  const failedTaskCount = input.taskOverview?.failedCount ?? 0;

  return [
    {
      id: "running",
      title: i18next.t("gen.pages.home.homeViewModel.gen_007edf50"),
      value: liveWorkflowCount,
      hint: i18next.t("gen.pages.home.homeViewModel.gen_bba3e2f7"),
      tone: "info",
    },
    {
      id: "attention",
      title: i18next.t("gen.pages.home.homeViewModel.gen_047109de"),
      value: actionRequiredCount,
      hint: i18next.t("gen.pages.home.homeViewModel.gen_95c7ebda"),
      tone: actionRequiredCount > 0 ? "warning" : "success",
    },
    {
      id: "chapter-ready",
      title: i18next.t("gen.pages.home.homeViewModel.gen_7d7acbea"),
      value: readyForExecutionCount,
      hint: i18next.t("gen.pages.home.homeViewModel.gen_c7ea8ff7"),
      tone: readyForExecutionCount > 0 ? "success" : "neutral",
    },
    {
      id: "failed",
      title: i18next.t("gen.pages.home.homeViewModel.gen_a8a1f41f"),
      value: failedTaskCount,
      hint: i18next.t("gen.pages.home.homeViewModel.gen_ef51266d"),
      tone: failedTaskCount > 0 ? "danger" : "success",
    },
  ];
}

export function buildHomeAttentionItems(input: {
  novels: HomeNovelItem[];
  taskOverview?: TaskOverviewSummary | null;
}): HomeAttentionItem[] {
  const actionRequiredCount = input.novels.filter((novel) => (
    isWorkflowActionRequired(novel.latestAutoDirectorTask ?? null)
  )).length;
  const readyForExecutionCount = input.novels.filter((novel) => (
    canEnterChapterExecution(novel.latestAutoDirectorTask ?? null)
  )).length;
  const runningCount = input.taskOverview?.runningCount ?? 0;
  const waitingApprovalCount = input.taskOverview?.waitingApprovalCount ?? 0;
  const recoveryCandidateCount = input.taskOverview?.recoveryCandidateCount ?? 0;
  const failedTaskCount = input.taskOverview?.failedCount ?? 0;
  const items: HomeAttentionItem[] = [];

  if (failedTaskCount > 0 || recoveryCandidateCount > 0) {
    items.push({
      id: "task-recovery",
      title: failedTaskCount > 0 ? `${failedTaskCount} 个后台任务失败` : `${recoveryCandidateCount} 个任务可恢复`,
      description: i18next.t("gen.pages.home.homeViewModel.gen_6b7dbd6f"),
      tone: failedTaskCount > 0 ? "danger" : "warning",
      to: "/tasks",
      actionLabel: i18next.t("gen.pages.home.homeViewModel.gen_9dd8c364"),
    });
  }
  if (actionRequiredCount > 0 || waitingApprovalCount > 0) {
    items.push({
      id: "workflow-action-required",
      title: `${Math.max(actionRequiredCount, waitingApprovalCount)} 个创作流程等待处理`,
      description: i18next.t("gen.pages.home.homeViewModel.gen_3f382d26"),
      tone: "warning",
      to: "/auto-director/follow-ups",
      actionLabel: i18next.t("gen.pages.home.homeViewModel.gen_cb22c7c1"),
    });
  }
  if (readyForExecutionCount > 0) {
    items.push({
      id: "chapter-ready",
      title: `${readyForExecutionCount} 个项目可进入章节执行`,
      description: i18next.t("gen.pages.home.homeViewModel.gen_4b9e5601"),
      tone: "success",
    });
  }
  if (runningCount > 0) {
    items.push({
      id: "running-tasks",
      title: `${runningCount} 个任务处理中`,
      description: i18next.t("gen.pages.home.homeViewModel.gen_758ac9f9"),
      tone: "info",
      to: "/tasks",
      actionLabel: i18next.t("gen.pages.home.homeViewModel.gen_9600c918"),
    });
  }

  return items.slice(0, 4);
}

export function buildHomeAssetHealthItems(novels: HomeNovelItem[]): HomeAssetHealthItem[] {
  const totalNovels = novels.length;
  const worldBoundCount = novels.filter((novel) => Boolean(novel.world?.id || novel.worldId)).length;
  const totalCharacters = novels.reduce((sum, novel) => sum + novel._count.characters, 0);
  const totalChapters = novels.reduce((sum, novel) => sum + novel._count.chapters, 0);
  const resourceScores = novels
    .map((novel) => novel.resourceReadyScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  const averageResourceScore = resourceScores.length > 0
    ? Math.round(resourceScores.reduce((sum, score) => sum + score, 0) / resourceScores.length)
    : null;

  return [
    {
      id: "world",
      title: i18next.t("gen.pages.home.homeViewModel.gen_ccd81d16"),
      value: totalNovels > 0 ? `${worldBoundCount}/${totalNovels}` : "0",
      description: totalNovels > 0
        ? i18next.t("gen.pages.home.homeViewModel.gen_1d29dac7")
        : i18next.t("gen.pages.home.homeViewModel.gen_42f59f8a"),
      tone: totalNovels === 0 ? "neutral" : worldBoundCount === totalNovels ? "success" : "warning",
    },
    {
      id: "characters",
      title: i18next.t("gen.pages.home.homeViewModel.gen_88afed0d"),
      value: String(totalCharacters),
      description: i18next.t("gen.pages.home.homeViewModel.gen_33399576"),
      tone: totalCharacters > 0 ? "success" : "warning",
    },
    {
      id: "chapters",
      title: i18next.t("gen.pages.home.homeViewModel.gen_6ee26458"),
      value: String(totalChapters),
      description: i18next.t("gen.pages.home.homeViewModel.gen_7d8e24a2"),
      tone: totalChapters > 0 ? "info" : "neutral",
    },
    {
      id: "readiness",
      title: i18next.t("gen.pages.home.homeViewModel.gen_31032ccf"),
      value: averageResourceScore == null ? "--" : `${averageResourceScore}`,
      description: i18next.t("gen.pages.home.homeViewModel.gen_ccc59df1"),
      tone: averageResourceScore == null
        ? "neutral"
        : averageResourceScore >= 80
          ? "success"
          : averageResourceScore >= 50
            ? "warning"
            : "danger",
    },
  ];
}
