import type {
  DirectorArtifactRef,
  DirectorPolicyDecision,
  DirectorPolicyMode,
  DirectorRuntimePolicySnapshot,
  DirectorQualityGateResult,
} from "@ai-novel/shared/types/directorRuntime";
import { buildDefaultDirectorPolicy } from "./directorRuntimeDefaults";

export interface DirectorPolicyRequest {
  mode?: DirectorPolicyMode;
  policy?: DirectorRuntimePolicySnapshot | null;
  action: "analyze" | "run_node" | "repair" | "overwrite" | "auto_continue";
  affectedArtifacts?: DirectorArtifactRef[];
  mayOverwriteUserContent?: boolean;
  requiresApprovalByDefault?: boolean;
  qualityGateResult?: DirectorQualityGateResult | null;
}

function hasProtectedUserContent(artifacts: DirectorArtifactRef[] | undefined): boolean {
  return (artifacts ?? []).some((artifact) => (
    artifact.status === "active"
    && (artifact.source === "user_edited" || artifact.protectedUserContent === true)
  ));
}

export class DirectorPolicyEngine {
  decide(input: DirectorPolicyRequest): DirectorPolicyDecision {
    const policy = input.policy ?? buildDefaultDirectorPolicy(input.mode);
    const affectedArtifacts = (input.affectedArtifacts ?? []).map((artifact) => artifact.id);
    const affectsProtectedUserContent = hasProtectedUserContent(input.affectedArtifacts);
    const overwritesUserContent = affectsProtectedUserContent || input.action === "overwrite";

    if (input.action === "analyze") {
      return {
        canRun: true,
        requiresApproval: false,
        reason: "工作区分析不修改用户内容，可以直接执行。",
        mayOverwriteUserContent: false,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "continue_with_risk",
      };
    }

    if (input.qualityGateResult?.status === "blocked_scope") {
      return {
        canRun: false,
        requiresApproval: true,
        reason: input.qualityGateResult.reason,
        mayOverwriteUserContent: overwritesUserContent,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "block_scope",
      };
    }

    if (overwritesUserContent && !policy.mayOverwriteUserContent) {
      return {
        canRun: false,
        requiresApproval: true,
        reason: "该动作可能覆盖用户手写内容，需要确认后继续。",
        mayOverwriteUserContent: true,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "pause_for_manual",
      };
    }

    if (policy.mode === "suggest_only") {
      return {
        canRun: false,
        requiresApproval: true,
        reason: "当前策略只给建议，不自动执行写入动作。",
        mayOverwriteUserContent: overwritesUserContent,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "pause_for_manual",
      };
    }

    if (input.requiresApprovalByDefault && policy.mode !== "auto_safe_scope") {
      return {
        canRun: false,
        requiresApproval: true,
        reason: "该导演节点默认需要确认，当前策略不会自动执行。",
        mayOverwriteUserContent: overwritesUserContent,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "pause_for_manual",
      };
    }

    if (input.qualityGateResult?.status === "repairable") {
      return {
        canRun: true,
        requiresApproval: false,
        reason: "质量问题可自动修复一次。",
        mayOverwriteUserContent: overwritesUserContent,
        affectedArtifacts,
        autoRetryBudget: 1,
        onQualityFailure: "repair_once",
      };
    }

    if (input.qualityGateResult?.status === "needs_manual_repair") {
      return {
        canRun: false,
        requiresApproval: true,
        reason: "质量问题需要人工修复或确认继续。",
        mayOverwriteUserContent: overwritesUserContent,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "pause_for_manual",
      };
    }

    if (input.qualityGateResult?.status === "continue_with_risk") {
      return {
        canRun: true,
        requiresApproval: policy.mode !== "auto_safe_scope",
        reason: "问题不阻断后续推进，但会记录风险并允许用户稍后处理。",
        mayOverwriteUserContent: overwritesUserContent,
        affectedArtifacts,
        autoRetryBudget: 0,
        onQualityFailure: "continue_with_risk",
      };
    }

    return {
      canRun: true,
      requiresApproval: policy.mode === "run_next_step" && input.action === "auto_continue",
      reason: "当前策略允许执行该动作。",
      mayOverwriteUserContent: overwritesUserContent,
      affectedArtifacts,
      autoRetryBudget: input.action === "repair" ? 1 : 0,
      onQualityFailure: input.action === "repair" ? "repair_once" : "continue_with_risk",
    };
  }
}
