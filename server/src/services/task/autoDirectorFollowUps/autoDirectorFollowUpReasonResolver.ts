import type {
  AutoDirectorAction,
  AutoDirectorActionCode,
  AutoDirectorFollowUpReason,
  AutoDirectorFollowUpResolverInput,
  AutoDirectorMutationActionCode,
  AutoDirectorResolvedFollowUpReason,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { buildWorkflowResumeAction } from "../novelWorkflowExplainability";

const REASON_LABELS: Record<AutoDirectorFollowUpReason, string> = {
  manual_recovery_required: "人工恢复待处理",
  runtime_failed: "失败待重试",
  candidate_selection_required: "待确认书级方向",
  replan_required: "待处理重规划",
  runtime_cancelled: "已取消待恢复",
  front10_execution_pending: "自动执行待继续",
  quality_repair_pending: "质量修复待继续",
};

function mutationAction(input: {
  code: AutoDirectorMutationActionCode;
  label: string;
  riskLevel: AutoDirectorAction["riskLevel"];
  requiresConfirm: boolean;
}): AutoDirectorAction {
  return {
    code: input.code,
    kind: "mutation",
    label: input.label,
    riskLevel: input.riskLevel,
    requiresConfirm: input.requiresConfirm,
  };
}

function navigationAction(input: {
  code: Extract<AutoDirectorActionCode, "go_replan" | "go_candidate_selection" | "open_detail">;
  label: string;
  riskLevel?: AutoDirectorAction["riskLevel"];
  requiresConfirm?: boolean;
}): AutoDirectorAction {
  return {
    code: input.code,
    kind: "navigation",
    label: input.label,
    riskLevel: input.riskLevel ?? "low",
    requiresConfirm: input.requiresConfirm ?? false,
  };
}

function getContinueLabel(input: AutoDirectorFollowUpResolverInput, fallback: string): string {
  return buildWorkflowResumeAction(input.status, input.checkpointType ?? null, input.executionScopeLabel) ?? fallback;
}

function finalizeResolvedReason(input: {
  reason: AutoDirectorFollowUpReason;
  priority: AutoDirectorResolvedFollowUpReason["priority"];
  availableActions: AutoDirectorAction[];
  batchActionCodes?: AutoDirectorMutationActionCode[];
}): AutoDirectorResolvedFollowUpReason {
  const batchActionCodes = input.batchActionCodes ?? [];
  return {
    reason: input.reason,
    reasonLabel: REASON_LABELS[input.reason],
    priority: input.priority,
    availableActions: input.availableActions,
    batchActionCodes,
    supportsBatch: batchActionCodes.length > 0,
  };
}

export function resolveAutoDirectorFollowUpReason(
  input: AutoDirectorFollowUpResolverInput,
): AutoDirectorResolvedFollowUpReason | null {
  if (input.pendingManualRecovery) {
    return finalizeResolvedReason({
      reason: "manual_recovery_required",
      priority: "P0",
      availableActions: [
        mutationAction({
          code: "continue_generic",
          label: "恢复任务",
          riskLevel: "low",
          requiresConfirm: false,
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
    });
  }

  if (input.status === "failed") {
    return finalizeResolvedReason({
      reason: "runtime_failed",
      priority: "P0",
      availableActions: [
        mutationAction({
          code: "retry_with_task_model",
          label: "按任务模型重试",
          riskLevel: "low",
          requiresConfirm: false,
        }),
        mutationAction({
          code: "retry_with_route_model",
          label: "按路由模型重试",
          riskLevel: "medium",
          requiresConfirm: true,
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
      batchActionCodes: ["retry_with_task_model"],
    });
  }

  if (input.status === "cancelled") {
    return finalizeResolvedReason({
      reason: "runtime_cancelled",
      priority: "P1",
      availableActions: [
        mutationAction({
          code: "continue_generic",
          label: getContinueLabel(input, "继续当前任务"),
          riskLevel: "low",
          requiresConfirm: false,
        }),
        mutationAction({
          code: "retry_with_task_model",
          label: "按任务模型重试",
          riskLevel: "low",
          requiresConfirm: false,
        }),
        mutationAction({
          code: "retry_with_route_model",
          label: "按路由模型重试",
          riskLevel: "medium",
          requiresConfirm: true,
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
      batchActionCodes: ["retry_with_task_model"],
    });
  }

  if (input.status !== "waiting_approval") {
    return null;
  }

  if (input.checkpointType === "candidate_selection_required") {
    return finalizeResolvedReason({
      reason: "candidate_selection_required",
      priority: "P1",
      availableActions: [
        navigationAction({
          code: "go_candidate_selection",
          label: getContinueLabel(input, "去确认书级方向"),
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
    });
  }

  if (input.checkpointType === "replan_required") {
    return finalizeResolvedReason({
      reason: "replan_required",
      priority: "P1",
      availableActions: [
        navigationAction({
          code: "go_replan",
          label: getContinueLabel(input, "处理重规划"),
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
    });
  }

  if (input.checkpointType === "front10_ready") {
    return finalizeResolvedReason({
      reason: "front10_execution_pending",
      priority: "P2",
      availableActions: [
        mutationAction({
          code: "continue_auto_execution",
          label: getContinueLabel(input, "继续自动执行前 10 章"),
          riskLevel: "low",
          requiresConfirm: false,
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
      batchActionCodes: ["continue_auto_execution"],
    });
  }

  if (input.checkpointType === "chapter_batch_ready") {
    return finalizeResolvedReason({
      reason: "quality_repair_pending",
      priority: "P2",
      availableActions: [
        mutationAction({
          code: "continue_auto_execution",
          label: getContinueLabel(input, "继续自动执行当前章节范围"),
          riskLevel: "low",
          requiresConfirm: false,
        }),
        navigationAction({
          code: "open_detail",
          label: "查看详情",
        }),
      ],
      batchActionCodes: ["continue_auto_execution"],
    });
  }

  return null;
}
