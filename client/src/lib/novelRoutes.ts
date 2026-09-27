import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";
import type { DirectorTaskNotice } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { NovelWorkflowResumeTarget } from "@ai-novel/shared/types/novelWorkflow";
import { stripLegacyTaskUrlParams } from "./legacyTaskUrlParams.ts";

interface NovelWorkspaceLinkInput {
  id: string;
  narrativeForm?: string | null;
  creationExperience?: string | null;
}

export function getNovelWorkspaceHref(novel: NovelWorkspaceLinkInput): string {
  const root = `/novels/${encodeURIComponent(novel.id)}`;
  if (novel.narrativeForm === "short_story") {
    return `${root}/story`;
  }
  return novel.creationExperience === "simple" ? `${root}/simple` : `${root}/edit`;
}

export function readCandidateTaskId(searchParams: URLSearchParams): string | null {
  return searchParams.get("taskId");
}

export function buildCandidateTaskHref(taskId: string, otherParams?: URLSearchParams): string {
  const searchParams = new URLSearchParams(otherParams);
  searchParams.set("taskId", taskId);
  return `/novels/auto-director?${searchParams.toString()}`;
}

export function getCandidateTaskNovelHref(task: Pick<UnifiedTaskDetail, "resumeTarget" | "sourceResource" | "checkpointType"> | null | undefined): string | null {
  if (task?.checkpointType === "production_experience_required") {
    return null;
  }
  const novelId = task?.resumeTarget?.novelId?.trim()
    || (task?.sourceResource?.type === "novel" ? task.sourceResource.id.trim() : "");
  return novelId ? getNovelResumeTargetHref(novelId, task?.resumeTarget) : null;
}

function getNovelResumeTargetHref(novelId: string, target: NovelWorkflowResumeTarget | null | undefined): string {
  const root = `/novels/${encodeURIComponent(novelId)}`;
  if (target?.route === "/novels/:id/story") {
    return `${root}/story`;
  }
  const route = target?.route === "/novels/:id/simple" ? "simple" : "edit";
  const params = new URLSearchParams();
  if (target?.stage) {
    params.set("stage", target.stage);
  }
  if (target?.chapterId) {
    params.set("chapterId", target.chapterId);
  }
  if (target?.volumeId) {
    params.set("volumeId", target.volumeId);
  }
  const query = params.toString();
  return `${root}/${route}${query ? `?${query}` : ""}`;
}

export function getNovelEditHref(novelId: string, options?: { stage?: string | null; taskPanel?: boolean }): string {
  const params = new URLSearchParams();
  if (options?.stage) {
    params.set("stage", options.stage);
  }
  if (options?.taskPanel) {
    params.set("taskPanel", "1");
  }
  const query = params.toString();
  return `/novels/${encodeURIComponent(novelId)}/edit${query ? `?${query}` : ""}`;
}

export function getTaskSourceHref(href: string): string {
  return cleanNovelPageHref(href);
}

export function getTaskHistorySourceHref(task: Pick<UnifiedTaskDetail, "sourceRoute" | "sourceResource" | "resumeTarget">): string {
  const cleaned = getTaskSourceHref(task.sourceRoute);
  if (/^\/novels\/(auto-director|create)(?:\?|$)/.test(cleaned)) {
    return getCandidateTaskNovelHref(task) ?? cleaned;
  }
  return cleaned;
}

function cleanNovelPageHref(href: string): string {
  const url = new URL(href, "https://novel.local");
  if (url.origin !== "https://novel.local" || !/^\/novels\/[^/]+\/(edit|simple|story|chapters)(?:\/|$)/.test(url.pathname)) {
    return href;
  }
  const search = stripLegacyTaskUrlParams(url.searchParams).toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

export function getDirectorCockpitActionHref(
  projection: Pick<DirectorBookAutomationProjection, "novelId" | "focusNovel">,
  action: DirectorBookAutomationAction,
): string {
  if (action.target.href?.trim()) {
    return cleanNovelPageHref(action.target.href);
  }
  if (action.target.tab || action.type === "open_details") {
    return getNovelEditHref(projection.novelId, {
      stage: action.target.tab,
      taskPanel: action.type === "open_details",
    });
  }
  return cleanNovelPageHref(projection.focusNovel.href);
}

export function buildStructuredOutlineRoute(
  task: Pick<UnifiedTaskDetail, "id" | "sourceResource" | "resumeTarget">,
  volumeId?: string | null,
): string | null {
  const novelId = task.sourceResource?.type === "novel" ? task.sourceResource.id : null;
  if (!novelId) {
    return null;
  }
  const params = new URLSearchParams();
  params.set("stage", "structured");
  if (typeof volumeId === "string" && volumeId.trim()) {
    params.set("volumeId", volumeId.trim());
  }
  return `/novels/${encodeURIComponent(novelId)}/edit?${params.toString()}`;
}

export function buildTaskNoticeRoute(
  task: Pick<UnifiedTaskDetail, "id" | "sourceResource" | "resumeTarget">,
  notice: DirectorTaskNotice | null,
): string | null {
  if (!notice?.action || notice.action.type !== "open_structured_outline") {
    return null;
  }
  return buildStructuredOutlineRoute(task, notice.action.volumeId ?? task.resumeTarget?.volumeId ?? null);
}
