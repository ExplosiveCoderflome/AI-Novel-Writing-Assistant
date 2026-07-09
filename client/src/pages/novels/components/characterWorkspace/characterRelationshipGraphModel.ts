import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import type { Character, CharacterRelation } from "@ai-novel/shared/types/novel";
import type { CharacterRelationStage } from "@ai-novel/shared/types/characterDynamics";
import { isProtagonistCharacter } from "../characterAssetWorkspace.helpers";

export type RelationshipGraphMode = "all" | "current" | "tension" | "dynamic";

export interface RelationshipGraphNode {
  id: string;
  character: Character;
  x: number;
  y: number;
  relationCount: number;
  dynamicCount: number;
  isSelected: boolean;
}

export interface RelationshipGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  staticRelation?: CharacterRelation;
  dynamicStages: CharacterRelationStage[];
  isDynamic: boolean;
  isHighTension: boolean;
  weight: number;
}

export interface RelationshipGraphModel {
  nodes: RelationshipGraphNode[];
  edges: RelationshipGraphEdge[];
  totalEdgeCount: number;
  dynamicEdgeCount: number;
  highTensionEdgeCount: number;
}

interface ForceNode {
  id: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
}

interface ForceLink {
  source: string;
  target: string;
  weight: number;
}

const CANVAS_WIDTH = 980;
const CANVAS_HEIGHT = 560;

export function buildRelationshipGraphModel(input: {
  characters: Character[];
  staticRelations: CharacterRelation[];
  dynamicRelations: CharacterRelationStage[];
  selectedCharacterId: string;
  mode: RelationshipGraphMode;
}): RelationshipGraphModel {
  const characterById = new Map(input.characters.map((character) => [character.id, character]));
  const protagonist = input.characters.find(isProtagonistCharacter) ?? input.characters[0] ?? null;
  const edgesByPair = new Map<string, RelationshipGraphEdge>();

  for (const relation of input.staticRelations) {
    if (!characterById.has(relation.sourceCharacterId) || !characterById.has(relation.targetCharacterId)) {
      continue;
    }
    const pairKey = getPairKey(relation.sourceCharacterId, relation.targetCharacterId);
    const highTension = isStaticRelationHighTension(relation);
    edgesByPair.set(pairKey, {
      id: pairKey,
      source: relation.sourceCharacterId,
      target: relation.targetCharacterId,
      label: compactText(relation.dynamicLabel) || compactText(relation.surfaceRelation) || "关系",
      staticRelation: relation,
      dynamicStages: [],
      isDynamic: false,
      isHighTension: highTension,
      weight: highTension ? 2.4 : 1.4,
    });
  }

  for (const stage of input.dynamicRelations) {
    if (!characterById.has(stage.sourceCharacterId) || !characterById.has(stage.targetCharacterId)) {
      continue;
    }
    const pairKey = getPairKey(stage.sourceCharacterId, stage.targetCharacterId);
    const existing = edgesByPair.get(pairKey);
    const stageTension = isDynamicStageHighTension(stage);
    if (existing) {
      existing.dynamicStages.push(stage);
      existing.isDynamic = true;
      existing.isHighTension = existing.isHighTension || stageTension;
      existing.weight += stage.isCurrent ? 1.2 : 0.8;
      existing.label = stage.isCurrent ? stage.stageLabel : existing.label;
    } else {
      edgesByPair.set(pairKey, {
        id: pairKey,
        source: stage.sourceCharacterId,
        target: stage.targetCharacterId,
        label: compactText(stage.stageLabel) || "关系阶段",
        dynamicStages: [stage],
        isDynamic: true,
        isHighTension: stageTension,
        weight: stage.isCurrent ? 2.2 : 1.6,
      });
    }
  }

  if (protagonist) {
    for (const character of input.characters) {
      if (character.id === protagonist.id || !compactText(character.relationToProtagonist)) {
        continue;
      }
      const pairKey = getPairKey(protagonist.id, character.id);
      if (!edgesByPair.has(pairKey)) {
        edgesByPair.set(pairKey, {
          id: pairKey,
          source: protagonist.id,
          target: character.id,
          label: compactText(character.relationToProtagonist) || "与主角关系",
          dynamicStages: [],
          isDynamic: false,
          isHighTension: /敌|压|冲突|背叛|利用|怀疑|监视|威胁|秘密|隐瞒/.test(character.relationToProtagonist ?? ""),
          weight: 1.1,
        });
      }
    }
  }

  const allEdges = Array.from(edgesByPair.values());
  const filteredEdges = filterEdges(allEdges, input.mode, input.selectedCharacterId);
  const visibleNodeIds = new Set<string>();
  for (const edge of filteredEdges) {
    visibleNodeIds.add(edge.source);
    visibleNodeIds.add(edge.target);
  }
  if (input.mode !== "all" && input.selectedCharacterId) {
    visibleNodeIds.add(input.selectedCharacterId);
  }
  if (visibleNodeIds.size === 0) {
    input.characters.forEach((character) => visibleNodeIds.add(character.id));
  }

  const relationStats = computeRelationStats(allEdges);
  const layout = computeGraphLayout(
    input.characters.filter((character) => visibleNodeIds.has(character.id)),
    filteredEdges,
    protagonist?.id ?? "",
  );
  const nodes = input.characters
    .filter((character) => visibleNodeIds.has(character.id))
    .map((character) => {
      const position = layout.get(character.id) ?? { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
      const stats = relationStats.get(character.id) ?? { relationCount: 0, dynamicCount: 0 };
      return {
        id: character.id,
        character,
        x: position.x,
        y: position.y,
        relationCount: stats.relationCount,
        dynamicCount: stats.dynamicCount,
        isSelected: character.id === input.selectedCharacterId,
      };
    });

  return {
    nodes,
    edges: filteredEdges,
    totalEdgeCount: allEdges.length,
    dynamicEdgeCount: allEdges.filter((edge) => edge.isDynamic).length,
    highTensionEdgeCount: allEdges.filter((edge) => edge.isHighTension).length,
  };
}

function filterEdges(
  edges: RelationshipGraphEdge[],
  mode: RelationshipGraphMode,
  selectedCharacterId: string,
): RelationshipGraphEdge[] {
  if (mode === "current") {
    return selectedCharacterId
      ? edges.filter((edge) => edge.source === selectedCharacterId || edge.target === selectedCharacterId)
      : edges;
  }
  if (mode === "tension") {
    return edges.filter((edge) => edge.isHighTension);
  }
  if (mode === "dynamic") {
    return edges.filter((edge) => edge.isDynamic);
  }
  return edges;
}

function computeRelationStats(edges: RelationshipGraphEdge[]) {
  const stats = new Map<string, { relationCount: number; dynamicCount: number }>();
  for (const edge of edges) {
    for (const characterId of [edge.source, edge.target]) {
      const current = stats.get(characterId) ?? { relationCount: 0, dynamicCount: 0 };
      current.relationCount += 1;
      if (edge.isDynamic) {
        current.dynamicCount += 1;
      }
      stats.set(characterId, current);
    }
  }
  return stats;
}

function computeGraphLayout(
  characters: Character[],
  edges: RelationshipGraphEdge[],
  protagonistId: string,
) {
  const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.34;
  const nodes: ForceNode[] = characters.map((character, index) => {
    if (character.id === protagonistId) {
      return {
        id: character.id,
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        fx: CANVAS_WIDTH / 2,
        fy: CANVAS_HEIGHT / 2,
      };
    }
    const angle = (Math.PI * 2 * index) / Math.max(characters.length, 1);
    return {
      id: character.id,
      x: CANVAS_WIDTH / 2 + radius * Math.cos(angle),
      y: CANVAS_HEIGHT / 2 + radius * Math.sin(angle),
    };
  });
  const links: ForceLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
  }));

  forceSimulation<ForceNode>(nodes)
    .force("link", forceLink<ForceNode, ForceLink>(links).id((node) => node.id).distance((link) => Math.max(110, 220 - link.weight * 32)).strength(0.28))
    .force("charge", forceManyBody<ForceNode>().strength(-760))
    .force("collide", forceCollide<ForceNode>().radius(82).strength(0.86))
    .force("center", forceCenter(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2).strength(0.08))
    .stop()
    .tick(180);

  return new Map(nodes.map((node) => [
    node.id,
    {
      x: clamp(node.x, 90, CANVAS_WIDTH - 90),
      y: clamp(node.y, 70, CANVAS_HEIGHT - 70),
    },
  ]));
}

function getPairKey(first: string, second: string): string {
  return [first, second].sort().join("__");
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function isStaticRelationHighTension(relation: CharacterRelation): boolean {
  const text = [
    relation.surfaceRelation,
    relation.hiddenTension,
    relation.conflictSource,
    relation.secretAsymmetry,
    relation.dynamicLabel,
    relation.nextTurnPoint,
  ].filter(Boolean).join(" ");
  return /敌|压|冲突|背叛|利用|怀疑|监视|威胁|秘密|隐瞒|对立|反转|代价/.test(text)
    || (relation.conflictScore ?? 0) >= 0.55;
}

function isDynamicStageHighTension(stage: CharacterRelationStage): boolean {
  const text = [stage.stageLabel, stage.stageSummary, stage.nextTurnPoint].filter(Boolean).join(" ");
  return /敌|压|冲突|背叛|利用|怀疑|监视|威胁|秘密|隐瞒|对立|反转|代价|升级/.test(text);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
