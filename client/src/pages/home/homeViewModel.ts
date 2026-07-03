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
    return "暂无";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
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
  return "当前项目暂无简介，可以进入编辑页继续推进。";
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
      eyebrow: "开始第一本小说",
      title: "用一句灵感启动自动导演",
      description: "先给 AI 一个模糊想法，系统会帮你整理方向、角色、世界观和章节准备。",
      reason: "适合还没想清楚题材、卖点和前期承诺的新手。",
      tone: "info",
    };
  }

  const task = primaryNovel.latestAutoDirectorTask ?? null;
  if (canContinueChapterBatchAutoExecution(task)) {
    return {
      kind: "novel",
      eyebrow: "推荐下一步",
      title: `恢复《${primaryNovel.title}》的章节执行`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "章节批次停在可恢复节点，先恢复执行能最快回到正文生产。",
      tone: "danger",
    };
  }
  if (requiresCandidateSelection(task)) {
    return {
      kind: "novel",
      eyebrow: "推荐下一步",
      title: `确认《${primaryNovel.title}》的书级方向`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "确认方向后，系统才能继续准备世界观、角色和章节执行计划。",
      tone: "warning",
    };
  }
  if (canContinueDirector(task)) {
    return {
      kind: "novel",
      eyebrow: "推荐下一步",
      title: `继续《${primaryNovel.title}》的自动导演`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "当前阶段等待确认，继续后会推进到下一段可执行准备。",
      tone: "warning",
    };
  }
  if (task?.status === "running" || task?.status === "queued") {
    return {
      kind: "novel",
      eyebrow: "系统推进中",
      title: `关注《${primaryNovel.title}》的后台进度`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "自动导演或章节执行仍在后台处理，可以查看进度和最近阶段。",
      tone: "info",
    };
  }
  if (canEnterChapterExecution(task)) {
    return {
      kind: "novel",
      eyebrow: "推荐下一步",
      title: `进入《${primaryNovel.title}》的章节执行`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "规划资产已经能支撑章节生产，可以进入正文生成和审阅。",
      tone: "success",
    };
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return {
      kind: "novel",
      eyebrow: "需要处理",
      title: `查看《${primaryNovel.title}》的推进状态`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "任务存在暂停或失败记录，先查看详情再决定恢复、重试或调整。",
      tone: "danger",
    };
  }
  return {
    kind: "novel",
    eyebrow: "推荐下一步",
    title: `继续编辑《${primaryNovel.title}》`,
    description: getNovelLeadSummary(primaryNovel),
    reason: "没有更高优先级的阻塞项，可以回到项目主页继续完善资料或章节。",
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
      title: "推进中",
      value: liveWorkflowCount,
      hint: "最近项目中后台处理的自动导演或章节执行。",
      tone: "info",
    },
    {
      id: "attention",
      title: "待处理",
      value: actionRequiredCount,
      hint: "等待确认、暂停或失败后需要决策的项目。",
      tone: actionRequiredCount > 0 ? "warning" : "success",
    },
    {
      id: "chapter-ready",
      title: "可写章节",
      value: readyForExecutionCount,
      hint: "规划准备完成，可以进入章节执行的项目。",
      tone: readyForExecutionCount > 0 ? "success" : "neutral",
    },
    {
      id: "failed",
      title: "失败任务",
      value: failedTaskCount,
      hint: "来自任务中心的失败任务，需要集中处理。",
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
      description: "先处理失败或可恢复任务，可以避免后续生成继续卡在同一位置。",
      tone: failedTaskCount > 0 ? "danger" : "warning",
      to: "/tasks",
      actionLabel: "查看任务中心",
    });
  }
  if (actionRequiredCount > 0 || waitingApprovalCount > 0) {
    items.push({
      id: "workflow-action-required",
      title: `${Math.max(actionRequiredCount, waitingApprovalCount)} 个创作流程等待处理`,
      description: "这些项目可能在等待方向确认、阶段继续或失败后的恢复决策。",
      tone: "warning",
      to: "/auto-director/follow-ups",
      actionLabel: "查看跟进事项",
    });
  }
  if (readyForExecutionCount > 0) {
    items.push({
      id: "chapter-ready",
      title: `${readyForExecutionCount} 个项目可进入章节执行`,
      description: "这些项目的规划资产已经能支撑正文生产，可以继续推进章节。",
      tone: "success",
    });
  }
  if (runningCount > 0) {
    items.push({
      id: "running-tasks",
      title: `${runningCount} 个任务处理中`,
      description: "后台任务仍在推进，可以稍后回到首页查看结果。",
      tone: "info",
      to: "/tasks",
      actionLabel: "查看进度",
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
      title: "世界观覆盖",
      value: totalNovels > 0 ? `${worldBoundCount}/${totalNovels}` : "0",
      description: totalNovels > 0
        ? "绑定世界观的项目更容易在后续章节中保持规则一致。"
        : "创建小说后，这里会显示世界观资产状态。",
      tone: totalNovels === 0 ? "neutral" : worldBoundCount === totalNovels ? "success" : "warning",
    },
    {
      id: "characters",
      title: "角色资产",
      value: String(totalCharacters),
      description: "角色数量用于判断项目是否具备连续生成的基本资产。",
      tone: totalCharacters > 0 ? "success" : "warning",
    },
    {
      id: "chapters",
      title: "章节沉淀",
      value: String(totalChapters),
      description: "章节越多，摘要、事实和角色时间线越需要稳定回灌。",
      tone: totalChapters > 0 ? "info" : "neutral",
    },
    {
      id: "readiness",
      title: "资源准备度",
      value: averageResourceScore == null ? "--" : `${averageResourceScore}`,
      description: "来自项目资料准备度的平均信号，用于辅助判断开写基础。",
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
