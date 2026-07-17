import type {
  AutoDirectorAction,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpOverview,
  AutoDirectorFollowUpPriority,
  AutoDirectorFollowUpReason,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import type { WorkspaceTone } from "@/components/workspace";
import type { TaskQueueSeverity } from "@/components/taskQueue";

export function resolveFollowUpOverviewPresentation(
  overview: AutoDirectorFollowUpOverview | null,
): {
  criticalCount: number;
  pendingActionCount: number;
  progressCount: number;
  replanCount: number;
  recommendedSection: AutoDirectorFollowUpSection | "";
} {
  const needsValidationCount = overview?.countersBySection.needs_validation ?? 0;
  const manualRecoveryCount = overview?.countersByReason.manual_recovery_required ?? 0;
  const runtimeFailedCount = overview?.countersByReason.runtime_failed ?? 0;
  const blockingExceptionCount = manualRecoveryCount + runtimeFailedCount;
  const replanCount = overview?.countersByReason.replan_required ?? 0;
  const criticalCount = needsValidationCount + blockingExceptionCount + replanCount;
  const pendingCount = overview?.countersBySection.pending ?? 0;
  const pendingActionCount = Math.max(0, pendingCount - replanCount);
  const progressCount = overview?.countersBySection.auto_progress ?? 0;
  const recommendedSection: AutoDirectorFollowUpSection | "" = replanCount > 0
    ? "pending"
    : needsValidationCount > 0
      ? "needs_validation"
      : blockingExceptionCount > 0
        ? "exception"
        : pendingActionCount > 0
          ? "pending"
          : progressCount > 0
            ? "auto_progress"
            : "";
  return {
    criticalCount,
    pendingActionCount,
    progressCount,
    replanCount,
    recommendedSection,
  };
}

export function getFollowUpTone(item: Pick<
  AutoDirectorFollowUpItem,
  "section" | "reason" | "priority" | "itemType" | "pendingManualRecovery"
>): WorkspaceTone {
  if (item.reason === "quality_repair_pending") {
    return "warning";
  }
  if (
    item.pendingManualRecovery
    || item.reason === "manual_recovery_required"
    || item.reason === "runtime_failed"
    || item.reason === "replan_required"
    || item.reason === "validation_required"
  ) {
    return "danger";
  }
  if (item.reason === "runtime_cancelled" || item.reason === "runtime_replaced") {
    return "neutral";
  }
  if (item.reason === "auto_approval_completed") {
    return "success";
  }
  if (item.priority === "P0") {
    return "danger";
  }
  if (
    item.reason === "candidate_selection_required"
    || item.reason === "chapter_batch_execution_pending"
    || item.reason === "auto_progress_running"
  ) {
    return "info";
  }
  if (item.section === "auto_progress") {
    return item.itemType === "auto_approval_record" ? "success" : "info";
  }
  return item.section === "needs_validation" ? "danger" : "neutral";
}

export function getFollowUpLevelLabel(item: Pick<
  AutoDirectorFollowUpItem,
  "section" | "reason" | "priority" | "itemType" | "pendingManualRecovery"
>): string {
  const tone = getFollowUpTone(item);
  if (item.reason === "replan_required") return "需要重规划";
  if (item.pendingManualRecovery || item.reason === "manual_recovery_required") return "需要恢复";
  if (item.reason === "runtime_failed") return "任务失败";
  if (item.reason === "validation_required") return "需要校验";
  if (item.reason === "runtime_cancelled") return "已取消";
  if (item.reason === "runtime_replaced") return "已替代";
  if (tone === "danger") return "阻塞";
  if (item.reason === "quality_repair_pending") return "质量提醒";
  if (item.reason === "candidate_selection_required" || item.reason === "chapter_batch_execution_pending") return "待操作";
  if (tone === "info") return "自动推进";
  if (tone === "success") return "已自动通过";
  return "普通记录";
}

export function getFollowUpSeverity(item: Pick<
  AutoDirectorFollowUpItem,
  "section" | "reason" | "priority" | "itemType" | "pendingManualRecovery"
>): TaskQueueSeverity {
  const tone = getFollowUpTone(item);
  if (tone === "danger") return "blocking";
  if (item.reason === "quality_repair_pending") return "quality";
  return "normal";
}

export function getFollowUpPriorityLabel(
  priority: AutoDirectorFollowUpPriority,
  reason?: AutoDirectorFollowUpReason,
): string {
  if (reason === "replan_required") return "立即处理";
  if (reason === "runtime_cancelled") return "可按需恢复";
  if (reason === "runtime_replaced") return "历史记录";
  if (reason === "quality_repair_pending") return "可稍后处理";
  if (priority === "P0") return "立即处理";
  if (priority === "P1") return "尽快处理";
  return "可稍后处理";
}

export function getFollowUpActionConsequence(action: AutoDirectorAction): string {
  if (action.kind === "navigation") {
    return "只打开对应处理页面，不会改变当前导演任务状态。";
  }
  if (action.code === "continue_auto_execution") {
    return "向当前导演任务提交继续命令，并从现有检查点推进自动执行范围。";
  }
  if (action.code === "continue_generic") {
    return "向当前导演任务提交恢复命令，并从可恢复位置继续。";
  }
  if (action.code === "retry_with_task_model") {
    return "使用任务保存的模型重新入队，不会把其他工作区任务当作当前导演任务。";
  }
  if (action.code === "retry_with_route_model") {
    return "使用当前模型路由重新执行；该操作需要再次确认。";
  }
  if (action.code === "auto_backfill_structured_outline") {
    return "补齐校验确认缺失的拆章资产，再继续当前导演任务。";
  }
  return "只执行校验声明为低风险的状态修复，不替用户确认候选或重写正文。";
}

export function getFollowUpActionTone(action: AutoDirectorAction): WorkspaceTone {
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium" || action.requiresConfirm) return "warning";
  return action.kind === "mutation" ? "info" : "neutral";
}

export function getFollowUpActionRiskDescription(action: AutoDirectorAction): string {
  if (action.riskLevel === "high") {
    return "较高，执行前请核对影响范围。";
  }
  if (action.riskLevel === "medium" || action.requiresConfirm) {
    return "需要确认，提交前请核对任务和写入范围。";
  }
  return action.kind === "navigation"
    ? "低风险，只打开处理页面。"
    : "低风险，只执行当前任务声明的安全动作。";
}
