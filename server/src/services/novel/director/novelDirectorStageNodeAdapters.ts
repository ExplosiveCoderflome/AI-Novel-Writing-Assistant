import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";
import { DIRECTOR_PROGRESS, type DirectorProgressItemKey } from "./novelDirectorProgress";

export type DirectorPlanningStage =
  | "story_macro"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline";

export interface DirectorStageNodeAdapter {
  nodeKey: string;
  label: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  waitingState: {
    stage: NovelWorkflowStage;
    itemKey: DirectorProgressItemKey;
    itemLabel: string;
    progress: number;
  };
}

export const DIRECTOR_STAGE_NODE_ADAPTERS: Record<DirectorPlanningStage, DirectorStageNodeAdapter> = {
  story_macro: {
    nodeKey: "story_macro_phase",
    label: "生成书级规划资产",
    targetType: "novel",
    reads: ["book_seed", "candidate_batch"],
    writes: ["story_macro", "book_contract"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: {
      stage: "story_macro",
      itemKey: "book_contract",
      itemLabel: "等待确认书级规划资产",
      progress: DIRECTOR_PROGRESS.bookContract,
    },
  },
  character_setup: {
    nodeKey: "character_setup_phase",
    label: "准备角色阵容与角色资产",
    targetType: "novel",
    reads: ["book_contract", "story_macro"],
    writes: ["character_cast"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: {
      stage: "character_setup",
      itemKey: "character_setup",
      itemLabel: "等待确认角色阵容",
      progress: DIRECTOR_PROGRESS.characterSetup,
    },
  },
  volume_strategy: {
    nodeKey: "volume_strategy_phase",
    label: "生成分卷策略与推进路线",
    targetType: "novel",
    reads: ["book_contract", "story_macro", "character_cast"],
    writes: ["volume_strategy"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: {
      stage: "volume_strategy",
      itemKey: "volume_strategy",
      itemLabel: "等待确认分卷策略",
      progress: DIRECTOR_PROGRESS.volumeStrategy,
    },
  },
  structured_outline: {
    nodeKey: "structured_outline_phase",
    label: "生成章节任务单",
    targetType: "novel",
    reads: ["volume_strategy", "character_cast"],
    writes: ["chapter_task_sheet"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    waitingState: {
      stage: "structured_outline",
      itemKey: "chapter_detail_bundle",
      itemLabel: "等待确认章节任务单",
      progress: DIRECTOR_PROGRESS.chapterDetailStart,
    },
  },
};

export function getDirectorStageNodeAdapter(stage: DirectorPlanningStage): DirectorStageNodeAdapter {
  return DIRECTOR_STAGE_NODE_ADAPTERS[stage];
}
