import { stepPromptRelations } from "../atlas/stepPromptRelations";
import type { BookMapStation } from "./bookMapLayout";
import type { MapReferencePrompt, MapReferenceSection } from "./referenceLayout";

export function layoutPromptLinks(stations: BookMapStation[], sections: MapReferenceSection[], prompts: Map<string, MapReferencePrompt>) {
  const connections = stepPromptRelations.flatMap(relation => {
    const prompt = prompts.get(relation.promptId);
    if (!prompt) return [];
    const source = stations.find(station => station.step.id === relation.stepId);
    const section = sections.find(s => s.scope.id === prompt.scope);
    const fromSection = sections.find(s => s.scope.id === source?.stage.id);
    if (!source || !section || !fromSection) return [];
    const targetRight = prompt.x > section.x;
    // Use the outer margins for the long runs; switch sides in the space above the topic headings.
    const sourceLane = source.side ? fromSection.x + fromSection.width + 10 : fromSection.x - 10;
    const targetLane = targetRight ? section.x + section.width + 10 : section.x - 10;
    return [{ ...relation, scope: prompt.scope, sourceHandle: source.side ? "right-out" : "left-out",
      sourceLane, targetLane, crossY: section.y - (relation.kind === "uses" ? 12 : 6) }];
  });
  return connections;
}
