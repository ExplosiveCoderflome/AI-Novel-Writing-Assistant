import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";

export function normalizeFailureSummary(summary?: string | null, fallback = "当前没有明确失败记录。"): string {
  return summary?.trim() || fallback;
}

export function buildTaskRecoveryHint(kind: TaskKind, status: TaskStatus): string {
  if (status === "failed") {
    if (kind === "agent_run") {
      return "建议查看最后失败步骤、相关审批状态和对应资源上下文后再重试。";
    }
    if (kind === "novel_pipeline") {
      return "建议检查模型配置、章节上下文和最近一次生成日志后再重试。";
    }
    if (kind === "book_analysis") {
      return "建议检查原始文档质量、模型可用性和拆书分段结果后再重试。";
    }
    return "建议检查提示词、模型配置和目标资源状态后再重试。";
  }
  if (status === "waiting_approval") {
    return "当前任务在等待审批，先处理审批后才能继续执行。";
  }
  if (status === "running") {
    return "当前任务仍在执行中，建议先等待完成或查看实时轨迹。";
  }
  if (status === "queued") {
    return "当前任务仍在排队，建议确认工作线程和模型服务是否可用。";
  }
  if (status === "cancelled") {
    return "当前任务已取消，如仍需继续，可重新发起或执行重试。";
  }
  return "当前无需恢复操作。";
}
