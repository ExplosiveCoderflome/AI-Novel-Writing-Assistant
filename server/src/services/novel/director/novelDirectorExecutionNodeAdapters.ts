import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";

export type DirectorExecutionStage = "chapter_execution" | "quality_repair";

export interface DirectorExecutionNodeAdapter {
  nodeKey: "chapter_execution_node" | "chapter_quality_repair_node";
  label: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  waitingState: {
    stage: NovelWorkflowStage;
    itemKey: DirectorExecutionStage;
    itemLabel: string;
    progress: number;
  };
}

export const DIRECTOR_EXECUTION_NODE_ADAPTERS: Record<
  DirectorExecutionStage,
  DirectorExecutionNodeAdapter
> = {
  chapter_execution: {
    nodeKey: "chapter_execution_node",
    label: "执行章节生成批次",
    targetType: "novel",
    reads: ["chapter_task_sheet", "chapter_draft", "audit_report"],
    writes: ["chapter_draft", "audit_report"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: {
      stage: "chapter_execution",
      itemKey: "chapter_execution",
      itemLabel: "等待确认章节执行",
      progress: 0.93,
    },
  },
  quality_repair: {
    nodeKey: "chapter_quality_repair_node",
    label: "执行章节质量修复",
    targetType: "novel",
    reads: ["chapter_task_sheet", "chapter_draft", "audit_report"],
    writes: ["chapter_draft", "audit_report", "repair_ticket"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: true,
    waitingState: {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: "等待确认章节修复",
      progress: 0.975,
    },
  },
};

export function getDirectorExecutionNodeAdapter(
  stage: DirectorExecutionStage,
): DirectorExecutionNodeAdapter {
  return DIRECTOR_EXECUTION_NODE_ADAPTERS[stage];
}
