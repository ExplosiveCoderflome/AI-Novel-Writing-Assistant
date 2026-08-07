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
    return "None yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "None yet";
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
  return "The current project does not have an introduction. You can enter the editing page to continue progressing.";
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
      eyebrow: "Start your first novel",
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      description: "Give the AI ​​a vague idea first, and the system will help you sort out the direction, characters, worldview, and chapter preparation.",
      reason: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      tone: "info",
    };
  }

  const task = primaryNovel.latestAutoDirectorTask ?? null;
  if (canContinueChapterBatchAutoExecution(task)) {
    return {
      kind: "novel",
      eyebrow: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      title: `恢复《${primaryNovel.title}》的章节执行`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "The chapter batch stops at the resumable node. Resuming execution first can return to text production as quickly as possible.",
      tone: "danger",
    };
  }
  if (requiresCandidateSelection(task)) {
    return {
      kind: "novel",
      eyebrow: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      title: `确认《${primaryNovel.title}》的书级方向`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "After confirming the direction, the system can continue to prepare the world view, characters and chapter execution plan.",
      tone: "warning",
    };
  }
  if (canContinueDirector(task)) {
    return {
      kind: "novel",
      eyebrow: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      title: `继续《${primaryNovel.title}》的自动导演`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "The current stage is waiting for confirmation. After continuing, it will advance to the next stage of executable preparation.",
      tone: "warning",
    };
  }
  if (task?.status === "running" || task?.status === "queued") {
    return {
      kind: "novel",
      eyebrow: "The system is in progress",
      title: `关注《${primaryNovel.title}》的后台进度`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "Automatic director or chapter execution is still being processed in the background and progress and recent stages can be viewed.",
      tone: "info",
    };
  }
  if (canEnterChapterExecution(task)) {
    return {
      kind: "novel",
      eyebrow: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      title: `进入《${primaryNovel.title}》的章节执行`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "The planning assets can already support the production of chapters and can enter the text generation and review.",
      tone: "success",
    };
  }
  if (task?.status === "failed" || task?.status === "cancelled") {
    return {
      kind: "novel",
      eyebrow: "Need to be processed",
      title: `查看《${primaryNovel.title}》的推进状态`,
      description: getNovelLeadSummary(primaryNovel),
      reason: "There is a record of suspension or failure of the task. Check the details before deciding to resume, retry or adjust.",
      tone: "danger",
    };
  }
  return {
    kind: "novel",
    eyebrow: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    title: `继续编辑《${primaryNovel.title}》`,
    description: getNovelLeadSummary(primaryNovel),
    reason: "If there are no blocking items with higher priority, you can return to the project homepage to continue improving the materials or chapters.",
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
      title: "Advancing",
      value: liveWorkflowCount,
      hint: "Automatic director or chapter execution of background processing in recent projects.",
      tone: "info",
    },
    {
      id: "attention",
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      value: actionRequiredCount,
      hint: "Projects that require decision-making after pending confirmation, suspension, or failure.",
      tone: actionRequiredCount > 0 ? "warning" : "success",
    },
    {
      id: "chapter-ready",
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      value: readyForExecutionCount,
      hint: "After the planning preparation is completed, you can enter the chapter execution project.",
      tone: readyForExecutionCount > 0 ? "success" : "neutral",
    },
    {
      id: "failed",
      title: "failed task",
      value: failedTaskCount,
      hint: "Failed tasks from the task center need to be processed centrally.",
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
      description: "Handling failed or recoverable tasks first will prevent subsequent builds from getting stuck in the same location.",
      tone: failedTaskCount > 0 ? "danger" : "warning",
      to: "/tasks",
      actionLabel: "View task center",
    });
  }
  if (actionRequiredCount > 0 || waitingApprovalCount > 0) {
    items.push({
      id: "workflow-action-required",
      title: `${Math.max(actionRequiredCount, waitingApprovalCount)} 个创作流程等待处理`,
      description: "These projects may be awaiting direction confirmation, phase continuation, or recovery decisions after failure.",
      tone: "warning",
      to: "/auto-director/follow-ups",
      actionLabel: "View follow-up matters",
    });
  }
  if (readyForExecutionCount > 0) {
    items.push({
      id: "chapter-ready",
      title: `${readyForExecutionCount} 个项目可进入章节执行`,
      description: "The planned assets of these projects have been able to support the production of the main text and can continue to advance the chapters.",
      tone: "success",
    });
  }
  if (runningCount > 0) {
    items.push({
      id: "running-tasks",
      title: `${runningCount} 个任务处理中`,
      description: "The background task is still progressing, you can return to the home page later to view the results.",
      tone: "info",
      to: "/tasks",
      actionLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
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
      title: "World view coverage",
      value: totalNovels > 0 ? `${worldBoundCount}/${totalNovels}` : "0", description: totalNovels > 0 ? "Projects bound to a worldview are more likely to maintain consistent rules in subsequent chapters." : "After creating a novel, the worldview asset status will be displayed here.", tone: totalNovels === 0 ? "neutral" : worldBoundCount === totalNovels ? "success" : "warning", }, { id: "characters", title: "Character Assets", value: String(totalCharacters), description: "The number of characters is used to determine whether a project has the basic assets for continuous generation.", tone: totalCharacters > 0 ? "success" : "warning", }, { id: "chapters", title: "Chapter Accumulation", value: String(totalChapters), description: "The more chapters there are, the more stable the re-injection of summaries, facts, and character timelines is required.", tone: totalChapters > 0 ? "info" : "neutral", }, { id: "readiness", title: "Resource Readiness", value: averageResourceScore == null ? "--" : `${averageResourceScore}`,
      description: "The average signal from the readiness of project data is used to assist in judging the basis for opening and writing.",
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
