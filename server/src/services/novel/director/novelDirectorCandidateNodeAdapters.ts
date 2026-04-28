import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";

export type DirectorCandidateStageNode =
  | "candidate_generation"
  | "candidate_refine"
  | "candidate_patch"
  | "candidate_title_refine";

export interface DirectorCandidateNodeAdapter {
  nodeKey: DirectorCandidateStageNode;
  label: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  waitingState: {
    stage: NovelWorkflowStage;
    itemKey: DirectorCandidateStageNode;
    itemLabel: string;
  };
}

function candidateNodeAdapter(input: {
  nodeKey: DirectorCandidateStageNode;
  label: string;
}): DirectorCandidateNodeAdapter {
  return {
    nodeKey: input.nodeKey,
    label: input.label,
    targetType: "global",
    reads: ["user_seed"],
    writes: ["candidate_batch"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: {
      stage: "auto_director",
      itemKey: input.nodeKey,
      itemLabel: input.label,
    },
  };
}

export const DIRECTOR_CANDIDATE_NODE_ADAPTERS: Record<
  DirectorCandidateStageNode,
  DirectorCandidateNodeAdapter
> = {
  candidate_generation: candidateNodeAdapter({
    nodeKey: "candidate_generation",
    label: "生成书级候选",
  }),
  candidate_refine: candidateNodeAdapter({
    nodeKey: "candidate_refine",
    label: "修订候选方向",
  }),
  candidate_patch: candidateNodeAdapter({
    nodeKey: "candidate_patch",
    label: "定向修正候选",
  }),
  candidate_title_refine: candidateNodeAdapter({
    nodeKey: "candidate_title_refine",
    label: "优化候选书名",
  }),
};

export function getDirectorCandidateNodeAdapter(
  nodeKey: DirectorCandidateStageNode,
): DirectorCandidateNodeAdapter {
  return DIRECTOR_CANDIDATE_NODE_ADAPTERS[nodeKey];
}
