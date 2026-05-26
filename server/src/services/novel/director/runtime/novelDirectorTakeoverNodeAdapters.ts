import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";

export interface DirectorTakeoverNodeAdapter {
  nodeKey: "takeover_execution";
  label: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  waitingState: {
    stage: NovelWorkflowStage;
    itemKey: "takeover_execution";
    itemLabel: string;
  };
}

export const DIRECTOR_TAKEOVER_NODE_ADAPTER: DirectorTakeoverNodeAdapter = {
  nodeKey: "takeover_execution",
  label: "执行 AI 自动导演接管",
  targetType: "global",
  reads: ["workspace_inventory", "takeover_plan", "runtime_policy"],
  writes: ["workflow_task", "director_runtime"],
  mayModifyUserContent: false,
  requiresApprovalByDefault: false,
  supportsAutoRetry: false,
  waitingState: {
    stage: "auto_director",
    itemKey: "takeover_execution",
    itemLabel: "等待确认自动导演接管",
  },
};

export function getDirectorTakeoverNodeAdapter(): DirectorTakeoverNodeAdapter {
  return DIRECTOR_TAKEOVER_NODE_ADAPTER;
}
