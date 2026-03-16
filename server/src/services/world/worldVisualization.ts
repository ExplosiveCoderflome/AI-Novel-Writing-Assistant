import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { World as PrismaWorld } from "@prisma/client";
import type { WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { getLLM } from "../../llm/factory";

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
>;

interface VisualizationDraft {
  factionGraph?: {
    nodes?: Array<{ id?: string; label?: string; type?: string }>;
    edges?: Array<{ source?: string; target?: string; relation?: string }>;
  };
  powerTree?: Array<{ level?: string; description?: string }>;
  geographyMap?: {
    nodes?: Array<{ id?: string; label?: string }>;
    edges?: Array<{ source?: string; target?: string; relation?: string }>;
  };
  timeline?: Array<{ year?: string; event?: string }>;
}

const MAX_FACTION_NODES = 12;
const MAX_FACTION_EDGES = 18;
const MAX_GEO_NODES = 10;
const MAX_TIMELINE_ITEMS = 12;
const MAX_POWER_ITEMS = 8;

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
  if (/(军|军队|部队|军团|旅|团|司令部|地下党|组织|协会|会|盟|帮|派|社|教团)/.test(label)) {
    return "organization";
  }
  if (/(族|族群|民族|人|裔)/.test(label)) {
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
    .map((label, index) => ({ id: makeId("geo", index), label }));

  const edges = geoSeeds.slice(1).map((node, index) => ({
    source: geoSeeds[index]?.id ?? geoSeeds[0].id,
    target: node.id,
    relation: "相邻",
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
    const llm = await getLLM("deepseek", {
      temperature: 0.2,
      taskType: "planner",
    });
    const result = await llm.invoke([
      new SystemMessage(
        `你是世界观可视化抽取器。请严格输出 JSON 对象，结构为：
{
  "factionGraph": {
    "nodes": [{"id":"faction-1","label":"...","type":"state|faction|race|organization|other"}],
    "edges": [{"source":"faction-1","target":"faction-2","relation":"同盟|合作|支援|对抗|敌对|统属|压制|贸易|竞争|中立|关联"}]
  },
  "powerTree": [{"level":"L1","description":"..."}],
  "geographyMap": {
    "nodes": [{"id":"geo-1","label":"..."}],
    "edges": [{"source":"geo-1","target":"geo-2","relation":"相邻|通道|隔绝|控制"}]
  },
  "timeline": [{"year":"...","event":"..."}]
}
要求：
1. 只抽取文本里明确存在或强可推断的信息，不要编造。
2. factionGraph 必须优先反映真实势力关系，不要用泛化的 interaction。
3. 所有 label、relation、description、event 必须使用简体中文。
4. 节点数量控制在 4-12 个，优先核心势力。`,
      ),
      new HumanMessage(buildVisualizationPrompt(world)),
    ]);
    return safeParseJSON<VisualizationDraft | null>(extractJSONObject(String(result.content)), null);
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

  const geographyNodes = normalizeGraphNodes(
    (draft?.geographyMap?.nodes ?? fallback.geographyMap.nodes).map((node) => ({
      id: node.id,
      label: node.label,
      type: "other",
    })),
    "geo",
  )
    .map((node) => ({ id: node.id, label: node.label }))
    .slice(0, MAX_GEO_NODES);
  const geographyEdges = normalizeGraphEdges(
    (draft?.geographyMap?.edges ?? []).map((edge) => ({
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
    })),
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
  const fallback = buildFallbackWorldVisualizationPayload(world);
  const draft = await tryBuildWorldVisualizationWithLLM(world);
  return sanitizeVisualizationPayload(world, draft, fallback);
}
