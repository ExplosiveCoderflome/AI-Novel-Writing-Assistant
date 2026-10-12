import type {DirectorWorldMaterials} from "@ai-novel/shared/types/director/workspace";
import type {WorldVisualizationPayload} from "@ai-novel/shared/types/world";

/** Project saved structured facts. Layout may arrange nodes, but cannot invent world geography. */
export function projectSavedWorldVisualization(world: DirectorWorldMaterials | null): WorldVisualizationPayload | null {
  const structure = world?.structure;
  if (!structure) return null;
  const factionNodes = [
    ...structure.forces.map(force => ({id:force.id, label:force.name, type:force.type || "other"})),
    ...structure.factions.map(faction => ({id:faction.id, label:faction.name, type:"faction"})),
  ];
  const forceIds = new Set(factionNodes.map(node=>node.id));
  const locationIds = new Set(structure.locations.map(location=>location.id));
  return {
    worldId: world.id ?? "",
    factionGraph: {
      nodes: factionNodes,
      edges: structure.relations.forceRelations
        .filter(relation=>forceIds.has(relation.sourceForceId) && forceIds.has(relation.targetForceId))
        .map(relation=>({source:relation.sourceForceId, target:relation.targetForceId, relation:relation.relation})),
    },
    geographyMap: {
      nodes: structure.locations.map(location=>({
        id:location.id, label:location.name, x:location.x, y:location.y, directionHint:location.directionHint,
        terrain:location.terrain, summary:location.summary, risk:location.risk,
        storyRelevance:location.storyRelevance || location.narrativeFunction,
        controllingForceIds: Array.from(new Set([
          ...location.controllingForceIds,
          ...structure.relations.locationControls.filter(control=>control.locationId===location.id).map(control=>control.forceId),
        ])),
      })),
      edges: (structure.relations.locationConnections ?? [])
        .filter(relation=>locationIds.has(relation.sourceLocationId) && locationIds.has(relation.targetLocationId))
        .map(relation=>({source:relation.sourceLocationId, target:relation.targetLocationId,
          relation:relation.connectionType, distanceHint:relation.distanceHint, risk:relation.narrativeUse})),
    },
    powerTree: structure.rules.axioms.map(rule=>({level:rule.name, description:[rule.summary,
      rule.cost ? `代价：${rule.cost}` : "", rule.boundary ? `边界：${rule.boundary}` : ""].filter(Boolean).join("；")})),
    // The structure has no dated event collection. A conflict or rule is not a historical event.
    timeline: [],
  };
}
