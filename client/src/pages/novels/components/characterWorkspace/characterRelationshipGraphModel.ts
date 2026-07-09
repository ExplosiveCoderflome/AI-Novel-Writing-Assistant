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
  sourceName: string;
  targetName: string;
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
const GRAPH_CARD_WIDTH = 164;
const GRAPH_CARD_HEIGHT = 128;
const GRAPH_CARD_GAP_X = 58;
const GRAPH_CARD_GAP_Y = 40;
const CURRENT_ROOT_X = 170;
const CURRENT_BRANCH_X = 560;
const CURRENT_BRANCH_Y_START = 140;
const CURRENT_BRANCH_Y_GAP = 156;

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
      sourceName: relation.sourceCharacterName || characterById.get(relation.sourceCharacterId)?.name || "未知角色",
      targetName: relation.targetCharacterName || characterById.get(relation.targetCharacterId)?.name || "未知角色",
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
        sourceName: stage.sourceCharacterName || characterById.get(stage.sourceCharacterId)?.name || "未知角色",
        targetName: stage.targetCharacterName || characterById.get(stage.targetCharacterId)?.name || "未知角色",
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
          sourceName: protagonist.name,
          targetName: character.name,
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
  const filteredEdges = normalizeCurrentModeEdges(
    filterEdges(allEdges, input.mode, input.selectedCharacterId),
    input.mode,
    input.selectedCharacterId,
  );
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
  const visibleCharacters = input.characters.filter((character) => visibleNodeIds.has(character.id));
  const layout = input.mode === "current" && input.selectedCharacterId
    ? computeCurrentCharacterTreeLayout(visibleCharacters, filteredEdges, input.selectedCharacterId)
    : computeGraphLayout(visibleCharacters, filteredEdges, protagonist?.id ?? "");
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

function normalizeCurrentModeEdges(
  edges: RelationshipGraphEdge[],
  mode: RelationshipGraphMode,
  selectedCharacterId: string,
): RelationshipGraphEdge[] {
  if (mode !== "current" || !selectedCharacterId) {
    return edges;
  }

  return edges.map((edge) => {
    if (edge.source === selectedCharacterId) {
      return edge;
    }
    if (edge.target !== selectedCharacterId) {
      return edge;
    }
    return {
      ...edge,
      id: `${edge.id}::from-current`,
      source: selectedCharacterId,
      target: edge.source,
      sourceName: edge.targetName,
      targetName: edge.sourceName,
    };
  });
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

function computeCurrentCharacterTreeLayout(
  characters: Character[],
  edges: RelationshipGraphEdge[],
  selectedCharacterId: string,
) {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const relatedIds = Array.from(new Set(edges
    .filter((edge) => edge.source === selectedCharacterId)
    .map((edge) => edge.target)
    .filter((id) => characterById.has(id))));
  const edgeByTarget = new Map(edges.map((edge) => [edge.target, edge]));
  const sortedRelatedIds = relatedIds.sort((first, second) => {
    const firstEdge = edgeByTarget.get(first);
    const secondEdge = edgeByTarget.get(second);
    const firstPriority = getCurrentTreePriority(characterById.get(first), firstEdge);
    const secondPriority = getCurrentTreePriority(characterById.get(second), secondEdge);
    if (firstPriority !== secondPriority) {
      return secondPriority - firstPriority;
    }
    return (characterById.get(first)?.name ?? "").localeCompare(characterById.get(second)?.name ?? "", "zh-Hans-CN");
  });
  const branchCenterY = sortedRelatedIds.length <= 1
    ? CANVAS_HEIGHT / 2
    : CURRENT_BRANCH_Y_START + ((sortedRelatedIds.length - 1) * CURRENT_BRANCH_Y_GAP) / 2;
  const layout = new Map<string, { x: number; y: number }>();

  if (characterById.has(selectedCharacterId)) {
    layout.set(selectedCharacterId, {
      x: CURRENT_ROOT_X,
      y: branchCenterY,
    });
  }

  sortedRelatedIds.forEach((characterId, index) => {
    layout.set(characterId, {
      x: CURRENT_BRANCH_X,
      y: sortedRelatedIds.length <= 1
        ? CANVAS_HEIGHT / 2
        : CURRENT_BRANCH_Y_START + index * CURRENT_BRANCH_Y_GAP,
    });
  });

  const orphanCharacters = characters.filter((character) => !layout.has(character.id));
  orphanCharacters.forEach((character, index) => {
    layout.set(character.id, {
      x: CURRENT_BRANCH_X,
      y: CURRENT_BRANCH_Y_START + (sortedRelatedIds.length + index) * CURRENT_BRANCH_Y_GAP,
    });
  });

  return layout;
}

function getCurrentTreePriority(character: Character | undefined, edge: RelationshipGraphEdge | undefined): number {
  let priority = edge?.weight ?? 0;
  if (edge?.isHighTension) {
    priority += 5;
  }
  if (edge?.isDynamic) {
    priority += 4;
  }
  if (character && isProtagonistCharacter(character)) {
    priority += 3;
  }
  if (character?.castRole === "antagonist" || character?.castRole === "pressure_source") {
    priority += 2;
  }
  if (character?.castRole === "ally" || character?.castRole === "mentor") {
    priority += 1;
  }
  return priority;
}

function computeGraphLayout(
  characters: Character[],
  edges: RelationshipGraphEdge[],
  protagonistId: string,
) {
  const radius = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.34;
  const layoutHeight = Math.max(CANVAS_HEIGHT, 160 + Math.ceil(Math.max(characters.length, 1) / 2) * (GRAPH_CARD_HEIGHT + GRAPH_CARD_GAP_Y));
  const nodes: ForceNode[] = characters.map((character, index) => {
    if (character.id === protagonistId) {
      return {
        id: character.id,
        x: CANVAS_WIDTH / 2,
        y: layoutHeight / 2,
        fx: CANVAS_WIDTH / 2,
        fy: layoutHeight / 2,
      };
    }
    const angle = (Math.PI * 2 * index) / Math.max(characters.length, 1);
    return {
      id: character.id,
      x: CANVAS_WIDTH / 2 + radius * Math.cos(angle),
      y: layoutHeight / 2 + radius * Math.sin(angle),
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
    .force("collide", forceCollide<ForceNode>().radius(118).strength(0.92))
    .force("center", forceCenter(CANVAS_WIDTH / 2, layoutHeight / 2).strength(0.08))
    .stop()
    .tick(180);

  const safeNodes = resolveRectangularNodeCollisions(nodes, protagonistId, layoutHeight);
  return new Map(nodes.map((node) => [
    node.id,
    {
      x: safeNodes.get(node.id)?.x ?? clamp(node.x, GRAPH_CARD_WIDTH / 2 + 28, CANVAS_WIDTH - GRAPH_CARD_WIDTH / 2 - 28),
      y: safeNodes.get(node.id)?.y ?? clamp(node.y, GRAPH_CARD_HEIGHT / 2 + 28, layoutHeight - GRAPH_CARD_HEIGHT / 2 - 28),
    },
  ]));
}

function resolveRectangularNodeCollisions(
  inputNodes: ForceNode[],
  protagonistId: string,
  initialLayoutHeight: number,
) {
  const nodes = inputNodes.map((node) => ({
    ...node,
    x: clamp(node.x, GRAPH_CARD_WIDTH / 2 + 28, CANVAS_WIDTH - GRAPH_CARD_WIDTH / 2 - 28),
    y: clamp(node.y, GRAPH_CARD_HEIGHT / 2 + 28, initialLayoutHeight - GRAPH_CARD_HEIGHT / 2 - 28),
  }));
  let layoutHeight = initialLayoutHeight;
  const minCenterX = GRAPH_CARD_WIDTH + GRAPH_CARD_GAP_X;
  const minCenterY = GRAPH_CARD_HEIGHT + GRAPH_CARD_GAP_Y;
  const minX = GRAPH_CARD_WIDTH / 2 + 28;
  const maxX = CANVAS_WIDTH - GRAPH_CARD_WIDTH / 2 - 28;
  const minY = GRAPH_CARD_HEIGHT / 2 + 28;

  for (let iteration = 0; iteration < 160; iteration += 1) {
    let moved = false;
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const first = nodes[firstIndex];
        const second = nodes[secondIndex];
        const deltaX = second.x - first.x;
        const deltaY = second.y - first.y;
        const overlapX = minCenterX - Math.abs(deltaX);
        const overlapY = minCenterY - Math.abs(deltaY);
        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        const firstPinned = first.id === protagonistId;
        const secondPinned = second.id === protagonistId;
        const pushOnX = overlapX < overlapY;
        const direction = pushOnX
          ? (deltaX >= 0 ? 1 : -1)
          : (deltaY >= 0 ? 1 : -1);
        const push = (pushOnX ? overlapX : overlapY) + 12;

        if (firstPinned && secondPinned) {
          continue;
        }
        if (firstPinned || secondPinned) {
          const nodeToMove = firstPinned ? second : first;
          const signedPush = firstPinned ? direction * push : -direction * push;
          if (pushOnX) {
            nodeToMove.x += signedPush;
          } else {
            nodeToMove.y += signedPush;
          }
        } else if (pushOnX) {
          first.x -= direction * push * 0.5;
          second.x += direction * push * 0.5;
        } else {
          first.y -= direction * push * 0.5;
          second.y += direction * push * 0.5;
        }
        moved = true;
      }
    }

    for (const node of nodes) {
      layoutHeight = Math.max(layoutHeight, node.y + GRAPH_CARD_HEIGHT / 2 + 56);
      node.x = clamp(node.x, minX, maxX);
      node.y = clamp(node.y, minY, layoutHeight - GRAPH_CARD_HEIGHT / 2 - 28);
    }
    if (!moved) {
      break;
    }
  }

  return new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
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
