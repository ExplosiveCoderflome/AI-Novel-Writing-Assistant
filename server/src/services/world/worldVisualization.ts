import type { World as PrismaWorld } from "@prisma/client";
import type {
  WorldGeographyDirection,
  WorldGeographyMapEdge,
  WorldGeographyMapNode,
  WorldGeographyRegionType,
  WorldGeographyRouteType,
  WorldVisualizationPayload,
} from "@ai-novel/shared/types/world";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { worldVisualizationPrompt } from "../../prompting/prompts/world/world.prompts";
import {
  buildWorldBindingSupport,
  parseWorldStructurePayload,
} from "./worldStructure";

type FactionNodeType = "state" | "faction" | "race" | "organization" | "other";

type VisualizationSource = Pick<
  PrismaWorld,
  | "id"
  | "name"
  | "worldType"
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions"
  | "structureJson"
  | "bindingSupportJson"
>;

interface VisualizationDraft {
  factionGraph?: {
    nodes?: Array<{ id?: string; label?: string; type?: string }>;
    edges?: Array<{ source?: string; target?: string; relation?: string }>;
  };
  powerTree?: Array<{ level?: string; description?: string }>;
  geographyMap?: {
    nodes?: Array<{
      id?: string;
      label?: string;
      x?: number;
      y?: number;
      directionHint?: string;
      regionType?: string;
      terrain?: string;
      summary?: string;
      parentId?: string | null;
      controllingForceIds?: string[];
      risk?: string;
      storyRelevance?: string;
    }>;
    edges?: Array<{
      source?: string;
      target?: string;
      relation?: string;
      routeType?: string;
      distanceHint?: string;
      direction?: string;
      risk?: string;
    }>;
  };
  timeline?: Array<{ year?: string; event?: string }>;
}

type GeographyNodeInput = {
  id?: string;
  label?: string;
  x?: number;
  y?: number;
  directionHint?: unknown;
  regionType?: unknown;
  terrain?: unknown;
  summary?: unknown;
  parentId?: unknown;
  controllingForceIds?: unknown;
  risk?: unknown;
  storyRelevance?: unknown;
};

type GeographyEdgeInput = {
  source?: unknown;
  target?: unknown;
  relation?: unknown;
  routeType?: unknown;
  distanceHint?: unknown;
  direction?: unknown;
  risk?: unknown;
};

const MAX_FACTION_NODES = 12;
const MAX_FACTION_EDGES = 18;
const MAX_GEO_NODES = 10;
const MAX_TIMELINE_ITEMS = 12;
const MAX_POWER_ITEMS = 8;

const GEO_DIRECTIONS = new Set<WorldGeographyDirection>([
  "north",
  "south",
  "east",
  "west",
  "center",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
]);

const GEO_REGION_TYPES = new Set<WorldGeographyRegionType>([
  "continent",
  "country",
  "region",
  "city",
  "landmark",
  "border",
  "route",
  "other",
]);

const GEO_ROUTE_TYPES = new Set<WorldGeographyRouteType>([
  "road",
  "river",
  "sea",
  "portal",
  "trade",
  "military",
  "border",
  "other",
]);

const DIRECTION_COORDINATES: Record<WorldGeographyDirection, { x: number; y: number }> = {
  north: { x: 50, y: 18 },
  south: { x: 50, y: 82 },
  east: { x: 82, y: 50 },
  west: { x: 18, y: 50 },
  center: { x: 50, y: 50 },
  northeast: { x: 76, y: 24 },
  northwest: { x: 24, y: 24 },
  southeast: { x: 76, y: 76 },
  southwest: { x: 24, y: 76 },
};

const FACTION_TYPE_ALIASES: Record<string, FactionNodeType> = {
  state: "state",
  country: "state",
  kingdom: "state",
  empire: "state",
  republic: "state",
  federation: "state",
  government: "state",
  "国家": "state",
  "政权": "state",
  "政府": "state",
  faction: "faction",
  force: "faction",
  camp: "faction",
  "势力": "faction",
  "阵营": "faction",
  race: "race",
  tribe: "race",
  species: "race",
  "种族": "race",
  "族群": "race",
  "民族": "race",
  organization: "organization",
  org: "organization",
  army: "organization",
  party: "organization",
  group: "organization",
  guild: "organization",
  "组织": "organization",
  "公司": "organization",
  "企业": "organization",
  "部门": "organization",
  "机构": "organization",
  "社群": "organization",
  "圈层": "organization",
  "家庭共同体": "organization",
  "社区组织": "organization",
  "中介机构": "organization",
  "机关": "organization",
  "军队": "organization",
  "部队": "organization",
  "军团": "organization",
  "地下组织": "organization",
  other: "other",
  "其他": "other",
};

const EDGE_RELATION_LABELS = [
  "同盟",
  "合作",
  "支援",
  "对抗",
  "敌对",
  "统属",
  "压制",
  "贸易",
  "竞争",
  "中立",
  "关联",
] as const;

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON object.");
  }
  return text.slice(first, last + 1);
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeAliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_\-:/\\|（）()【】\[\]·、，,。.!?？：:]/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function splitIntoLines(source: string): string[] {
  return source
    .split(/[\n;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitIntoSentences(source: string): string[] {
  return source
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseListFromText(content: string, fallback: string[]): string[] {
  const parsed = content
    .split(/[\n,，;；]/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function normalizeNodeLabel(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim().replace(/^[-*]\s*/, "");
}

function inferFactionNodeType(label: string): FactionNodeType {
  const normalized = normalizeAliasKey(label);
  const alias = FACTION_TYPE_ALIASES[normalized];
  if (alias) {
    return alias;
  }
  if (/(国家|政府|政权|王朝|王国|帝国|联邦|共和国|朝廷|官府|军阀)/.test(label)) {
    return "state";
  }
  if (/(公司|集团|企业|部门|机构|中介|物业|学校|医院|机关|家庭联盟|共同体|社群|圈|圈层|军|军队|部队|军团|旅|团|司令部|地下党|组织|协会|会|盟|帮|派|社|教团)/.test(label)) {
    return "organization";
  }
  if (/(族|族群|民族|裔)/.test(label)) {
    return "race";
  }
  if (/(势力|阵营|集团|同盟|联盟)/.test(label)) {
    return "faction";
  }
  if (/(state|kingdom|empire|republic|federation|government)/i.test(label)) {
    return "state";
  }
  if (/(army|organization|guild|party|group)/i.test(label)) {
    return "organization";
  }
  if (/(race|tribe|clan)/i.test(label)) {
    return "race";
  }
  return "faction";
}

function normalizeNodeType(raw: unknown, label: string): FactionNodeType {
  if (typeof raw === "string") {
    const alias = FACTION_TYPE_ALIASES[normalizeAliasKey(raw)];
    if (alias) {
      return alias;
    }
    if (/(公司|企业|部门|机构|社群|圈层|家庭共同体|社区组织|中介机构|机关|生活社群|兴趣联盟|地缘势力)/.test(raw)) {
      return "organization";
    }
    if (/(临时联盟|人物|角色|情感|关系线)/.test(raw)) {
      return "other";
    }
  }
  return inferFactionNodeType(label);
}

function normalizeEdgeRelation(raw: unknown, sentence?: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value) {
    if (EDGE_RELATION_LABELS.includes(value as (typeof EDGE_RELATION_LABELS)[number])) {
      return value;
    }
    const normalized = normalizeAliasKey(value);
    if (/(alliance|ally|同盟|联合|联手)/.test(normalized)) {
      return "同盟";
    }
    if (/(cooperate|合作|协作|配合)/.test(normalized)) {
      return "合作";
    }
    if (/(support|援助|支援)/.test(normalized)) {
      return "支援";
    }
    if (/(conflict|对抗|敌对|交战|围剿|镇压)/.test(normalized)) {
      return "对抗";
    }
    if (/(trade|交易|贸易)/.test(normalized)) {
      return "贸易";
    }
    if (/(subordinate|统属|隶属|管辖|控制)/.test(normalized)) {
      return "统属";
    }
    if (/(rival|竞争|争夺)/.test(normalized)) {
      return "竞争";
    }
  }
  if (!sentence) {
    return "关联";
  }
  if (/同盟|联合|联手|结盟/.test(sentence)) {
    return "同盟";
  }
  if (/合作|协作|配合|联合抗敌|共同/.test(sentence)) {
    return "合作";
  }
  if (/支援|援助|接应|策应/.test(sentence)) {
    return "支援";
  }
  if (/敌对|对抗|冲突|围剿|镇压|交战|打击|进攻|压迫/.test(sentence)) {
    return "对抗";
  }
  if (/隶属|统辖|控制|管辖|附属/.test(sentence)) {
    return "统属";
  }
  if (/贸易|交易|输送|通商/.test(sentence)) {
    return "贸易";
  }
  if (/竞争|争夺|角力/.test(sentence)) {
    return "竞争";
  }
  return "关联";
}

function clampMapCoordinate(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDirection(raw: unknown): WorldGeographyDirection | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const normalized = normalizeAliasKey(raw);
  const aliases: Record<string, WorldGeographyDirection> = {
    north: "north",
    北: "north",
    北方: "north",
    北部: "north",
    south: "south",
    南: "south",
    南方: "south",
    南部: "south",
    east: "east",
    东: "east",
    东方: "east",
    东部: "east",
    west: "west",
    西: "west",
    西方: "west",
    西部: "west",
    center: "center",
    central: "center",
    中: "center",
    中央: "center",
    中部: "center",
    核心: "center",
    northeast: "northeast",
    东北: "northeast",
    northwest: "northwest",
    西北: "northwest",
    southeast: "southeast",
    东南: "southeast",
    southwest: "southwest",
    西南: "southwest",
  };
  const alias = aliases[normalized];
  return alias && GEO_DIRECTIONS.has(alias) ? alias : undefined;
}

function inferDirectionFromText(text: string, index: number): WorldGeographyDirection {
  if (/东北|北东/.test(text)) {
    return "northeast";
  }
  if (/西北|北西/.test(text)) {
    return "northwest";
  }
  if (/东南|南东/.test(text)) {
    return "southeast";
  }
  if (/西南|南西/.test(text)) {
    return "southwest";
  }
  if (/北方|北部|北境|北岸|北线|冰原|雪原/.test(text)) {
    return "north";
  }
  if (/南方|南部|南境|南岸|南线|雨林|热带/.test(text)) {
    return "south";
  }
  if (/东方|东部|东境|东岸|东线|海港|港口|海岸/.test(text)) {
    return "east";
  }
  if (/西方|西部|西境|西岸|西线|荒漠|沙漠/.test(text)) {
    return "west";
  }
  if (/中心|中央|王城|帝都|首都|核心|腹地|内城/.test(text)) {
    return "center";
  }
  const sequence: WorldGeographyDirection[] = [
    "center",
    "north",
    "east",
    "south",
    "west",
    "northeast",
    "southwest",
    "northwest",
    "southeast",
  ];
  return sequence[index % sequence.length] ?? "center";
}

function offsetCoordinate(base: { x: number; y: number }, index: number): { x: number; y: number } {
  const ringOffsets = [
    { x: 0, y: 0 },
    { x: 6, y: -5 },
    { x: -6, y: 5 },
    { x: 8, y: 6 },
    { x: -8, y: -6 },
  ];
  const offset = ringOffsets[index % ringOffsets.length] ?? ringOffsets[0];
  return {
    x: Math.max(8, Math.min(92, base.x + offset.x)),
    y: Math.max(8, Math.min(92, base.y + offset.y)),
  };
}

function inferRegionType(text: string): WorldGeographyRegionType {
  if (/大陆|洲|陆/.test(text)) {
    return "continent";
  }
  if (/国|王朝|王国|帝国|联邦|共和国|领/.test(text)) {
    return "country";
  }
  if (/城|都|镇|港|堡|关/.test(text)) {
    return "city";
  }
  if (/山|谷|河|湖|海|岛|林|原|漠|矿|塔|遗迹|神殿/.test(text)) {
    return "landmark";
  }
  if (/边境|边疆|边界|防线|封锁线/.test(text)) {
    return "border";
  }
  if (/路|道|航线|商道|铁路|河道/.test(text)) {
    return "route";
  }
  return "region";
}

function normalizeRegionType(raw: unknown, label: string): WorldGeographyRegionType {
  if (typeof raw === "string") {
    const normalized = normalizeAliasKey(raw);
    if (GEO_REGION_TYPES.has(normalized as WorldGeographyRegionType)) {
      return normalized as WorldGeographyRegionType;
    }
  }
  return inferRegionType(label);
}

function normalizeRouteType(raw: unknown, relation: string): WorldGeographyRouteType {
  if (typeof raw === "string") {
    const normalized = normalizeAliasKey(raw);
    if (GEO_ROUTE_TYPES.has(normalized as WorldGeographyRouteType)) {
      return normalized as WorldGeographyRouteType;
    }
    if (/路|road|道路/.test(normalized)) {
      return "road";
    }
    if (/river|河/.test(normalized)) {
      return "river";
    }
    if (/sea|海|航/.test(normalized)) {
      return "sea";
    }
    if (/portal|传送|门/.test(normalized)) {
      return "portal";
    }
    if (/trade|商|贸易/.test(normalized)) {
      return "trade";
    }
    if (/military|军|战/.test(normalized)) {
      return "military";
    }
    if (/border|边/.test(normalized)) {
      return "border";
    }
  }
  if (/控制|封锁|边境|边界/.test(relation)) {
    return "border";
  }
  if (/通道|道路|商道/.test(relation)) {
    return "road";
  }
  return "other";
}

function normalizeTextField(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function makeId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function normalizeGraphNodes(
  nodes: Array<{ id?: string; label?: string; type?: string }>,
  prefix: string,
): Array<{ id: string; label: string; type: string }> {
  const seenLabels = new Set<string>();
  const result: Array<{ id: string; label: string; type: string }> = [];
  for (const node of nodes) {
    const label = normalizeNodeLabel(node.label);
    if (!label || seenLabels.has(label)) {
      continue;
    }
    seenLabels.add(label);
    result.push({
      id: node.id?.trim() || makeId(prefix, result.length),
      label,
      type: normalizeNodeType(node.type, label),
    });
  }
  return result;
}

function normalizeGraphEdges(
  edges: Array<{ source?: string; target?: string; relation?: string }>,
  nodes: Array<{ id: string; label: string }>,
  fallbackEdges: Array<{ source: string; target: string; relation: string }>,
): Array<{ source: string; target: string; relation: string }> {
  const idMap = new Map(nodes.map((node) => [node.id, node.id]));
  const labelMap = new Map(nodes.map((node) => [node.label, node.id]));
  const seen = new Set<string>();
  const result: Array<{ source: string; target: string; relation: string }> = [];

  for (const edge of edges) {
    const sourceKey = typeof edge.source === "string" ? edge.source.trim() : "";
    const targetKey = typeof edge.target === "string" ? edge.target.trim() : "";
    const source = idMap.get(sourceKey) ?? labelMap.get(sourceKey);
    const target = idMap.get(targetKey) ?? labelMap.get(targetKey);
    if (!source || !target || source === target) {
      continue;
    }
    const pairKey = [source, target].sort().join("|");
    if (seen.has(pairKey)) {
      continue;
    }
    seen.add(pairKey);
    result.push({
      source,
      target,
      relation: normalizeEdgeRelation(edge.relation),
    });
  }

  if (result.length > 0) {
    return result.slice(0, MAX_FACTION_EDGES);
  }
  return fallbackEdges.slice(0, MAX_FACTION_EDGES);
}

function normalizeGeographyNodes(
  nodes: GeographyNodeInput[],
  fallbackNodes: WorldGeographyMapNode[],
): WorldGeographyMapNode[] {
  const seenLabels = new Set<string>();
  const result: WorldGeographyMapNode[] = [];
  for (const node of nodes) {
    const label = normalizeNodeLabel(node.label);
    if (!label || seenLabels.has(label)) {
      continue;
    }
    seenLabels.add(label);
    const directionHint = normalizeDirection(node.directionHint) ?? inferDirectionFromText(
      [label, node.terrain, node.summary, node.risk, node.storyRelevance].filter(Boolean).join(" "),
      result.length,
    );
    const basePoint = DIRECTION_COORDINATES[directionHint];
    const fallbackPoint = offsetCoordinate(basePoint, result.length);
    result.push({
      id: node.id?.trim() || makeId("geo", result.length),
      label,
      x: clampMapCoordinate(node.x) ?? fallbackPoint.x,
      y: clampMapCoordinate(node.y) ?? fallbackPoint.y,
      directionHint,
      regionType: normalizeRegionType(node.regionType, label),
      terrain: normalizeTextField(node.terrain),
      summary: normalizeTextField(node.summary),
      parentId: normalizeTextField(node.parentId) ?? null,
      controllingForceIds: Array.isArray(node.controllingForceIds)
        ? uniqueStrings(node.controllingForceIds.filter((item): item is string => typeof item === "string"))
        : undefined,
      risk: normalizeTextField(node.risk),
      storyRelevance: normalizeTextField(node.storyRelevance),
    });
  }
  return (result.length > 0 ? result : fallbackNodes).slice(0, MAX_GEO_NODES);
}

function normalizeGeographyEdges(
  edges: GeographyEdgeInput[],
  nodes: WorldGeographyMapNode[],
  fallbackEdges: WorldGeographyMapEdge[],
): WorldGeographyMapEdge[] {
  const idMap = new Map(nodes.map((node) => [node.id, node.id]));
  const labelMap = new Map(nodes.map((node) => [node.label, node.id]));
  const seen = new Set<string>();
  const result: WorldGeographyMapEdge[] = [];

  for (const edge of edges) {
    const sourceKey = typeof edge.source === "string" ? edge.source.trim() : "";
    const targetKey = typeof edge.target === "string" ? edge.target.trim() : "";
    const source = idMap.get(sourceKey) ?? labelMap.get(sourceKey);
    const target = idMap.get(targetKey) ?? labelMap.get(targetKey);
    if (!source || !target || source === target) {
      continue;
    }
    const pairKey = [source, target].sort().join("|");
    if (seen.has(pairKey)) {
      continue;
    }
    seen.add(pairKey);
    const relation = typeof edge.relation === "string" && edge.relation.trim()
      ? edge.relation.trim()
      : "相邻";
    result.push({
      source,
      target,
      relation,
      routeType: normalizeRouteType(edge.routeType, relation),
      distanceHint: normalizeTextField(edge.distanceHint),
      direction: normalizeDirection(edge.direction),
      risk: normalizeTextField(edge.risk),
    });
  }

  return (result.length > 0 ? result : fallbackEdges).slice(0, MAX_FACTION_EDGES);
}

function extractNamedEntities(
  source: string,
  matcher: RegExp,
  exclusions: Set<string>,
): string[] {
  const results: string[] = [];
  for (const match of source.matchAll(matcher)) {
    const value = match[0]?.trim();
    if (!value || exclusions.has(value)) {
      continue;
    }
    results.push(value);
  }
  return results;
}

function buildFactionLabels(world: VisualizationSource): string[] {
  const combined = [
    world.factions ?? "",
    world.politics ?? "",
    world.races ?? "",
    world.conflicts ?? "",
  ].filter(Boolean).join("\n");
  const exclusions = new Set([
    "核心冲突",
    "主要势力",
    "势力关系",
    "政治结构",
    "组织势力",
    "阵营关系",
    "社会结构",
  ]);
  const fromLists = parseListFromText(combined, []);
  const namedEntities = extractNamedEntities(
    combined,
    /[\u4E00-\u9FFF]{2,16}(?:政府|政权|王朝|王国|帝国|联邦|共和国|军|军队|部队|军团|旅|团|会|盟|帮|派|组织|教团|族|族群|民族)/g,
    exclusions,
  );
  return uniqueStrings([...fromLists, ...namedEntities]).slice(0, MAX_FACTION_NODES);
}

function buildFactionEdges(
  nodes: Array<{ id: string; label: string; type: string }>,
  world: VisualizationSource,
): Array<{ source: string; target: string; relation: string }> {
  const sentences = splitIntoSentences([
    world.politics ?? "",
    world.factions ?? "",
    world.conflicts ?? "",
    world.background ?? "",
  ].filter(Boolean).join("。"));
  const relationCounter = new Map<string, Map<string, number>>();

  for (const sentence of sentences) {
    const mentioned = nodes.filter((node) => sentence.includes(node.label));
    if (mentioned.length < 2) {
      continue;
    }
    const relation = normalizeEdgeRelation("", sentence);
    for (let i = 0; i < mentioned.length; i += 1) {
      for (let j = i + 1; j < mentioned.length; j += 1) {
        const left = mentioned[i];
        const right = mentioned[j];
        const key = [left.id, right.id].sort().join("|");
        const bucket = relationCounter.get(key) ?? new Map<string, number>();
        bucket.set(relation, (bucket.get(relation) ?? 0) + 1);
        relationCounter.set(key, bucket);
      }
    }
  }

  const edges = Array.from(relationCounter.entries())
    .map(([key, bucket]) => {
      const [source, target] = key.split("|");
      const relation = Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "关联";
      return { source, target, relation };
    })
    .slice(0, MAX_FACTION_EDGES);

  if (edges.length > 0) {
    return edges;
  }
  if (nodes.length <= 1) {
    return [];
  }
  const defaultRelation = world.conflicts?.trim() ? "对抗" : "关联";
  return nodes.slice(1).map((node) => ({
    source: nodes[0].id,
    target: node.id,
    relation: defaultRelation,
  }));
}

function buildGeographyMap(world: VisualizationSource): WorldVisualizationPayload["geographyMap"] {
  const geoSeeds = parseListFromText(
    [world.geography ?? "", world.background ?? ""].filter(Boolean).join("\n"),
    ["核心区域", "边境区域", "未知区域"],
  )
    .slice(0, MAX_GEO_NODES)
    .map((label, index) => {
      const directionHint = inferDirectionFromText(label, index);
      const point = offsetCoordinate(DIRECTION_COORDINATES[directionHint], index);
      return {
        id: makeId("geo", index),
        label,
        x: point.x,
        y: point.y,
        directionHint,
        regionType: inferRegionType(label),
      };
    });

  const edges = geoSeeds.slice(1).map((node, index) => ({
    source: geoSeeds[index]?.id ?? geoSeeds[0].id,
    target: node.id,
    relation: "相邻",
    routeType: "other" as const,
    direction: node.directionHint,
  }));

  return {
    nodes: geoSeeds,
    edges,
  };
}

function buildPowerTree(world: VisualizationSource): WorldVisualizationPayload["powerTree"] {
  return parseListFromText(world.magicSystem ?? world.technology ?? "", ["力量层级未明确"])
    .slice(0, MAX_POWER_ITEMS)
    .map((description, index) => ({
      level: `L${index + 1}`,
      description,
    }));
}

function buildStructuredWorldVisualizationPayload(world: VisualizationSource): WorldVisualizationPayload | null {
  const { structure, hasStructuredData } = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  if (!hasStructuredData) {
    return null;
  }

  const forceNodes = structure.forces.map((item) => ({
    id: item.id,
    label: item.name,
    type: normalizeNodeType(item.type, item.name),
  }));
  const factionNodes = structure.factions
    .filter((item) => !forceNodes.some((force) => force.label === item.name))
    .map((item) => ({
      id: item.id,
      label: item.name,
      type: "faction",
    }));
  const factionNodesMerged = [...forceNodes, ...factionNodes].slice(0, MAX_FACTION_NODES);
  const factionNodeIds = new Set(factionNodesMerged.map((item) => item.id));
  const factionEdges = structure.relations.forceRelations
    .filter((item) => factionNodeIds.has(item.sourceForceId) && factionNodeIds.has(item.targetForceId))
    .map((item) => ({
      source: item.sourceForceId,
      target: item.targetForceId,
      relation: item.relation || "关联",
    }))
    .slice(0, MAX_FACTION_EDGES);

  const geographyNodes = structure.locations
    .map((item, index) => {
      const directionHint = inferDirectionFromText(
        [item.name, item.terrain, item.summary, item.narrativeFunction, item.risk].join(" "),
        index,
      );
      const point = offsetCoordinate(DIRECTION_COORDINATES[directionHint], index);
      return {
        id: item.id,
        label: item.name,
        x: item.x ?? point.x,
        y: item.y ?? point.y,
        directionHint: item.directionHint ?? directionHint,
        regionType: inferRegionType([item.name, item.type, item.terrain].filter(Boolean).join(" ")),
        terrain: item.terrain || undefined,
        summary: item.summary || undefined,
        controllingForceIds: item.controllingForceIds,
        risk: item.risk || (item.riskLevel ? `风险等级 ${item.riskLevel}` : undefined),
        storyRelevance: item.storyRelevance || item.narrativeFunction || undefined,
      };
    })
    .slice(0, MAX_GEO_NODES);
  const geographyNodeIdSet = new Set(geographyNodes.map((item) => item.id));
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  const explicitLocationEdges = (structure.relations.locationConnections ?? [])
    .filter((item) => geographyNodeIdSet.has(item.sourceLocationId) && geographyNodeIdSet.has(item.targetLocationId))
    .map((item) => ({
      source: item.sourceLocationId,
      target: item.targetLocationId,
      relation: item.connectionType || "相邻",
      routeType: normalizeRouteType(item.connectionType, item.connectionType),
      distanceHint: item.distanceHint || undefined,
      risk: item.narrativeUse || undefined,
    }));
  const geographyEdges = explicitLocationEdges.length > 0 ? explicitLocationEdges : structure.relations.locationControls
    .filter((item) => geographyNodeIdSet.has(item.locationId))
    .reduce<WorldGeographyMapEdge[]>((acc, relation, index, list) => {
      const sibling = list.find(
        (candidate, siblingIndex) =>
          siblingIndex > index
          && candidate.forceId === relation.forceId
          && candidate.locationId !== relation.locationId
          && geographyNodeIdSet.has(candidate.locationId),
      );
      if (!sibling) {
        return acc;
      }
      acc.push({
        source: relation.locationId,
        target: sibling.locationId,
        relation: `${forceNameById.get(relation.forceId) ?? relation.forceId}${relation.relation ? `:${relation.relation}` : "控制"}`,
        routeType: "border",
      });
      return acc;
    }, [])
    .slice(0, MAX_FACTION_EDGES);

  const powerTree = (
    structure.rules.axioms.length > 0
      ? structure.rules.axioms.map((item, index) => ({
        level: `R${index + 1}`,
        description: [item.name, item.summary].filter(Boolean).join("："),
      }))
      : buildPowerTree(world)
  ).slice(0, MAX_POWER_ITEMS);

  const bindingSupport = buildWorldBindingSupport(structure);
  const timeline = bindingSupport.compatibleConflicts.length > 0
    ? bindingSupport.compatibleConflicts.slice(0, MAX_TIMELINE_ITEMS).map((item, index) => ({
      year: `阶段${index + 1}`,
      event: item,
    }))
    : buildTimeline(world);

  if (factionNodesMerged.length === 0 && geographyNodes.length === 0) {
    return null;
  }

  const fallback = buildFallbackWorldVisualizationPayload(world);
  const shouldUseFallbackFactions = factionNodesMerged.length === 0;
  const shouldUseFallbackGeography = geographyNodes.length === 0;

  return {
    worldId: world.id,
    factionGraph: {
      nodes: shouldUseFallbackFactions ? fallback.factionGraph.nodes : factionNodesMerged,
      edges: shouldUseFallbackFactions ? fallback.factionGraph.edges : factionEdges,
    },
    powerTree,
    geographyMap: {
      nodes: shouldUseFallbackGeography ? fallback.geographyMap.nodes : geographyNodes,
      edges: shouldUseFallbackGeography ? fallback.geographyMap.edges : geographyEdges,
    },
    timeline,
  };
}

function buildTimeline(world: VisualizationSource): WorldVisualizationPayload["timeline"] {
  return parseListFromText(world.history ?? "", ["当前历史脉络尚未明确"])
    .slice(0, MAX_TIMELINE_ITEMS)
    .map((event, index) => {
      const yearMatch = event.match(/\d{2,4}(?:年)?|民国\d+年|昭和\d+年|stage\s*\d+/i);
      return {
        year: yearMatch?.[0] ?? `阶段${index + 1}`,
        event,
      };
    });
}

export function buildFallbackWorldVisualizationPayload(world: VisualizationSource): WorldVisualizationPayload {
  const factionLabels = buildFactionLabels(world);
  const factionNodes = factionLabels.map((label, index) => ({
    id: makeId("faction", index),
    label,
    type: inferFactionNodeType(label),
  }));
  const factionEdges = buildFactionEdges(factionNodes, world);

  return {
    worldId: world.id,
    factionGraph: {
      nodes: factionNodes,
      edges: factionEdges,
    },
    powerTree: buildPowerTree(world),
    geographyMap: buildGeographyMap(world),
    timeline: buildTimeline(world),
  };
}

function buildVisualizationPrompt(world: VisualizationSource): string {
  return [
    `世界名：${world.name}`,
    `世界类型：${world.worldType ?? "custom"}`,
    `概述：${world.description ?? "无"}`,
    `背景：${world.background ?? "无"}`,
    `势力：${world.factions ?? "无"}`,
    `政治：${world.politics ?? "无"}`,
    `种族：${world.races ?? "无"}`,
    `地理：${world.geography ?? "无"}`,
    `历史：${world.history ?? "无"}`,
    `冲突：${world.conflicts ?? "无"}`,
    `力量/科技：${[world.magicSystem, world.technology].filter(Boolean).join("\n") || "无"}`,
  ].join("\n\n");
}

async function tryBuildWorldVisualizationWithLLM(
  world: VisualizationSource,
): Promise<VisualizationDraft | null> {
  try {
    const result = await runStructuredPrompt({
      asset: worldVisualizationPrompt,
      promptInput: {
        worldPromptSource: buildVisualizationPrompt(world),
      },
      options: {
        temperature: 0.2,
      },
    });
    return result.output;
  } catch {
    return null;
  }
}

function sanitizeVisualizationPayload(
  world: VisualizationSource,
  draft: VisualizationDraft | null,
  fallback: WorldVisualizationPayload,
): WorldVisualizationPayload {
  const factionNodes = normalizeGraphNodes(draft?.factionGraph?.nodes ?? fallback.factionGraph.nodes, "faction")
    .slice(0, MAX_FACTION_NODES);
  const factionEdges = normalizeGraphEdges(
    draft?.factionGraph?.edges ?? [],
    factionNodes,
    fallback.factionGraph.edges,
  );

  const geographyNodes = normalizeGeographyNodes(
    draft?.geographyMap?.nodes ?? fallback.geographyMap.nodes,
    fallback.geographyMap.nodes,
  );
  const geographyEdges = normalizeGeographyEdges(
    draft?.geographyMap?.edges ?? [],
    geographyNodes,
    fallback.geographyMap.edges,
  );

  const powerTree = (draft?.powerTree ?? fallback.powerTree)
    .map((item, index) => ({
      level: typeof item.level === "string" && item.level.trim() ? item.level.trim() : `L${index + 1}`,
      description: typeof item.description === "string" ? item.description.trim() : "",
    }))
    .filter((item) => item.description)
    .slice(0, MAX_POWER_ITEMS);

  const timeline = (draft?.timeline ?? fallback.timeline)
    .map((item, index) => ({
      year: typeof item.year === "string" && item.year.trim() ? item.year.trim() : `阶段${index + 1}`,
      event: typeof item.event === "string" ? item.event.trim() : "",
    }))
    .filter((item) => item.event)
    .slice(0, MAX_TIMELINE_ITEMS);

  return {
    worldId: world.id,
    factionGraph: {
      nodes: factionNodes.length > 0 ? factionNodes : fallback.factionGraph.nodes,
      edges: factionEdges,
    },
    powerTree: powerTree.length > 0 ? powerTree : fallback.powerTree,
    geographyMap: {
      nodes: geographyNodes.length > 0 ? geographyNodes : fallback.geographyMap.nodes,
      edges: geographyEdges,
    },
    timeline: timeline.length > 0 ? timeline : fallback.timeline,
  };
}

export async function buildWorldVisualizationPayload(world: VisualizationSource): Promise<WorldVisualizationPayload> {
  const structured = buildStructuredWorldVisualizationPayload(world);
  if (structured) {
    return structured;
  }
  const fallback = buildFallbackWorldVisualizationPayload(world);
  const draft = await tryBuildWorldVisualizationWithLLM(world);
  return sanitizeVisualizationPayload(world, draft, fallback);
}
