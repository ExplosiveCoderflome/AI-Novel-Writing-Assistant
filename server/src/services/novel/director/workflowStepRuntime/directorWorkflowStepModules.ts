import {
  DIRECTOR_CANDIDATE_NODE_ADAPTERS,
  type DirectorCandidateStageNode,
} from "../novelDirectorCandidateNodeAdapters";
import { getDirectorConfirmNovelCreateNodeAdapter } from "../novelDirectorConfirmNodeAdapters";
import {
  getDirectorExecutionNodeAdapter,
  getDirectorExecutionNodeSequence,
  type DirectorExecutionFlow,
  type DirectorExecutionStage,
} from "../novelDirectorExecutionNodeAdapters";
import {
  getDirectorStageNodeAdapter,
  type DirectorPlanningStage,
} from "../novelDirectorStageNodeAdapters";
import { getDirectorTakeoverNodeAdapter } from "../novelDirectorTakeoverNodeAdapters";
import {
  createWorkflowStepDescriptorFromDirectorAdapter,
  type WorkflowStepModuleDescriptor,
} from "./WorkflowStepModule";
import { WorkflowStepModuleRegistry } from "./WorkflowStepModuleRegistry";

export const DIRECTOR_CANDIDATE_STEP_IDS: Record<DirectorCandidateStageNode, string> = {
  candidate_generation: "book.candidate.generate",
  candidate_refine: "book.candidate.refine",
  candidate_patch: "book.candidate.patch",
  candidate_title_refine: "book.candidate.title_refine",
};

export const DIRECTOR_PLANNING_STEP_IDS: Record<DirectorPlanningStage, string> = {
  story_macro: "story.macro.plan",
  book_contract: "book.contract.create",
  character_setup: "character.cast.prepare",
  volume_strategy: "volume.strategy.plan",
  structured_outline: "chapter.task_sheet.plan",
};

export const DIRECTOR_EXECUTION_STEP_IDS: Record<DirectorExecutionStage, string> = {
  chapter_execution: "chapter.draft.write",
  chapter_quality_review: "chapter.quality.review",
  chapter_repair: "chapter.draft.repair",
  chapter_state_commit: "chapter.state.commit",
  payoff_ledger_sync: "payoff.ledger.sync",
  character_resource_sync: "character.resource.sync",
  quality_repair: "chapter.draft.repair",
};

export const DIRECTOR_TAKEOVER_STEP_ID = "workflow.takeover.execute";
export const DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID = "book.project.create";

function uniqueModules(
  modules: readonly WorkflowStepModuleDescriptor[],
): WorkflowStepModuleDescriptor[] {
  const seen = new Set<string>();
  return modules.filter((module) => {
    if (seen.has(module.id)) {
      return false;
    }
    seen.add(module.id);
    return true;
  });
}

export const DIRECTOR_CANDIDATE_STEP_MODULES: Record<
  DirectorCandidateStageNode,
  WorkflowStepModuleDescriptor
> = Object.fromEntries(
  Object.entries(DIRECTOR_CANDIDATE_NODE_ADAPTERS).map(([stage, adapter]) => [
    stage,
    createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_CANDIDATE_STEP_IDS[stage as DirectorCandidateStageNode],
      stage: "candidate_selection",
      adapter,
    }),
  ]),
) as Record<DirectorCandidateStageNode, WorkflowStepModuleDescriptor>;

export const DIRECTOR_PLANNING_STEP_MODULES: Record<
  DirectorPlanningStage,
  WorkflowStepModuleDescriptor
> = {
  story_macro: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.story_macro,
    stage: "story_macro",
    adapter: getDirectorStageNodeAdapter("story_macro"),
  }),
  book_contract: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.book_contract,
    stage: "story_macro",
    adapter: getDirectorStageNodeAdapter("book_contract"),
  }),
  character_setup: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.character_setup,
    stage: "character_setup",
    adapter: getDirectorStageNodeAdapter("character_setup"),
  }),
  volume_strategy: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.volume_strategy,
    stage: "volume_strategy",
    adapter: getDirectorStageNodeAdapter("volume_strategy"),
  }),
  structured_outline: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.structured_outline,
    stage: "structured_outline",
    adapter: getDirectorStageNodeAdapter("structured_outline"),
  }),
};

export const DIRECTOR_EXECUTION_STEP_MODULES: Record<
  DirectorExecutionStage,
  WorkflowStepModuleDescriptor
> = {
  chapter_execution: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
    stage: "chapter_execution",
    adapter: getDirectorExecutionNodeAdapter("chapter_execution"),
    promptAssets: [{ id: "novel.chapter.writer", version: "v5" }],
  }),
  chapter_quality_review: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("chapter_quality_review"),
    promptAssets: [{ id: "audit.chapter.full", version: "v2" }],
  }),
  chapter_repair: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_repair,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("chapter_repair"),
  }),
  chapter_state_commit: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("chapter_state_commit"),
  }),
  payoff_ledger_sync: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("payoff_ledger_sync"),
    promptAssets: [{ id: "novel.payoff_ledger.sync", version: "v5" }],
  }),
  character_resource_sync: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("character_resource_sync"),
  }),
  quality_repair: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.quality_repair,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("quality_repair"),
  }),
};

export const DIRECTOR_TAKEOVER_STEP_MODULE = createWorkflowStepDescriptorFromDirectorAdapter({
  id: DIRECTOR_TAKEOVER_STEP_ID,
  stage: "takeover",
  adapter: getDirectorTakeoverNodeAdapter(),
});

export const DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE = createWorkflowStepDescriptorFromDirectorAdapter({
  id: DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID,
  stage: "candidate_confirm",
  adapter: getDirectorConfirmNovelCreateNodeAdapter(),
});

export const DIRECTOR_WORKFLOW_STEP_MODULES = uniqueModules([
  ...Object.values(DIRECTOR_CANDIDATE_STEP_MODULES),
  DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE,
  ...Object.values(DIRECTOR_PLANNING_STEP_MODULES),
  ...Object.values(DIRECTOR_EXECUTION_STEP_MODULES),
  DIRECTOR_TAKEOVER_STEP_MODULE,
]);

export const directorWorkflowStepModuleRegistry = new WorkflowStepModuleRegistry(
  DIRECTOR_WORKFLOW_STEP_MODULES,
);

const REQUIRED_DIRECTOR_WRITE_CONTRACTS: Array<{
  id: string;
  writes: string[];
  mayModifyUserContent: boolean;
}> = [
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_generation, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_refine, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_patch, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_title_refine, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID, writes: ["novel_project", "director_runtime"], mayModifyUserContent: false },
  { id: DIRECTOR_TAKEOVER_STEP_ID, writes: ["workflow_task", "director_runtime"], mayModifyUserContent: false },
  { id: DIRECTOR_PLANNING_STEP_IDS.story_macro, writes: ["story_macro"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.book_contract, writes: ["book_contract"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.character_setup, writes: ["character_cast"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.volume_strategy, writes: ["volume_strategy"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.structured_outline, writes: ["chapter_task_sheet"], mayModifyUserContent: true },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_execution, writes: ["chapter_draft"], mayModifyUserContent: true },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, writes: ["audit_report", "rolling_window_review"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, writes: ["chapter_draft", "audit_report", "repair_ticket"], mayModifyUserContent: true },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit, writes: ["continuity_state", "character_governance_state"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync, writes: ["reader_promise", "repair_ticket"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync, writes: ["character_governance_state", "continuity_state"], mayModifyUserContent: false },
];

export function validateDirectorWorkflowStepWriteContracts(
  modules: readonly WorkflowStepModuleDescriptor[] = DIRECTOR_WORKFLOW_STEP_MODULES,
): void {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const failures: string[] = [];

  for (const requirement of REQUIRED_DIRECTOR_WRITE_CONTRACTS) {
    const module = byId.get(requirement.id);
    if (!module) {
      failures.push(`${requirement.id}: missing step module`);
      continue;
    }
    for (const write of requirement.writes) {
      if (!module.writes.includes(write)) {
        failures.push(`${requirement.id}: missing write ${write}`);
      }
    }
    if (module.reads.length === 0) {
      failures.push(`${requirement.id}: reads must be declared`);
    }
    if (module.targetType !== "global" && module.targetType !== "novel" && module.targetType !== "volume" && module.targetType !== "chapter") {
      failures.push(`${requirement.id}: invalid target scope`);
    }
    if (module.mayModifyUserContent !== requirement.mayModifyUserContent) {
      failures.push(`${requirement.id}: mayModifyUserContent mismatch`);
    }
    if (typeof module.requiresApprovalByDefault !== "boolean") {
      failures.push(`${requirement.id}: requiresApprovalByDefault must be boolean`);
    }
    if (typeof module.supportsAutoRetry !== "boolean") {
      failures.push(`${requirement.id}: supportsAutoRetry must be boolean`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Director workflow step write contract is incomplete: ${failures.join("; ")}`);
  }
}

validateDirectorWorkflowStepWriteContracts();

export function getDirectorCandidateStepModule(
  stage: DirectorCandidateStageNode,
): WorkflowStepModuleDescriptor {
  return DIRECTOR_CANDIDATE_STEP_MODULES[stage];
}

export function getDirectorPlanningStepModule(
  stage: DirectorPlanningStage,
): WorkflowStepModuleDescriptor {
  return DIRECTOR_PLANNING_STEP_MODULES[stage];
}

export function getDirectorExecutionStepModule(
  stage: DirectorExecutionStage,
): WorkflowStepModuleDescriptor {
  return DIRECTOR_EXECUTION_STEP_MODULES[stage];
}

export function getDirectorExecutionStepModuleSequence(
  flow: DirectorExecutionFlow,
): WorkflowStepModuleDescriptor[] {
  return getDirectorExecutionNodeSequence(flow).map((adapter) => {
    const stage = Object.entries(DIRECTOR_EXECUTION_STEP_MODULES).find(([, module]) => (
      module.nodeKey === adapter.nodeKey && module.label === adapter.label
    ))?.[0] as DirectorExecutionStage | undefined;
    if (!stage) {
      throw new Error(`No workflow step module found for execution node: ${adapter.nodeKey}`);
    }
    return getDirectorExecutionStepModule(stage);
  });
}

export function getDirectorTakeoverStepModule(): WorkflowStepModuleDescriptor {
  return DIRECTOR_TAKEOVER_STEP_MODULE;
}

export function getDirectorConfirmNovelCreateStepModule(): WorkflowStepModuleDescriptor {
  return DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE;
}
