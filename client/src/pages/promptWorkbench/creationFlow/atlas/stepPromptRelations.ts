import { stages, stageSteps } from "../flowDefinition";
import { atlasScopes } from "./atlasTopics";

export type RelationKind = "uses" | "companion";
export interface StepPromptRelation {
  stepId: string;
  stepTitle: string;
  promptId: string;
  promptTitle: string;
  kind: RelationKind;
}

function collectRelations(): StepPromptRelation[] {
  const steps = stages.flatMap(stageSteps);
  const records = atlasScopes.flatMap(scope => scope.topics.flatMap(topic => topic.prompts));
  const names = new Map(records.map(([id, title]) => [id, title]));
  const relations: StepPromptRelation[] = [];
  for (const step of steps) {
    const used = new Set(step.templates?.map(([key, , assetId]) => assetId ?? key));
    for (const id of used) {
      relations.push({ stepId: step.id, stepTitle: step.title, promptId: id, promptTitle: names.get(id) ?? id, kind: "uses" });
    }
    for (const [id, title, companionTo] of records) {
      if (companionTo?.includes(step.id) && !used.has(id)) {
        relations.push({ stepId: step.id, stepTitle: step.title, promptId: id, promptTitle: title, kind: "companion" });
      }
    }
  }
  return relations;
}

// Topic membership alone is not evidence that a step runs an asset.
export const stepPromptRelations = collectRelations();
export function relationsFor(id: string | null) {
  return id ? stepPromptRelations.filter(link => link.stepId === id || link.promptId === id) : [];
}
