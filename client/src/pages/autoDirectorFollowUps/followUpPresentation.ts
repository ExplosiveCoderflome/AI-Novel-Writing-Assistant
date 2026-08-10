import i18next from "i18next";
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
  if (item.reason === "replan_required") return i18next.t("autoDirector.levelReplanRequired", "需要重规划");
  if (item.pendingManualRecovery || item.reason === "manual_recovery_required") return i18next.t("autoDirector.levelRecoveryRequired", "需要恢复");
  if (item.reason === "runtime_failed") return i18next.t("autoDirector.levelFailed", "任务失败");
  if (item.reason === "validation_required") return i18next.t("autoDirector.levelNeedsValidation", "需要校验");
  if (item.reason === "runtime_cancelled") return i18next.t("autoDirector.levelCancelled", "已取消");
  if (item.reason === "runtime_replaced") return i18next.t("autoDirector.levelReplaced", "已替代");
  if (tone === "danger") return i18next.t("autoDirector.levelBlocking", "阻塞");
  if (item.reason === "quality_repair_pending") return i18next.t("autoDirector.levelQuality", "质量提醒");
  if (item.reason === "candidate_selection_required" || item.reason === "chapter_batch_execution_pending") return i18next.t("tasks.levelPendingAction", "待操作");
  if (tone === "info") return i18next.t("autoDirector.secAutoProgress", "自动推进");
  if (tone === "success") return i18next.t("autoDirector.autoPassed", "已自动通过");
  return i18next.t("autoDirector.normalRecord", "普通记录");
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
  if (reason === "replan_required") return i18next.t("autoDirectorFollowUps.followUpPresentation.fu7tl6");
  if (reason === "runtime_cancelled") return i18next.t("autoDirectorFollowUps.followUpPresentation.duve4v");
  if (reason === "runtime_replaced") return i18next.t("autoDirectorFollowUps.followUpPresentation.aw7utt");
  if (reason === "quality_repair_pending") return i18next.t("autoDirectorFollowUps.followUpPresentation.b87b8u");
  if (priority === "P0") return i18next.t("autoDirectorFollowUps.followUpPresentation.fu7tl6");
  if (priority === "P1") return i18next.t("autoDirectorFollowUps.followUpPresentation.c1b13k");
  return i18next.t("autoDirectorFollowUps.followUpPresentation.b87b8u");
}

export function getFollowUpActionConsequence(action: AutoDirectorAction): string {
  if (action.kind === "navigation") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.criijs");
  }
  if (action.code === "continue_auto_execution") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.2m02ca");
  }
  if (action.code === "continue_generic") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.xcvlcm");
  }
  if (action.code === "retry_with_task_model") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.wh879y");
  }
  if (action.code === "retry_with_route_model") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.eanxix");
  }
  if (action.code === "auto_backfill_structured_outline") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.h4i0px");
  }
  return i18next.t("autoDirectorFollowUps.followUpPresentation.gzxdl4");
}

export function getFollowUpActionTone(action: AutoDirectorAction): WorkspaceTone {
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium" || action.requiresConfirm) return "warning";
  return action.kind === "mutation" ? "info" : "neutral";
}

export function getFollowUpActionRiskDescription(action: AutoDirectorAction): string {
  if (action.riskLevel === "high") {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.lsfir2");
  }
  if (action.riskLevel === "medium" || action.requiresConfirm) {
    return i18next.t("autoDirectorFollowUps.followUpPresentation.pdghjh");
  }
  return action.kind === "navigation"
    ? "低风险，只打开处理页面。"
    : "低风险，只执行当前任务声明的安全动作。";
}
