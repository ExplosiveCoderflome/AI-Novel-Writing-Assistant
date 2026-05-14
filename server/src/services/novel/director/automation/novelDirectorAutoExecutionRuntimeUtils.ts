import type { DirectorAutoExecutionState } from "@ai-novel/shared/types/novelDirector";
import type { DirectorAutoExecutionRange } from "./novelDirectorAutoExecution";

export function isNoChaptersToGenerateError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("指定区间内没有可生成的章节");
}

export function shouldClearAutoExecutionCheckpoint(
  checkpointType?: "chapter_batch_ready" | "replan_required" | null,
): boolean {
  return checkpointType === "chapter_batch_ready" || checkpointType === "replan_required";
}

function resolveNextChapterExecutionOrder(
  range: DirectorAutoExecutionRange,
  autoExecution: DirectorAutoExecutionState,
): number {
  const nextOrder = autoExecution.nextChapterOrder ?? range.startOrder;
  return Math.max(range.startOrder, Math.min(nextOrder, range.endOrder));
}

export function resolveSingleChapterExecutionRange(
  range: DirectorAutoExecutionRange,
  autoExecution: DirectorAutoExecutionState,
): { startOrder: number; endOrder: number } {
  const order = resolveNextChapterExecutionOrder(range, autoExecution);
  return { startOrder: order, endOrder: order };
}
