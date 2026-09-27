import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";
import type { DirectorTaskNotice } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
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

function buildNovelEditHref(novelId: string, options?: { stage?: string | null; taskPanel?: boolean }): string {
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

function cleanNovelPageHref(href: string): string {
  const url = new URL(href, "https://novel.local");
  if (url.origin !== "https://novel.local" || !/^\/novels\/[^/]+\/(edit|simple|story)$/.test(url.pathname)) {
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
    return buildNovelEditHref(projection.novelId, {
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
