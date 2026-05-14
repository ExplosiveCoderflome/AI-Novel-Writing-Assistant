import type { DirectorCandidateStageNode } from "../novelDirectorCandidateNodeAdapters";
import {
  getDirectorExecutionNodeSequence,
  type DirectorExecutionFlow,
  type DirectorExecutionStage,
} from "../novelDirectorExecutionNodeAdapters";
import type { DirectorPlanningStage } from "../novelDirectorStageNodeAdapters";
import {
  getWorkflowStepWriteContractRequirements,
} from "@ai-novel/shared/types/directorWorkflowStepCatalog";
import type { WorkflowStepModuleDescriptor } from "./WorkflowStepModule";
import { WorkflowStepModuleRegistry } from "./WorkflowStepModuleRegistry";
import {
  DIRECTOR_CANDIDATE_STEP_MODULES,
  DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE,
  DIRECTOR_TAKEOVER_STEP_MODULE,
} from "./directorCandidateStepModules";
import { DIRECTOR_PLANNING_STEP_MODULES } from "./directorPlanningStepModules";
import { DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES } from "./directorStructuredOutlineStepModules";
import {
  DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE,
  DIRECTOR_EXECUTION_STEP_MODULES,
} from "./directorExecutionStepModules";

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

export const DIRECTOR_WORKFLOW_STEP_MODULES = uniqueModules([
  ...Object.values(DIRECTOR_CANDIDATE_STEP_MODULES),
  DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE,
  DIRECTOR_PLANNING_STEP_MODULES.story_macro,
  DIRECTOR_PLANNING_STEP_MODULES.book_contract,
  DIRECTOR_PLANNING_STEP_MODULES.character_setup,
  DIRECTOR_PLANNING_STEP_MODULES.volume_strategy,
  DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.beat_sheet,
  DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_list,
  DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_detail_bundle,
  DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE,
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
  requiresPolicyAction: boolean;
}> = getWorkflowStepWriteContractRequirements();

export function validateDirectorWorkflowStepWriteContracts(
  modules: readonly WorkflowStepModuleDescriptor[] = DIRECTOR_WORKFLOW_STEP_MODULES,
): void {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const failures: string[] = [];
  if (byId.size !== modules.length) {
    failures.push("step ids must be unique");
  }

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
    if (requirement.requiresPolicyAction && !module.policyAction) {
      failures.push(`${requirement.id}: write-capable risky step must declare policyAction`);
    }
    if (module.writes.length > 0 && module.mayModifyUserContent && !module.policyAction && module.requiresApprovalByDefault) {
      failures.push(`${requirement.id}: protected write step must declare policyAction or avoid default approval`);
    }
    if (module.promptAssets?.length === 0) {
      failures.push(`${requirement.id}: promptAssets must be omitted or non-empty`);
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

export function getDirectorStructuredOutlineStepModules(): WorkflowStepModuleDescriptor[] {
  return [
    DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.beat_sheet,
    DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_list,
    DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_detail_bundle,
    DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE,
  ];
}

export function getDirectorExecutionContractSyncStepModule(): WorkflowStepModuleDescriptor {
  return DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE;
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
