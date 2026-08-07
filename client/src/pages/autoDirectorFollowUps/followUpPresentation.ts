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
>): string { const tone = getFollowUpTone(item); if (item.reason === "replan_required") return "Replanning required"; if (item.pendingManualRecovery || item.reason === "manual_recovery_required") return "Recovery required"; if (item.reason === "runtime_failed") return "Task failed"; if (item.reason === "validation_required") return "Validation required"; if (item.reason === "runtime_cancelled") return "Cancelled"; if (item.reason === "runtime_replaced") return "Replaced"; if (tone === "danger") return "Blocked"; if (item.reason === "quality_repair_pending") return "Quality reminder"; if (item.reason === "candidate_selection_required" || item.reason === "chapter_batch_execution_pending") return "Pending operation"; if (tone === "info") return "Automatic progress"; if (tone === "success") return "Automatically passed"; return "Normal record"; } export function getFollowUpSeverity(item: Pick<
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
  if (reason === "replan_required") return "Process immediately";
  if (reason === "runtime_cancelled") return "Can be restored on demand";
  if (reason === "runtime_replaced") return "History";
  if (reason === "quality_repair_pending") return "Can be processed later";
  if (priority === "P0") return "Process immediately";
  if (priority === "P1") return "Process as soon as possible";
  return "Can be processed later";
}

export function getFollowUpActionConsequence(action: AutoDirectorAction): string {
  if (action.kind === "navigation") {
    return "Only the corresponding processing page is opened and the current director task status will not be changed.";
  }
  if (action.code === "continue_auto_execution") {
    return "Submits a continue command to the current director task and advances the automatic execution scope from the existing checkpoint.";
  }
  if (action.code === "continue_generic") {
    return "Submits a resume command to the current director task and continues from a resumeable position.";
  }
  if (action.code === "retry_with_task_model") {
    return "Re-enqueue using the model saved by the task, and other workspace tasks will not be regarded as the current director task.";
  }
  if (action.code === "retry_with_route_model") {
    return "Re-execute using the current model routing; the operation requires confirmation again.";
  }
  if (action.code === "auto_backfill_structured_outline") {
    return "Complete the missing chapter assets verified by verification, and then continue the current director task.";
  }
  return "Only performs state repairs that are declared low-risk by the verification, without confirming candidates or rewriting the text for the user.";
}

export function getFollowUpActionTone(action: AutoDirectorAction): WorkspaceTone {
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium" || action.requiresConfirm) return "warning";
  return action.kind === "mutation" ? "info" : "neutral";
}

export function getFollowUpActionRiskDescription(action: AutoDirectorAction): string {
  if (action.riskLevel === "high") {
    return "Higher, please check the scope of impact before executing.";
  }
  if (action.riskLevel === "medium" || action.requiresConfirm) {
    return "Confirmation is required, please check the task and writing scope before submitting.";
  }
  return action.kind === "navigation"
    ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
    : "Low risk, only perform safe actions stated in the current mission.";
}
