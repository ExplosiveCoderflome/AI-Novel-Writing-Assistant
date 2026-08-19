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
import { featureFlags } from "@/config/featureFlags";

export const HOME_NOVEL_FETCH_LIMIT = 12;
export const HOME_RECENT_LIMIT = 6;
export const DIRECTOR_CREATE_LINK = "/novels/auto-director";
export const SHORT_STORY_CREATE_LINK = featureFlags.creationStudioEnabled
  ? "/create?form=short_story"
  : null;
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

export function getHomeNovelTask(novel: HomeNovelItem) {
  return novel.narrativeForm === "short_story"
    ? novel.latestCreationStudioTask ?? null
    : novel.latestAutoDirectorTask ?? null;
}

export function formatHomeDate(value: string | undefined): string {
  if (!value) {
    return i18next.t("common.none");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return i18next.t("common.none");
  }
  return date.toLocaleString();
}

export function getNovelPriorityScore(novel: HomeNovelItem): number {
  const task = getHomeNovelTask(novel);
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
  const workflowDescription = getWorkflowDescription(getHomeNovelTask(novel));
  if (workflowDescription) {
    return workflowDescription;
  }
  if (novel.description?.trim()) {
    return novel.description.trim();
  }
  if (novel.world?.name) {
    return i18next.t("home.homeViewModel.5kd5ry", { val1: (novel.world.name) });
  }
  return i18next.t("dict.gen_93364b21");
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
      eyebrow: i18next.t("dict.gen_de6465aa"),
      title: i18next.t("home.homeViewModel.qjrgh2"),
      description: i18next.t("home.homeViewModel.n1d095"),
      reason: i18next.t("home.homeViewModel.jz5v8n"),
      tone: "info",
    };
  }

  const task = getHomeNovelTask(primaryNovel);
  if (primaryNovel.narrativeForm === "short_story") {
    return {
      kind: "novel",
      eyebrow: task?.status === "succeeded" ? "完整作品" : "创作进行中",
      title: task?.status === "succeeded" ? "继续完善这篇作品" : "查看成稿进度",
      description: getNovelLeadSummary(primaryNovel),
      reason: task?.status === "succeeded"
        ? "作品已完整生成，可以直接阅读、编辑、修改或导出。"
        : "短篇正在后台写成一篇连续作品，打开后即可查看实时进度。",
      tone: task?.status === "succeeded" ? "success" : "info",
    };
  }
  if (canContinueChapterBatchAutoExecution(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("dict.gen_9ff48c30"),
      title: i18next.t("home.homeViewModel.sj8seq"),
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("dict.gen_036b9ab0"),
      tone: "danger",
    };
  }
  if (requiresCandidateSelection(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("dict.gen_9ff48c30"),
      title: i18next.t("home.homeViewModel.4zkl1o"),
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("dict.gen_c2813e84"),
      tone: "warning",
    };
  }
  if (canContinueDirector(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("dict.gen_9ff48c30"),
      title: i18next.t("home.homeViewModel.y6v0tg"),
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("dict.gen_7aa3fedb"),
      tone: "warning",
    };
  }
  if (task?.status === "running" || task?.status === "queued") {
    return {
      kind: "novel",
      eyebrow: "AI 创作中",
      title: i18next.t("home.homeViewModel.jteb2"),
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("dict.gen_e3f5c26f"),
      tone: "info",
    };
  }
  if (canEnterChapterExecution(task)) {
    return {
      kind: "novel",
      eyebrow: i18next.t("dict.gen_9ff48c30"),
      title: i18next.t("home.homeViewModel.ei7az2"),
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("dict.gen_c69fb4b4"),
      tone: "success",
    };
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return {
      kind: "novel",
      eyebrow: i18next.t("onboarding.needsAction"),
      title: i18next.t("home.homeViewModel.uz5hqb"),
      description: getNovelLeadSummary(primaryNovel),
      reason: i18next.t("dict.gen_9c5e9796"),
      tone: "danger",
    };
  }
  return {
    kind: "novel",
    eyebrow: i18next.t("dict.gen_9ff48c30"),
    title: i18next.t("home.homeViewModel.kztlul"),
    description: getNovelLeadSummary(primaryNovel),
    reason: i18next.t("dict.gen_083bfa9b"),
    tone: "neutral",
  };
}

export function buildHomeMetrics(input: {
  novels: HomeNovelItem[];
  taskOverview?: TaskOverviewSummary | null;
}): HomeMetric[] {
  const liveWorkflowCount = input.novels.filter((novel) => (
    isWorkflowRunningInBackground(getHomeNovelTask(novel))
  )).length;
  const actionRequiredCount = input.novels.filter((novel) => (
    isWorkflowActionRequired(getHomeNovelTask(novel))
  )).length;
  const readyForExecutionCount = input.novels.filter((novel) => (
    novel.narrativeForm === "short_story"
      ? getHomeNovelTask(novel)?.status === "succeeded"
      : canEnterChapterExecution(getHomeNovelTask(novel))
  )).length;
  const totalChapterCount = input.novels.reduce((sum, novel) => sum + novel._count.chapters, 0);

  return [
    {
      id: "running",
      title: i18next.t("home.currentlyWriting"),
      value: liveWorkflowCount,
      hint: i18next.t("home.homeViewModel.t0ujk3"),
      tone: "info",
    },
    {
      id: "attention",
      title: i18next.t("dict.gen_afa80d33"),
      value: actionRequiredCount,
      hint: i18next.t("home.homeViewModel.ct7yh0"),
      tone: actionRequiredCount > 0 ? "warning" : "success",
    },
    {
      id: "chapter-ready",
      title: i18next.t("home.homeViewModel.gmk2nc"),
      value: readyForExecutionCount,
      hint: i18next.t("home.homeViewModel.60pz9i"),
      tone: readyForExecutionCount > 0 ? "success" : "neutral",
    },
    {
      id: "chapters",
      title: i18next.t("home.homeNextActionPanel.qblesr"),
      value: totalChapterCount,
      hint: i18next.t("home.homeViewModel.hogptl"),
      tone: totalChapterCount > 0 ? "info" : "neutral",
    },
  ];
}

export function buildHomeAttentionItems(input: {
  novels: HomeNovelItem[];
  taskOverview?: TaskOverviewSummary | null;
}): HomeAttentionItem[] {
  const actionRequiredCount = input.novels.filter((novel) => (
    isWorkflowActionRequired(getHomeNovelTask(novel))
  )).length;
  const readyForExecutionCount = input.novels.filter((novel) => (
    novel.narrativeForm === "short_story"
      ? getHomeNovelTask(novel)?.status === "succeeded"
      : canEnterChapterExecution(getHomeNovelTask(novel))
  )).length;
  const runningCount = input.taskOverview?.runningCount ?? 0;
  const waitingApprovalCount = input.taskOverview?.waitingApprovalCount ?? 0;
  const recoveryCandidateCount = input.taskOverview?.recoveryCandidateCount ?? 0;
  const failedTaskCount = input.taskOverview?.failedCount ?? 0;
  const items: HomeAttentionItem[] = [];

  if (failedTaskCount > 0 || recoveryCandidateCount > 0) {
    items.push({
      id: "task-recovery",
      title: failedTaskCount > 0 ? i18next.t("home.homeViewModel.xdqbqu", { val1: (failedTaskCount) }) : i18next.t("home.homeViewModel.iwmnqe", { val1: (recoveryCandidateCount) }),
      description: i18next.t("dict.gen_6b7dbd6f"),
      tone: failedTaskCount > 0 ? "danger" : "warning",
      to: "/tasks",
      actionLabel: i18next.t("dict.gen_9dd8c364"),
    });
  }
  if (actionRequiredCount > 0 || waitingApprovalCount > 0) {
    items.push({
      id: "workflow-action-required",
      title: i18next.t("home.homeViewModel.ajzsil", { val1: (Math.max(actionRequiredCount, waitingApprovalCount)) }),
      description: i18next.t("dict.gen_3f382d26"),
      tone: "warning",
      to: "/auto-director/follow-ups",
      actionLabel: i18next.t("dict.gen_cb22c7c1"),
    });
  }
  if (readyForExecutionCount > 0) {
    items.push({
      id: "chapter-ready",
      title: i18next.t("home.homeViewModel.pzq6cv", { val1: (readyForExecutionCount) }),
      description: i18next.t("dict.gen_4b9e5601"),
      tone: "success",
    });
  }
  if (runningCount > 0) {
    items.push({
      id: "running-tasks",
      title: i18next.t("home.homeViewModel.ivskwl", { val1: (runningCount) }),
      description: i18next.t("dict.gen_758ac9f9"),
      tone: "info",
      to: "/tasks",
      actionLabel: i18next.t("dict.gen_9600c918"),
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
      title: i18next.t("dict.gen_ccd81d16"),
      value: totalNovels > 0 ? `${worldBoundCount}/${totalNovels}` : "0",
      description: totalNovels > 0
        ? "绑定世界观的项目更容易在后续章节中保持规则一致。"
        : "创建小说后，这里会显示世界观资产状态。",
      tone: totalNovels === 0 ? "neutral" : worldBoundCount === totalNovels ? "success" : "warning",
    },
    {
      id: "characters",
      title: i18next.t("dict.gen_88afed0d"),
      value: String(totalCharacters),
      description: i18next.t("dict.gen_33399576"),
      tone: totalCharacters > 0 ? "success" : "warning",
    },
    {
      id: "chapters",
      title: i18next.t("dict.gen_6ee26458"),
      value: String(totalChapters),
      description: i18next.t("dict.gen_7d8e24a2"),
      tone: totalChapters > 0 ? "info" : "neutral",
    },
    {
      id: "readiness",
      title: i18next.t("dict.gen_31032ccf"),
      value: averageResourceScore == null ? "--" : `${averageResourceScore}`,
      description: i18next.t("dict.gen_ccc59df1"),
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
