import type { DirectorCandidateStageNode } from "../phases/novelDirectorCandidateNodeAdapters";
import type { DirectorExecutionStage } from "../phases/novelDirectorExecutionNodeAdapters";
import type { DirectorPlanningStage } from "../phases/novelDirectorStageNodeAdapters";
import { DIRECTOR_WORKFLOW_STEP_IDS } from "@ai-novel/shared/types/directorWorkflowStepCatalog";

export const DIRECTOR_CANDIDATE_STEP_IDS: Record<DirectorCandidateStageNode, string> = {
  candidate_generation: DIRECTOR_WORKFLOW_STEP_IDS.candidate.candidate_generation,
  candidate_refine: DIRECTOR_WORKFLOW_STEP_IDS.candidate.candidate_refine,
  candidate_patch: DIRECTOR_WORKFLOW_STEP_IDS.candidate.candidate_patch,
  candidate_title_refine: DIRECTOR_WORKFLOW_STEP_IDS.candidate.candidate_title_refine,
};

export const DIRECTOR_PLANNING_STEP_IDS: Record<DirectorPlanningStage, string> = {
  story_macro: DIRECTOR_WORKFLOW_STEP_IDS.planning.story_macro,
  book_contract: DIRECTOR_WORKFLOW_STEP_IDS.planning.book_contract,
  character_setup: DIRECTOR_WORKFLOW_STEP_IDS.planning.character_setup,
  volume_strategy: DIRECTOR_WORKFLOW_STEP_IDS.planning.volume_strategy,
  structured_outline: DIRECTOR_WORKFLOW_STEP_IDS.planning.structured_outline,
};

export const DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS = {
  beat_sheet: DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.beat_sheet,
  chapter_list: DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_list,
  chapter_detail_bundle: DIRECTOR_WORKFLOW_STEP_IDS.structuredOutline.chapter_detail_bundle,
} as const;

export const DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID = DIRECTOR_WORKFLOW_STEP_IDS.executionContractSync;

export const DIRECTOR_EXECUTION_STEP_IDS: Record<DirectorExecutionStage, string> = {
  chapter_execution: DIRECTOR_WORKFLOW_STEP_IDS.execution.chapter_execution,
  chapter_quality_review: DIRECTOR_WORKFLOW_STEP_IDS.execution.chapter_quality_review,
  chapter_repair: DIRECTOR_WORKFLOW_STEP_IDS.execution.chapter_repair,
  chapter_state_commit: DIRECTOR_WORKFLOW_STEP_IDS.execution.chapter_state_commit,
  payoff_ledger_sync: DIRECTOR_WORKFLOW_STEP_IDS.execution.payoff_ledger_sync,
  character_resource_sync: DIRECTOR_WORKFLOW_STEP_IDS.execution.character_resource_sync,
  quality_repair: DIRECTOR_WORKFLOW_STEP_IDS.execution.quality_repair,
};

export const DIRECTOR_TAKEOVER_STEP_ID = DIRECTOR_WORKFLOW_STEP_IDS.takeover;
export const DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID = DIRECTOR_WORKFLOW_STEP_IDS.confirmNovelCreate;
