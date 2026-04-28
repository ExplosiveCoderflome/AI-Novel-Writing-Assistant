import type { DirectorExecutionFlow } from "../novelDirectorExecutionNodeAdapters";
import type { DirectorPlanningStage } from "../novelDirectorStageNodeAdapters";
import {
  createWorkflowPlanFromStepModules,
  type WorkflowPlan,
} from "./WorkflowStepModule";
import {
  getDirectorExecutionStepModuleSequence,
  getDirectorPlanningStepModule,
} from "./directorWorkflowStepModules";

const DIRECTOR_PLANNING_SEQUENCE: DirectorPlanningStage[] = [
  "story_macro",
  "book_contract",
  "character_setup",
  "volume_strategy",
  "structured_outline",
];

export function buildDirectorPlanningWorkflowPlan(input?: {
  startPhase?: DirectorPlanningStage;
}): WorkflowPlan {
  const startPhase = input?.startPhase ?? "story_macro";
  const startIndex = DIRECTOR_PLANNING_SEQUENCE.indexOf(startPhase);
  const sequence = startIndex >= 0
    ? DIRECTOR_PLANNING_SEQUENCE.slice(startIndex)
    : DIRECTOR_PLANNING_SEQUENCE;
  return createWorkflowPlanFromStepModules({
    id: `director.planning.${startPhase}`,
    goal: "director_planning",
    source: "auto_director",
    mode: "run_until_gate",
    modules: sequence.map(getDirectorPlanningStepModule),
  });
}

export function buildChapterPipelineWorkflowTemplate(
  flow: DirectorExecutionFlow,
): WorkflowPlan {
  return createWorkflowPlanFromStepModules({
    id: `pipeline.${flow}`,
    goal: flow,
    source: "chapter_pipeline",
    mode: "run_until_gate",
    modules: getDirectorExecutionStepModuleSequence(flow),
  });
}
