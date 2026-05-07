import { AppError } from "../../middleware/errorHandler";
import { runWithLlmUsageTracking } from "../../llm/usageTracking";
import {
  buildLlmDiagnosticFailureAppendix,
  findLatestLlmInvocationDiagnosticForTask,
} from "../../llm/invocationDiagnostics";
import type { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import {
  assertHighMemoryDirectorStartAllowed as assertHighMemoryDirectorStartAllowedImpl,
  releaseHighMemoryDirectorReservations,
} from "./autoMemorySafety";
import { directorExecutionLogger } from "./executionLogger";
import type { DirectorProgressItemKey } from "./progress";

export interface DirectorRuntimeDeps {
  workflowService: NovelWorkflowService;
}

export function isWorkflowTaskCancelledError(error: unknown): boolean {
  return error instanceof AppError
    && error.statusCode === 409
    && error.message === "WORKFLOW_TASK_CANCELLED";
}

export function stringifyDirectorTaskError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function markTaskFailedWithLatestDiagnostic(
  deps: DirectorRuntimeDeps,
  taskId: string,
  message: string,
): Promise<void> {
  const latestDiagnostic = await findLatestLlmInvocationDiagnosticForTask(taskId);
  const diagnosticAppendix = buildLlmDiagnosticFailureAppendix(latestDiagnostic);
  await deps.workflowService.markTaskFailed(
    taskId,
    diagnosticAppendix && !message.includes(latestDiagnostic?.id ?? "")
      ? `${message}\n${diagnosticAppendix}`
      : message,
  );
  directorExecutionLogger.error(taskId, "task_failed", `任务失败：${message}`).catch(() => {});
}

export function scheduleDirectorBackgroundRun(
  deps: DirectorRuntimeDeps,
  taskId: string,
  runner: () => Promise<void>,
): void {
  void Promise.resolve()
    .then(() => runWithLlmUsageTracking({ workflowTaskId: taskId }, runner))
    .catch(async (error) => {
      if (isWorkflowTaskCancelledError(error)) {
        return;
      }
      await markTaskFailedWithLatestDiagnostic(
        deps,
        taskId,
        stringifyDirectorTaskError(error, "自动导演后台任务执行失败。"),
      );
    })
    .finally(async () => {
      await releaseHighMemoryDirectorReservations(taskId);
    });
}

export function withWorkflowTaskUsage<T>(
  workflowTaskId: string | null | undefined,
  runner: () => Promise<T>,
): Promise<T> {
  if (!workflowTaskId?.trim()) {
    return runner();
  }
  return runWithLlmUsageTracking({ workflowTaskId: workflowTaskId.trim() }, runner);
}

export async function markDirectorTaskRunning(
  deps: DirectorRuntimeDeps,
  taskId: string,
  stage: "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
  itemKey: DirectorProgressItemKey,
  itemLabel: string,
  progress: number,
  options?: {
    chapterId?: string | null;
    volumeId?: string | null;
  },
): Promise<void> {
  await deps.workflowService.markTaskRunning(taskId, {
    stage,
    itemKey,
    itemLabel,
    progress,
    chapterId: options?.chapterId,
    volumeId: options?.volumeId,
  });
  directorExecutionLogger.info(taskId, stage, itemLabel).catch(() => {});
}

export async function assertHighMemoryDirectorStartAllowed(
  deps: DirectorRuntimeDeps,
  input: {
    taskId: string;
    novelId: string;
    stage: "structured_outline";
    itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    volumeId?: string | null;
    chapterId?: string | null;
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  },
): Promise<void> {
  await assertHighMemoryDirectorStartAllowedImpl(deps.workflowService, input);
}
