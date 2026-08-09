import i18next from "i18next";
import type { DirectorCommandAcceptedResponse } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";

export function resolveWorkflowContinuationFeedback(
  task: UnifiedTaskDetail | DirectorCommandAcceptedResponse | null | undefined,
  options?: {
    mode?: DirectorContinuationMode;
    scopeLabel?: string | null;
  },
): {
  tone: "success" | "error";
  message: string;
} {
  const requestedScopeLabel = options?.scopeLabel?.trim();
  const taskScopeLabel = task && "executionScopeLabel" in task ? task.executionScopeLabel?.trim() : undefined;
  const scopeLabel = requestedScopeLabel || taskScopeLabel || i18next.t("gen.lib.novelWorkflowContinuation.gen_d7432bb5");

  if (task && "kind" in task && task.status === "failed") {
    return {
      tone: "error",
      message: task.failureSummary?.trim()
        || task.blockingReason?.trim()
        || task.lastError?.trim()
        || (options?.mode === "auto_execute_range"
          ? `继续自动执行${scopeLabel}失败。`
          : i18next.t("gen.lib.novelWorkflowContinuation.gen_bb8020bb")),
    };
  }

  return {
    tone: "success",
    message: options?.mode === "skip_quality_repair"
      ? `已跳过本次质量建议，自动导演会继续执行${scopeLabel}。`
      : options?.mode === "auto_execute_range"
        ? `已继续自动执行${scopeLabel}。`
        : i18next.t("gen.lib.novelWorkflowContinuation.gen_8c4efb64"),
  };
}

export function resolveDirectorContinueMode(task: Pick<
  UnifiedTaskDetail,
  "checkpointType" | "currentItemKey" | "currentStage" | "pendingManualRecovery"
> | null | undefined): DirectorContinuationMode {
  if (task?.pendingManualRecovery) {
    return "resume";
  }
  if (
    task?.checkpointType === "replan_required"
    || task?.currentItemKey === "quality_repair"
    || task?.currentStage?.includes(i18next.t("gen.lib.novelWorkflowContinuation.gen_3a7170b9"))
  ) {
    return "skip_quality_repair";
  }
  if (task?.checkpointType === "chapter_batch_ready") {
    return "auto_execute_range";
  }
  return "resume";
}
