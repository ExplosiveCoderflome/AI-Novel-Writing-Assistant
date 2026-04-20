import type { DirectorTaskNotice } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";

type StructuredOutlineTaskLike = Pick<
  UnifiedTaskDetail,
  "id" | "sourceResource" | "resumeTarget" | "failureSummary" | "meta"
>;

export function parseDirectorTaskNotice(meta: Record<string, unknown> | null | undefined): DirectorTaskNotice | null {
  const raw = meta && typeof meta === "object" ? (meta as { taskNotice?: unknown }).taskNotice : null;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const notice = raw as DirectorTaskNotice;
  if (typeof notice.code !== "string" || !notice.code.trim()) {
    return null;
  }
  if (typeof notice.summary !== "string" || !notice.summary.trim()) {
    return null;
  }
  return {
    code: notice.code.trim(),
    summary: notice.summary.trim(),
    action: notice.action && typeof notice.action === "object"
      ? {
        type: notice.action.type === "open_structured_outline" ? "open_structured_outline" : "open_structured_outline",
        label: typeof notice.action.label === "string" && notice.action.label.trim()
          ? notice.action.label.trim()
          : "快速修复章节标题",
        volumeId: typeof notice.action.volumeId === "string" && notice.action.volumeId.trim()
          ? notice.action.volumeId.trim()
          : null,
      }
      : null,
  };
}

export function isChapterTitleDiversitySummary(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }
  return normalized.includes("章节标题结构过于集中")
    || normalized.includes("相邻章节标题结构过于重复")
    || normalized.includes("章节标题出现重复");
}

export function buildStructuredOutlineRoute(
  task: Pick<UnifiedTaskDetail, "id" | "sourceResource" | "resumeTarget">,
  volumeId?: string | null,
): string | null {
  const novelId = task.sourceResource?.type === "novel"
    ? task.sourceResource.id
    : null;
  if (!novelId) {
    return null;
  }
  const search = new URLSearchParams();
  search.set("stage", "structured");
  search.set("taskId", task.id);
  if (typeof volumeId === "string" && volumeId.trim()) {
    search.set("volumeId", volumeId.trim());
  }
  return `/novels/${novelId}/edit?${search.toString()}`;
}

export function buildTaskNoticeRoute(
  task: Pick<UnifiedTaskDetail, "id" | "sourceResource" | "resumeTarget">,
  notice: DirectorTaskNotice | null,
): string | null {
  if (!notice?.action || notice.action.type !== "open_structured_outline") {
    return null;
  }
  return buildStructuredOutlineRoute(
    task,
    notice.action.volumeId ?? task.resumeTarget?.volumeId ?? null,
  );
}

export function resolveChapterTitleWarning(task: StructuredOutlineTaskLike | null | undefined): {
  summary: string;
  route: string | null;
  label: string;
  volumeId: string | null;
} | null {
  if (!task) {
    return null;
  }
  const seedResumeTarget = task.meta && typeof task.meta === "object"
    ? (task.meta as { seedPayload?: { resumeTarget?: { volumeId?: string | null } | null } | null }).seedPayload?.resumeTarget
    : null;
  const taskNotice = parseDirectorTaskNotice(task.meta);
  if (taskNotice && isChapterTitleDiversitySummary(taskNotice.summary)) {
    return {
      summary: taskNotice.summary,
      route: buildTaskNoticeRoute(task, taskNotice),
      label: taskNotice.action?.label ?? "快速修复章节标题",
      volumeId: taskNotice.action?.volumeId ?? task.resumeTarget?.volumeId ?? seedResumeTarget?.volumeId ?? null,
    };
  }
  if (!isChapterTitleDiversitySummary(task.failureSummary)) {
    return null;
  }
  return {
    summary: task.failureSummary?.trim() ?? "",
    route: buildStructuredOutlineRoute(task, task.resumeTarget?.volumeId ?? seedResumeTarget?.volumeId ?? null),
    label: "快速修复章节标题",
    volumeId: task.resumeTarget?.volumeId ?? seedResumeTarget?.volumeId ?? null,
  };
}
