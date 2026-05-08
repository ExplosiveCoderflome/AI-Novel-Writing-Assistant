import type { PlannerInput, StructuredIntent } from "../../agents/types";
import { chapterWorkflowDefinitions } from "./chapterWorkflowDefinitions";
import { directorWorkflowDefinitions } from "./directorWorkflowDefinitions";
import { generalWorkflowDefinitions } from "./generalWorkflowDefinitions";
import { productionWorkflowDefinitions } from "./productionWorkflowDefinitions";
import type { WorkflowDefinition, WorkflowResolution } from "./workflowTypes";
export type { WorkflowActionDefinition, WorkflowDefinition, WorkflowResolution } from "./workflowTypes";

const EXECUTION_FIRST_INTENTS = new Set<StructuredIntent["intent"]>([
  "create_novel",
  "bind_world_to_novel",
  "unbind_world_from_novel",
  "produce_novel",
  "write_chapter",
  "rewrite_chapter",
  "save_chapter_draft",
  "start_pipeline",
]);

const workflowDefinitions: Record<StructuredIntent["intent"], WorkflowDefinition> = [
  ...generalWorkflowDefinitions,
  ...productionWorkflowDefinitions,
  ...directorWorkflowDefinitions,
  ...chapterWorkflowDefinitions,
].reduce((registry, definition) => {
  registry[definition.intent] = definition;
  return registry;
}, {} as Record<StructuredIntent["intent"], WorkflowDefinition>);

export function listWorkflowDefinitions(): WorkflowDefinition[] {
  return Object.values(workflowDefinitions);
}

export function resolveWorkflow(intent: StructuredIntent, plannerInput: PlannerInput): WorkflowResolution {
  const definition = workflowDefinitions[intent.intent] ?? workflowDefinitions.unknown;
  const holdForCollaboration = EXECUTION_FIRST_INTENTS.has(intent.intent)
    && (Boolean(intent.shouldAskFollowup) || (intent.interactionMode ?? "execute") !== "execute");

  if (holdForCollaboration) {
    return {
      definition,
      actions: [],
      holdForCollaboration,
    };
  }

  if (definition.requiresNovelContext && plannerInput.contextMode === "novel" && !plannerInput.novelId) {
    return {
      definition,
      actions: [],
      holdForCollaboration: false,
    };
  }

  return {
    definition,
    actions: definition.resolve({ intent, plannerInput }),
    holdForCollaboration,
  };
}
