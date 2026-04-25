import type { NovelWorkflowResumeTarget } from "@ai-novel/shared/types/novelWorkflow";
import { AppError } from "../../../middleware/errorHandler";
import { parseResumeTarget } from "../workflow/novelWorkflow.shared";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";

export const AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT = 1;

export type HighMemoryDirectorDecisionReason =
  | "duplicate_active_high_memory_task"
  | "batch_high_memory_limit_reached";

export interface ActiveDirectorTaskSnapshot {
  id: string;
  novelId?: string | null;
  status?: string | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
  resumeTarget?: Pick<NovelWorkflowResumeTarget, "stage" | "volumeId" | "chapterId"> | null;
}

export interface HighMemoryDirectorStartDecision {
  allowed: boolean;
  reason?: HighMemoryDirectorDecisionReason;
  conflictingTaskId?: string;
}

export type HighMemoryDirectorStartInput = {
  taskId: string;
  novelId: string;
  stage: "structured_outline";
  itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
  volumeId?: string | null;
  chapterId?: string | null;
  scope?: string | null;
  batchAlreadyStartedCount?: number;
};

type WorkflowTaskRow = Awaited<ReturnType<NovelWorkflowService["listActiveTasksByNovelAndLane"]>>[number];

const backgroundStartedAtByTaskId = new Map<string, number>();
const backgroundStartedByNovelScope = new Map<string, { taskId: string; startedAt: number }>();

export function normalizeDirectorMemoryScope(input: {
  volumeId?: string | null;
  chapterId?: string | null;
  fallback?: string | null;
}): string {
  const fallback = input.fallback?.trim();
  if (fallback === "book") {
    return "book";
  }
  if (input.chapterId?.trim()) {
    return `chapter:${input.chapterId.trim()}`;
  }
  if (input.volumeId?.trim()) {
    return `volume:${input.volumeId.trim()}`;
  }
  return fallback || "book";
}

function listActiveDirectorTaskSnapshots(rows: WorkflowTaskRow[]): ActiveDirectorTaskSnapshot[] {
  return rows.map((row) => ({
    id: row.id,
    novelId: row.novelId,
    status: row.status,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    resumeTarget: parseResumeTarget(row.resumeTargetJson),
  }));
}

function resolveRecentlyStartedTaskId(input: {
  novelId: string;
  scope: string;
  excludeTaskId?: string | null;
}): string | null {
  const now = Date.now();
  const recentWindowMs = 30_000;
  for (const [taskId, startedAt] of backgroundStartedAtByTaskId.entries()) {
    if (now - startedAt > recentWindowMs) {
      backgroundStartedAtByTaskId.delete(taskId);
    }
  }
  for (const [key, value] of backgroundStartedByNovelScope.entries()) {
    if (now - value.startedAt > recentWindowMs) {
      backgroundStartedByNovelScope.delete(key);
    }
  }
  const recent = backgroundStartedByNovelScope.get(`${input.novelId}:${input.scope}`);
  if (!recent || now - recent.startedAt > recentWindowMs || recent.taskId === input.excludeTaskId) {
    return null;
  }
  return recent.taskId || "recent";
}

function markHighMemoryBackgroundStarted(input: {
  taskId: string;
  novelId: string;
  scope: string;
}): void {
  const now = Date.now();
  backgroundStartedAtByTaskId.set(input.taskId, now);
  backgroundStartedByNovelScope.set(`${input.novelId}:${input.scope}`, {
    taskId: input.taskId,
    startedAt: now,
  });
}

function normalizeScope(value: string | null | undefined): string | null {
  const scope = value?.trim();
  return scope ? scope : null;
}

function normalizeTaskScope(task: ActiveDirectorTaskSnapshot): string | null {
  const resumeTarget = task.resumeTarget;
  if (task.currentItemKey === "chapter_list" || task.currentItemKey === "chapter_detail_bundle") {
    if (resumeTarget?.volumeId?.trim()) {
      return `volume:${resumeTarget.volumeId.trim()}`;
    }
    if (resumeTarget?.chapterId?.trim()) {
      return `chapter:${resumeTarget.chapterId.trim()}`;
    }
  }
  if (resumeTarget?.chapterId?.trim()) {
    return `chapter:${resumeTarget.chapterId.trim()}`;
  }
  if (resumeTarget?.volumeId?.trim()) {
    return `volume:${resumeTarget.volumeId.trim()}`;
  }
  return null;
}

export function isHighMemoryDirectorStage(
  stage?: string | null,
  itemKey?: string | null,
): boolean {
  const normalizedStage = stage?.trim();
  const normalizedItemKey = itemKey?.trim();
  return normalizedStage === "structured_outline"
    || normalizedItemKey === "beat_sheet"
    || normalizedItemKey === "chapter_list"
    || normalizedItemKey === "chapter_detail_bundle"
    || normalizedItemKey === "chapter_sync";
}

function scopesOverlap(requestedScope: string | null, taskScope: string | null): boolean {
  if (!requestedScope || !taskScope) {
    return true;
  }
  if (requestedScope === "book" || taskScope === "book") {
    return true;
  }
  return requestedScope === taskScope;
}

export function resolveHighMemoryDirectorStartDecision(input: {
  novelId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  scope?: string | null;
  activeTasks: ActiveDirectorTaskSnapshot[];
  currentTaskId?: string | null;
  batchAlreadyStartedCount?: number;
}): HighMemoryDirectorStartDecision {
  if (!isHighMemoryDirectorStage(input.stage, input.itemKey)) {
    return { allowed: true };
  }
  if ((input.batchAlreadyStartedCount ?? 0) >= AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT) {
    return {
      allowed: false,
      reason: "batch_high_memory_limit_reached",
    };
  }

  const requestedNovelId = input.novelId?.trim() || null;
  const requestedScope = normalizeScope(input.scope);
  const currentTaskId = input.currentTaskId?.trim() || null;
  const conflictingTask = input.activeTasks.find((task) => {
    if (currentTaskId && task.id === currentTaskId) {
      return false;
    }
    if (task.status !== "queued" && task.status !== "running") {
      return false;
    }
    if (requestedNovelId && task.novelId?.trim() && task.novelId.trim() !== requestedNovelId) {
      return false;
    }
    if (!isHighMemoryDirectorStage(task.resumeTarget?.stage === "structured" ? "structured_outline" : null, task.currentItemKey)) {
      return false;
    }
    return scopesOverlap(requestedScope, normalizeTaskScope(task));
  });
  if (conflictingTask) {
    return {
      allowed: false,
      reason: "duplicate_active_high_memory_task",
      conflictingTaskId: conflictingTask.id,
    };
  }

  return { allowed: true };
}

export async function assertHighMemoryDirectorStartAllowed(
  workflowService: Pick<NovelWorkflowService, "listActiveTasksByNovelAndLane">,
  input: HighMemoryDirectorStartInput,
): Promise<void> {
  const scope = normalizeDirectorMemoryScope({
    volumeId: input.volumeId,
    chapterId: input.chapterId,
    fallback: input.scope,
  });
  const rows = await workflowService.listActiveTasksByNovelAndLane(input.novelId, "auto_director");
  const recentTaskId = resolveRecentlyStartedTaskId({
    novelId: input.novelId,
    scope,
    excludeTaskId: input.taskId,
  });
  const decision = resolveHighMemoryDirectorStartDecision({
    novelId: input.novelId,
    stage: input.stage,
    itemKey: input.itemKey,
    scope,
    activeTasks: listActiveDirectorTaskSnapshots(rows),
    currentTaskId: input.taskId,
    batchAlreadyStartedCount: input.batchAlreadyStartedCount,
  });
  if (!decision.allowed || recentTaskId) {
    const conflictingTaskId = decision.conflictingTaskId ?? recentTaskId ?? null;
    throw new AppError(
      conflictingTaskId
        ? `已有自动导演任务正在处理同一范围，请先查看任务 ${conflictingTaskId} 的进度。`
        : "当前批量操作已启动一个高内存自动导演任务，其余任务请稍后继续。",
      409,
    );
  }
  markHighMemoryBackgroundStarted({
    taskId: input.taskId,
    novelId: input.novelId,
    scope,
  });
}
