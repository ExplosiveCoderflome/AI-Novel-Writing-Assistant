import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";

export function resolveWorkflowContinuationFeedback(
  task: UnifiedTaskDetail | null | undefined,
  options?: {
    mode?: "auto_execute_range";
    scopeLabel?: string | null;
  },
): {
  tone: "success" | "error";
  message: string;
} {
  const requestedScopeLabel = options?.scopeLabel?.trim();
  const taskScopeLabel = task?.executionScopeLabel?.trim();
  const scopeLabel = requestedScopeLabel || taskScopeLabel || "当前章节范围";

  if (task?.status === "failed") {
    return {
      tone: "error",
      message: task.failureSummary?.trim()
        || task.blockingReason?.trim()
        || task.lastError?.trim()
        || (options?.mode === "auto_execute_range"
          ? `继续自动执行${scopeLabel}失败。`
          : "继续自动导演失败。"),
    };
  }

  return {
    tone: "success",
    message: options?.mode === "auto_execute_range"
      ? `已继续自动执行${scopeLabel}。`
      : "自动导演已继续推进。",
  };
}
