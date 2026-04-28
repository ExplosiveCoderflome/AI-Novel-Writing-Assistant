import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorPolicyRequest } from "./runtime/DirectorPolicyEngine";

export type DirectorExecutionFlow = "chapter_execution" | "quality_repair";

export type DirectorExecutionStage =
  | DirectorExecutionFlow
  | "chapter_quality_review"
  | "chapter_repair"
  | "chapter_state_commit"
  | "payoff_ledger_sync"
  | "character_resource_sync";

export type DirectorExecutionNodeKey =
  | "chapter_execution_node"
  | "chapter_quality_review_node"
  | "chapter_repair_node"
  | "chapter_state_commit_node"
  | "payoff_ledger_sync_node"
  | "character_resource_sync_node";

export interface DirectorExecutionNodeAdapter {
  nodeKey: DirectorExecutionNodeKey;
  label: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  policyAction?: DirectorPolicyRequest["action"];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  waitingState: {
    stage: NovelWorkflowStage;
    itemKey: DirectorExecutionFlow;
    itemLabel: string;
    progress: number;
  };
}

const CHAPTER_EXECUTION_WAITING_STATE: DirectorExecutionNodeAdapter["waitingState"] = {
  stage: "chapter_execution",
  itemKey: "chapter_execution",
  itemLabel: "等待确认章节执行",
  progress: 0.93,
};

const QUALITY_REPAIR_WAITING_STATE: DirectorExecutionNodeAdapter["waitingState"] = {
  stage: "quality_repair",
  itemKey: "quality_repair",
  itemLabel: "等待确认章节修复",
  progress: 0.975,
};

export const DIRECTOR_EXECUTION_NODE_ADAPTERS: Record<
  DirectorExecutionStage,
  DirectorExecutionNodeAdapter
> = {
  chapter_execution: {
    nodeKey: "chapter_execution_node",
    label: "执行章节生成批次",
    targetType: "novel",
    reads: [
      "chapter_task_sheet",
      "chapter_retention_contract",
      "continuity_state",
      "character_governance_state",
    ],
    writes: ["chapter_draft"],
    mayModifyUserContent: true,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: CHAPTER_EXECUTION_WAITING_STATE,
  },
  chapter_quality_review: {
    nodeKey: "chapter_quality_review_node",
    label: "检查章节质量",
    targetType: "novel",
    reads: [
      "chapter_draft",
      "chapter_retention_contract",
      "continuity_state",
      "reader_promise",
    ],
    writes: ["audit_report", "rolling_window_review"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: true,
    waitingState: QUALITY_REPAIR_WAITING_STATE,
  },
  chapter_repair: {
    nodeKey: "chapter_repair_node",
    label: "修复章节问题",
    targetType: "novel",
    reads: [
      "chapter_draft",
      "audit_report",
      "repair_ticket",
      "chapter_retention_contract",
    ],
    writes: ["chapter_draft", "audit_report", "repair_ticket"],
    policyAction: "repair",
    mayModifyUserContent: true,
    requiresApprovalByDefault: false,
    supportsAutoRetry: true,
    waitingState: QUALITY_REPAIR_WAITING_STATE,
  },
  chapter_state_commit: {
    nodeKey: "chapter_state_commit_node",
    label: "提交章节连续性状态",
    targetType: "novel",
    reads: ["chapter_draft", "audit_report", "rolling_window_review"],
    writes: ["continuity_state", "character_governance_state"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: QUALITY_REPAIR_WAITING_STATE,
  },
  payoff_ledger_sync: {
    nodeKey: "payoff_ledger_sync_node",
    label: "同步读者承诺与伏笔",
    targetType: "novel",
    reads: ["chapter_draft", "audit_report", "reader_promise"],
    writes: ["reader_promise", "repair_ticket"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: QUALITY_REPAIR_WAITING_STATE,
  },
  character_resource_sync: {
    nodeKey: "character_resource_sync_node",
    label: "同步角色资源状态",
    targetType: "novel",
    reads: ["chapter_draft", "character_governance_state", "continuity_state"],
    writes: ["character_governance_state", "continuity_state"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: QUALITY_REPAIR_WAITING_STATE,
  },
  quality_repair: {
    nodeKey: "chapter_repair_node",
    label: "执行章节质量修复",
    targetType: "novel",
    reads: [
      "chapter_draft",
      "audit_report",
      "repair_ticket",
      "chapter_retention_contract",
    ],
    writes: ["chapter_draft", "audit_report", "repair_ticket"],
    policyAction: "repair",
    mayModifyUserContent: true,
    requiresApprovalByDefault: false,
    supportsAutoRetry: true,
    waitingState: QUALITY_REPAIR_WAITING_STATE,
  },
};

const DIRECTOR_EXECUTION_NODE_SEQUENCES: Record<DirectorExecutionFlow, DirectorExecutionStage[]> = {
  chapter_execution: [
    "chapter_execution",
    "chapter_quality_review",
    "chapter_state_commit",
    "payoff_ledger_sync",
    "character_resource_sync",
  ],
  quality_repair: [
    "chapter_repair",
    "chapter_quality_review",
    "chapter_state_commit",
    "payoff_ledger_sync",
    "character_resource_sync",
  ],
};

export function getDirectorExecutionNodeAdapter(
  stage: DirectorExecutionStage,
): DirectorExecutionNodeAdapter {
  return DIRECTOR_EXECUTION_NODE_ADAPTERS[stage];
}

export function getDirectorExecutionNodeSequence(
  flow: DirectorExecutionFlow,
): DirectorExecutionNodeAdapter[] {
  return DIRECTOR_EXECUTION_NODE_SEQUENCES[flow].map(getDirectorExecutionNodeAdapter);
}
