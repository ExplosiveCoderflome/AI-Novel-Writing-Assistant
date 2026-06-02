import type { World as PrismaWorld } from "@prisma/client";
import type {
  WorldBindingLocationCluster,
  WorldBindingSupport,
  WorldFaction,
  WorldForce,
  WorldForceRelation,
  WorldLocation,
  WorldLocationConnectionRelation,
  WorldLocationControlRelation,
  WorldProfile,
  WorldRule,
  WorldRules,
  WorldStructuredData,
  WorldStructureSectionKey,
} from "@ai-novel/shared/types/world";
import { parseWorldGenerationBlueprint } from "@ai-novel/shared/types/worldWizard";

export const WORLD_STRUCTURE_SCHEMA_VERSION = 1;

export type WorldStructureSource = Pick<
  PrismaWorld,
  | "id"
  | "name"
  | "worldType"
  | "description"
  | "overviewSummary"
  | "axioms"
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
  | "selectedElements"
  | "structureJson"
  | "bindingSupportJson"
  | "structureSchemaVersion"
>;

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeText(raw: unknown, fallback = ""): string {
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeText(item)).filter(Boolean).join(" / ");
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["summary", "description", "content", "text", "value", "name", "title", "label"]) {
      const value = normalizeText(record[key]);
      if (value) {
        return value;
      }
    }
  }
  return fallback;
}

function normalizeStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((item) => normalizeText(item)).filter(Boolean)));
  }
  if (typeof raw === "string") {
    return Array.from(
      new Set(
        raw
          .split(/[\n,，;；]/)
          .map((item) => item.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean),
      ),
    );
  }
  return [];
}

function normalizeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "item";
}

function makeId(prefix: string, index: number, preferred?: string): string {
  const suffix = preferred ? slugify(preferred) : String(index + 1);
  return `${prefix}-${suffix}`;
}

function parseListText(raw: string | null | undefined): string[] {
  return normalizeStringArray(raw ?? "");
}

function parseLegacyJSON(raw: string | null | undefined): unknown {
  return safeParseJSON<unknown>(raw, null);
}

function parseLegacyArray(raw: string | null | undefined, preferredKeys: string[] = []): unknown[] | null {
  const parsed = parseLegacyJSON(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  const record = normalizeRecord(parsed);
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function parseLegacyObject(raw: string | null | undefined): Record<string, unknown> {
  return normalizeRecord(parseLegacyJSON(raw));
}

function parseAxiomStrings(raw: string | null | undefined): string[] {
  const parsed = safeParseJSON<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return parseListText(raw);
}

function buildRuleFromText(text: string, index: number): WorldRule {
  const normalized = text.trim();
  const [name, summary] = normalized.split(/[：:]/, 2);
  return {
    id: makeId("rule", index, name || normalized),
    name: (summary ? name : `规则 ${index + 1}`).trim(),
    summary: (summary ?? normalized).trim(),
    cost: "",
    boundary: "",
    enforcement: "",
  };
}

export function buildStructuredRulesFromAxiomTexts(axiomTexts: string[]): WorldRule[] {
  return axiomTexts
    .map((text, index) => buildRuleFromText(text, index))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.name === item.name) === index);
}

export function createEmptyWorldProfile(): WorldProfile {
  return {
    summary: "",
    identity: "",
    tone: "",
    themes: [],
    coreConflict: "",
  };
}

export function createEmptyWorldRules(): WorldRules {
  return {
    summary: "",
    axioms: [],
    taboo: [],
    sharedConsequences: [],
  };
}

export function createEmptyWorldRelations() {
  return {
    forceRelations: [] as WorldForceRelation[],
    locationControls: [] as WorldLocationControlRelation[],
    locationConnections: [] as WorldLocationConnectionRelation[],
  };
}

export function createEmptyWorldStructure(): WorldStructuredData {
  return {
    profile: createEmptyWorldProfile(),
    rules: createEmptyWorldRules(),
    factions: [],
    forces: [],
    locations: [],
    relations: createEmptyWorldRelations(),
    metadata: {
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: "empty",
      lastBackfilledAt: null,
      lastGeneratedAt: null,
      lastSectionGenerated: null,
    },
  };
}

export function createEmptyWorldBindingSupport(): WorldBindingSupport {
  return {
    recommendedEntryPoints: [],
    highPressureForces: [],
    suggestedLocationClusters: [],
    compatibleConflicts: [],
    forbiddenCombinations: [],
  };
}

function normalizeProfile(raw: unknown, fallback: WorldProfile): WorldProfile {
  const record = normalizeRecord(raw);
  return {
    summary: normalizeText(record.summary ?? record.description, fallback.summary),
    identity: normalizeText(record.identity ?? record.worldIdentity, fallback.identity),
    tone: normalizeText(record.tone ?? record.mood, fallback.tone),
    themes: normalizeStringArray(record.themes ?? record.keywords).slice(0, 8),
    coreConflict: normalizeText(record.coreConflict ?? record.conflict, fallback.coreConflict),
  };
}

function normalizeRules(raw: unknown, fallback: WorldRules): WorldRules {
  const record = normalizeRecord(raw);
  const axiomsSource = Array.isArray(record.axioms)
    ? record.axioms
    : Array.isArray(record.rules)
      ? record.rules
      : [];
  const axioms = axiomsSource
    .map((item, index) => {
      if (typeof item === "string") {
        return buildRuleFromText(item, index);
      }
      const row = normalizeRecord(item);
      const name = normalizeText(row.name ?? row.title ?? row.rule, "");
      const summary = normalizeText(row.summary ?? row.description ?? row.content, "");
      const id = normalizeText(row.id, "") || makeId("rule", index, name || summary || `rule-${index + 1}`);
      if (!name && !summary) {
        return null;
      }
      return {
        id,
        name: name || `规则 ${index + 1}`,
        summary: summary || name,
        cost: normalizeText(row.cost),
        boundary: normalizeText(row.boundary ?? row.limit),
        enforcement: normalizeText(row.enforcement ?? row.consequence),
      } satisfies WorldRule;
    })
    .filter((item): item is WorldRule => Boolean(item));

  return {
    summary: normalizeText(record.summary ?? record.description, fallback.summary),
    axioms,
    taboo: normalizeStringArray(record.taboo ?? record.taboos),
    sharedConsequences: normalizeStringArray(record.sharedConsequences ?? record.consequences),
  };
}

function normalizeFaction(raw: unknown, index: number): WorldFaction | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    return {
      id: makeId("faction", index, value),
      name: value,
      position: "",
      doctrine: "",
      goals: [],
      methods: [],
      representativeForceIds: [],
    };
  }
  const record = normalizeRecord(raw);
  const name = normalizeText(record.name ?? record.title ?? record.label);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("faction", index, name),
    name,
    position: normalizeText(record.position ?? record.stance),
    doctrine: normalizeText(record.doctrine ?? record.summary ?? record.description),
    goals: normalizeStringArray(record.goals ?? record.objectives),
    methods: normalizeStringArray(record.methods),
    representativeForceIds: normalizeStringArray(record.representativeForceIds ?? record.forceIds),
  };
}

function normalizeForce(raw: unknown, index: number): WorldForce | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    return {
      id: makeId("force", index, value),
      name: value,
    type: "",
    factionId: null,
    role: null,
    resources: [],
    controlledLocationIds: [],
    summary: "",
      baseOfPower: "",
      currentObjective: "",
      pressure: "",
      leader: null,
      narrativeRole: "",
    };
  }
  const record = normalizeRecord(raw);
  const name = normalizeText(record.name ?? record.title ?? record.label);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("force", index, name),
    name,
    type: normalizeText(record.type ?? record.category),
    factionId: normalizeText(record.factionId ?? record.faction) || null,
    role: normalizeText(record.role) || null,
    resources: normalizeStringArray(record.resources),
    controlledLocationIds: normalizeStringArray(record.controlledLocationIds ?? record.locationIds),
    summary: normalizeText(record.summary ?? record.description),
    baseOfPower: normalizeText(record.baseOfPower ?? record.powerBase),
    currentObjective: normalizeText(record.currentObjective ?? record.goal),
    pressure: normalizeText(record.pressure ?? record.tension),
    leader: normalizeText(record.leader) || null,
    narrativeRole: normalizeText(record.narrativeRole ?? record.role),
  };
}

function normalizeLocation(raw: unknown, index: number): WorldLocation | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    return {
      id: makeId("location", index, value),
      name: value,
      type: null,
      region: null,
      terrain: "",
      summary: "",
      narrativeFunction: "",
      risk: "",
      riskLevel: undefined,
      storyRelevance: "",
      entryConstraint: "",
      exitCost: "",
      controllingForceIds: [],
    };
  }
  const record = normalizeRecord(raw);
  const name = normalizeText(record.name ?? record.title ?? record.label);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("location", index, name),
    name,
    type: normalizeText(record.type ?? record.category) || null,
    region: normalizeText(record.region) || null,
    x: normalizeMapCoordinate(record.x),
    y: normalizeMapCoordinate(record.y),
    directionHint: normalizeGeographyDirection(record.directionHint ?? record.direction),
    terrain: normalizeText(record.terrain ?? record.type ?? record.category),
    summary: normalizeText(record.summary ?? record.description),
    narrativeFunction: normalizeText(record.narrativeFunction ?? record.function),
    risk: normalizeText(record.risk ?? record.danger),
    riskLevel: normalizeRiskLevel(record.riskLevel),
    storyRelevance: normalizeText(record.storyRelevance) || normalizeText(record.narrativeFunction ?? record.function),
    entryConstraint: normalizeText(record.entryConstraint ?? record.access),
    exitCost: normalizeText(record.exitCost ?? record.leaveCost),
    controllingForceIds: normalizeStringArray(record.controllingForceIds ?? record.forceIds),
  };
}

function normalizeMapCoordinate(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizeRiskLevel(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return Math.max(1, Math.min(5, Math.round(raw)));
}

function normalizeGeographyDirection(raw: unknown): WorldLocation["directionHint"] {
  if (typeof raw !== "string") {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  const aliases: Record<string, WorldLocation["directionHint"]> = {
    north: "north",
    "北": "north",
    "北方": "north",
    south: "south",
    "南": "south",
    "南方": "south",
    east: "east",
    "东": "east",
    "东方": "east",
    west: "west",
    "西": "west",
    "西方": "west",
    center: "center",
    "中": "center",
    "中央": "center",
    northeast: "northeast",
    "东北": "northeast",
    northwest: "northwest",
    "西北": "northwest",
    southeast: "southeast",
    "东南": "southeast",
    southwest: "southwest",
    "西南": "southwest",
  };
  return aliases[normalized];
}

function normalizeForceRelation(raw: unknown, index: number): WorldForceRelation | null {
  const record = normalizeRecord(raw);
  const sourceForceId = normalizeText(record.sourceForceId ?? record.source ?? record.from);
  const targetForceId = normalizeText(record.targetForceId ?? record.target ?? record.to);
  if (!sourceForceId || !targetForceId || sourceForceId === targetForceId) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("force-relation", index, `${sourceForceId}-${targetForceId}`),
    sourceForceId,
    targetForceId,
    relation: normalizeText(record.relation ?? record.type, "关联"),
    tension: normalizeText(record.tension ?? record.pressure),
    detail: normalizeText(record.detail ?? record.summary ?? record.description),
  };
}

function normalizeLocationControl(raw: unknown, index: number): WorldLocationControlRelation | null {
  const record = normalizeRecord(raw);
  const forceId = normalizeText(record.forceId ?? record.sourceForceId ?? record.force);
  const locationId = normalizeText(record.locationId ?? record.targetLocationId ?? record.location);
  if (!forceId || !locationId) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("location-control", index, `${forceId}-${locationId}`),
    forceId,
    locationId,
    relation: normalizeText(record.relation ?? record.type, "控制"),
    detail: normalizeText(record.detail ?? record.summary ?? record.description),
  };
}

function normalizeLocationConnection(raw: unknown, index: number): WorldLocationConnectionRelation | null {
  const record = normalizeRecord(raw);
  const sourceLocationId = normalizeText(record.sourceLocationId ?? record.source ?? record.from);
  const targetLocationId = normalizeText(record.targetLocationId ?? record.target ?? record.to);
  if (!sourceLocationId || !targetLocationId || sourceLocationId === targetLocationId) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("location-connection", index, `${sourceLocationId}-${targetLocationId}`),
    sourceLocationId,
    targetLocationId,
    connectionType: normalizeText(record.connectionType ?? record.type ?? record.relation, "道路"),
    distanceHint: normalizeText(record.distanceHint ?? record.distance),
    narrativeUse: normalizeText(record.narrativeUse ?? record.detail ?? record.summary ?? record.description),
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function normalizeLocationClusters(raw: unknown): WorldBindingLocationCluster[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, index) => {
      const record = normalizeRecord(item);
      const label = normalizeText(record.label ?? record.name ?? record.title);
      if (!label) {
        return null;
      }
      return {
        id: normalizeText(record.id) || makeId("cluster", index, label),
        label,
        locationIds: normalizeStringArray(record.locationIds ?? record.locations),
        reason: normalizeText(record.reason ?? record.summary ?? record.description),
      } satisfies WorldBindingLocationCluster;
    })
    .filter((item): item is WorldBindingLocationCluster => Boolean(item));
}

export function normalizeWorldBindingSupport(
  raw: unknown,
  fallback = createEmptyWorldBindingSupport(),
): WorldBindingSupport {
  const record = normalizeRecord(raw);
  return {
    recommendedEntryPoints: normalizeStringArray(
      record.recommendedEntryPoints ?? fallback.recommendedEntryPoints,
    ).slice(0, 6),
    highPressureForces: normalizeStringArray(
      record.highPressureForces ?? fallback.highPressureForces,
    ).slice(0, 6),
    suggestedLocationClusters: normalizeLocationClusters(
      record.suggestedLocationClusters ?? fallback.suggestedLocationClusters,
    ).slice(0, 4),
    compatibleConflicts: normalizeStringArray(
      record.compatibleConflicts ?? fallback.compatibleConflicts,
    ).slice(0, 8),
    forbiddenCombinations: normalizeStringArray(
      record.forbiddenCombinations ?? fallback.forbiddenCombinations,
    ).slice(0, 8),
  };
}

export function normalizeWorldStructuredData(
  raw: unknown,
  fallback = createEmptyWorldStructure(),
): WorldStructuredData {
  const record = normalizeRecord(raw);
  const factions = Array.isArray(record.factions)
    ? dedupeById(record.factions.map(normalizeFaction).filter((item): item is WorldFaction => Boolean(item)))
    : fallback.factions;
  const forces = Array.isArray(record.forces)
    ? dedupeById(record.forces.map(normalizeForce).filter((item): item is WorldForce => Boolean(item)))
    : fallback.forces;
  const locations = Array.isArray(record.locations)
    ? dedupeById(record.locations.map(normalizeLocation).filter((item): item is WorldLocation => Boolean(item)))
    : fallback.locations;
  const relationsRecord = normalizeRecord(record.relations);
  const forceIds = new Set(forces.map((item) => item.id));
  const locationIds = new Set(locations.map((item) => item.id));
  const rawForceRelations = Array.isArray(relationsRecord.forceRelations)
    ? relationsRecord.forceRelations
    : Array.isArray(relationsRecord.factionRelations)
      ? relationsRecord.factionRelations
      : null;
  const forceRelations = Array.isArray(rawForceRelations)
    ? rawForceRelations
      .map((item, index) => normalizeForceRelation(item, index))
      .filter(
        (item): item is WorldForceRelation =>
          item !== null && forceIds.has(item.sourceForceId) && forceIds.has(item.targetForceId),
      )
    : fallback.relations.forceRelations;
  const rawLocationControls = Array.isArray(relationsRecord.locationControls)
    ? relationsRecord.locationControls
    : Array.isArray(relationsRecord.locationRelations)
      ? relationsRecord.locationRelations
      : null;
  const locationControls = Array.isArray(rawLocationControls)
    ? rawLocationControls
      .map((item, index) => normalizeLocationControl(item, index))
      .filter(
        (item): item is WorldLocationControlRelation =>
          item !== null && forceIds.has(item.forceId) && locationIds.has(item.locationId),
      )
    : fallback.relations.locationControls;
  const rawLocationConnections = Array.isArray(relationsRecord.locationConnections)
    ? relationsRecord.locationConnections
    : Array.isArray(relationsRecord.locationEdges)
      ? relationsRecord.locationEdges
      : null;
  const locationConnections = Array.isArray(rawLocationConnections)
    ? rawLocationConnections
      .map((item, index) => normalizeLocationConnection(item, index))
      .filter(
        (item): item is WorldLocationConnectionRelation =>
          item !== null && locationIds.has(item.sourceLocationId) && locationIds.has(item.targetLocationId),
      )
    : fallback.relations.locationConnections ?? [];
  const sanitizedFactions = factions.map((item) => ({
    ...item,
    representativeForceIds: item.representativeForceIds.filter((id) => forceIds.has(id)),
  }));
  const sanitizedForces = forces.map((item) => ({
    ...item,
    controlledLocationIds: (item.controlledLocationIds ?? []).filter((id) => locationIds.has(id)),
  }));
  const sanitizedLocations = locations.map((item) => ({
    ...item,
    controllingForceIds: item.controllingForceIds.filter((id) => forceIds.has(id)),
  }));

  return {
    profile: normalizeProfile(record.profile, fallback.profile),
    rules: normalizeRules(record.rules, fallback.rules),
    factions: sanitizedFactions,
    forces: sanitizedForces,
    locations: sanitizedLocations,
    relations: {
      forceRelations: dedupeById(forceRelations),
      locationControls: dedupeById(locationControls),
      locationConnections: dedupeById(locationConnections),
    },
    metadata: {
      schemaVersion:
        Number(record.metadata && normalizeRecord(record.metadata).schemaVersion)
        || fallback.metadata.schemaVersion
        || WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: normalizeText(normalizeRecord(record.metadata).seededFrom, fallback.metadata.seededFrom ?? "") || null,
      lastBackfilledAt:
        normalizeText(normalizeRecord(record.metadata).lastBackfilledAt, fallback.metadata.lastBackfilledAt ?? "")
        || null,
      lastGeneratedAt:
        normalizeText(normalizeRecord(record.metadata).lastGeneratedAt, fallback.metadata.lastGeneratedAt ?? "")
        || null,
      lastSectionGenerated:
        (normalizeText(
          normalizeRecord(record.metadata).lastSectionGenerated,
          fallback.metadata.lastSectionGenerated ?? "",
        ) as WorldStructureSectionKey)
        || null,
    },
  };
}

function seedFaction(name: string, description = ""): WorldFaction {
  return {
    id: makeId("faction", 0, name),
    name,
    position: "",
    doctrine: description,
    goals: [],
    methods: [],
    representativeForceIds: [],
  };
}

function seedForce(name: string, description = "", category = ""): WorldForce {
  return {
    id: makeId("force", 0, name),
    name,
    type: category,
    factionId: null,
    role: null,
    resources: [],
    controlledLocationIds: [],
    summary: description,
    baseOfPower: "",
    currentObjective: "",
    pressure: "",
    leader: null,
    narrativeRole: "",
  };
}

function seedLocation(name: string, description = "", terrain = ""): WorldLocation {
  return {
    id: makeId("location", 0, name),
    name,
    type: null,
    region: null,
    terrain,
    summary: description,
    narrativeFunction: "",
    risk: "",
    riskLevel: undefined,
    storyRelevance: "",
    entryConstraint: "",
    exitCost: "",
    controllingForceIds: [],
  };
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.name, item])).values());
}

function buildLegacyFactionSeeds(raw: string | null | undefined): { factions: WorldFaction[]; forces: WorldForce[] } {
  const parsedItems = parseLegacyArray(raw, ["factions", "forces", "organizations"]);
  if (parsedItems) {
    const factions = parsedItems
      .map((item, index) => normalizeFaction(item, index))
      .filter((item): item is WorldFaction => Boolean(item));
    const forces = parsedItems
      .map((item, index) => normalizeForce(item, index))
      .filter((item): item is WorldForce => Boolean(item));
    return { factions, forces };
  }
  const names = parseListText(raw);
  return {
    factions: names.map((name) => seedFaction(name)),
    forces: names.map((name) => seedForce(name)),
  };
}

function inferLegacyLocationName(text: string): string {
  const normalized = text.replace(/^[-*]\s*/, "").trim();
  const afterColon = normalized.includes("：") ? normalized.split("：").slice(1).join("：").trim() : normalized;
  const patterns: Array<[RegExp, string]> = [
    [/太平洋.*禁航区|太平洋.*异界入口|深海.*异界入口/, "太平洋深海禁航区"],
    [/北极冰盖|北极.*基地/, "北极冰盖秘密基地"],
    [/昆仑山|昆仑.*通道/, "昆仑山神话通道"],
    [/阿尔卑斯.*古堡|欧洲.*古堡/, "阿尔卑斯古堡指挥中心"],
    [/城市.*地下|地下.*设施/, "全球城市地下设施"],
    [/南极冰盖|极夜风暴/, "南极旧日封印区"],
  ];
  for (const [pattern, name] of patterns) {
    if (pattern.test(afterColon)) {
      return name;
    }
  }
  const candidate = afterColon
    .split(/[，。,.]|被|隐藏|实为|用于|传言|内有|是/)
    .map((item) => item.trim())
    .find((item) => item.length >= 2);
  return candidate ? candidate.slice(0, 24) : normalized.slice(0, 24);
}

function splitLegacyGeographyClauses(raw: string | null | undefined): string[] {
  const normalized = raw?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const content = normalized.includes("：")
    ? normalized.split("：").slice(1).join("：").trim()
    : normalized;
  return Array.from(
    new Set(
      content
        .split(/[\n;；]+/)
        .map((item) => item.replace(/^此外[，,]\s*/, "").trim())
        .filter((item) => item.length >= 4),
    ),
  );
}

function buildLegacyLocationSeeds(geography: string | null | undefined, conflicts: string | null | undefined): WorldLocation[] {
  const parsedLocations = parseLegacyArray(geography, ["locations", "regions", "places"]);
  const locations = parsedLocations
    ? parsedLocations
      .map((item, index) => normalizeLocation(item, index))
      .filter((item): item is WorldLocation => Boolean(item))
    : splitLegacyGeographyClauses(geography)
      .map((item, index) => seedLocation(inferLegacyLocationName(item), item))
      .filter((item) => item.name);

  const conflictObject = parseLegacyObject(conflicts);
  const flashpoints = Array.isArray(conflictObject.flashpoints) ? conflictObject.flashpoints : [];
  const flashpointLocations = flashpoints
    .map((item, index) => {
      const record = normalizeRecord(item);
      const name = normalizeText(record.location ?? record.name);
      if (!name) {
        return null;
      }
      return seedLocation(name, normalizeText(record.description), "冲突热点");
    })
    .filter((item): item is WorldLocation => Boolean(item));

  return dedupeByName([...locations, ...flashpointLocations]);
}

function buildLegacyForceRelations(conflicts: string | null | undefined, forces: WorldForce[]): WorldForceRelation[] {
  const conflictObject = parseLegacyObject(conflicts);
  const primaryConflicts = Array.isArray(conflictObject.primaryConflicts) ? conflictObject.primaryConflicts : [];
  const forceByName = new Map(forces.map((item) => [item.name, item]));
  const relations: WorldForceRelation[] = [];
  primaryConflicts.forEach((item, index) => {
    const record = normalizeRecord(item);
    const parties = normalizeStringArray(record.parties);
    const matched = parties
      .map((party) => Array.from(forceByName.values()).find((force) => party.includes(force.name) || force.name.includes(party)))
      .filter((force): force is WorldForce => Boolean(force));
    if (matched.length < 2) {
      return;
    }
    relations.push({
      id: makeId("force-relation", index, `${matched[0].id}-${matched[1].id}`),
      sourceForceId: matched[0].id,
      targetForceId: matched[1].id,
      relation: normalizeText(record.type, "冲突"),
      tension: normalizeText(record.type),
      detail: normalizeText(record.description),
    });
  });
  return dedupeById(relations);
}

export function buildWorldStructureFromLegacySource(source: WorldStructureSource): WorldStructuredData {
  const empty = createEmptyWorldStructure();
  const factionSeeds = buildLegacyFactionSeeds(source.factions);
  const policyObject = parseLegacyObject(source.politics);
  const policyForceName = normalizeText(policyObject.governance) ? "三方联合委员会" : "";
  const extraForces = policyForceName ? [seedForce(policyForceName, normalizeText(policyObject.governance), "coordination")] : [];
  const forces = dedupeByName([...factionSeeds.forces, ...extraForces]);
  const locations = buildLegacyLocationSeeds(source.geography, source.conflicts);
  const axiomTexts = parseAxiomStrings(source.axioms);

  const structure = normalizeWorldStructuredData(
    {
      profile: {
        summary: source.description ?? source.overviewSummary ?? "",
        identity: source.worldType ? `${source.worldType} 世界` : "",
        tone: "",
        themes: parseListText(source.cultures).slice(0, 6),
        coreConflict: source.conflicts ?? "",
      },
      rules: {
        summary: source.magicSystem ?? "",
        axioms: buildStructuredRulesFromAxiomTexts(axiomTexts),
        taboo: [],
        sharedConsequences: [],
      },
      factions: dedupeByName(factionSeeds.factions),
      forces,
      locations,
      relations: {
        ...createEmptyWorldRelations(),
        forceRelations: buildLegacyForceRelations(source.conflicts, forces),
      },
      metadata: {
        schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
        seededFrom: "legacy-text",
      },
    },
    empty,
  );

  return structure;
}

export function buildWorldStructureSeedFromSource(source: WorldStructureSource): WorldStructuredData {
  const seeded = buildWorldStructureFromLegacySource(source);
  const blueprint = parseWorldGenerationBlueprint(source.selectedElements);
  const themes = new Set(seeded.profile.themes);
  const factions = [...seeded.factions];
  const forces = [...seeded.forces];
  const locations = [...seeded.locations];
  const rules = [...seeded.rules.axioms];

  for (const element of blueprint.classicElements) {
    if (element.trim()) {
      themes.add(element.trim());
    }
  }

  for (const selection of blueprint.propertySelections) {
    const detail = selection.detail?.trim() || selection.description.trim();
    const category = (selection.sourceCategory ?? "").trim().toLowerCase();
    if (category === "terrain" || selection.targetLayer === "foundation") {
      locations.push(seedLocation(selection.name, detail, category === "terrain" ? "terrain" : ""));
      continue;
    }
    if (category === "organization") {
      factions.push(seedFaction(selection.name, detail));
      forces.push(seedForce(selection.name, detail, "organization"));
      continue;
    }
    if (selection.targetLayer === "society") {
      factions.push(seedFaction(selection.name, detail));
      forces.push(seedForce(selection.name, detail));
      continue;
    }
    themes.add(selection.name);
  }

  const selectedRuleIds = new Set(blueprint.referenceContext?.selectedSeedIds?.ruleIds ?? []);
  const selectedFactionIds = new Set(blueprint.referenceContext?.selectedSeedIds?.factionIds ?? []);
  const selectedForceIds = new Set(blueprint.referenceContext?.selectedSeedIds?.forceIds ?? []);
  const selectedLocationIds = new Set(blueprint.referenceContext?.selectedSeedIds?.locationIds ?? []);
  const referenceSeeds = blueprint.referenceContext?.referenceSeeds;

  if (referenceSeeds) {
    for (const rule of referenceSeeds.rules) {
      if (selectedRuleIds.has(rule.id)) {
        rules.push(rule);
      }
    }

    for (const faction of referenceSeeds.factions) {
      if (selectedFactionIds.has(faction.id)) {
        factions.push({
          ...faction,
          representativeForceIds: faction.representativeForceIds.filter((id) => selectedForceIds.has(id)),
        });
      }
    }

    for (const force of referenceSeeds.forces) {
      if (selectedForceIds.has(force.id)) {
        forces.push({
          ...force,
          factionId: force.factionId && selectedFactionIds.has(force.factionId) ? force.factionId : null,
        });
      }
    }

    for (const location of referenceSeeds.locations) {
      if (selectedLocationIds.has(location.id)) {
        locations.push({
          ...location,
          controllingForceIds: location.controllingForceIds.filter((id) => selectedForceIds.has(id)),
        });
      }
    }
  }

  return normalizeWorldStructuredData(
    {
      ...seeded,
      profile: {
        ...seeded.profile,
        themes: Array.from(themes).slice(0, 8),
      },
      rules: {
        ...seeded.rules,
        axioms: buildStructuredRulesFromAxiomTexts(rules.map(formatRuleText)),
      },
      factions: dedupeByName(factions),
      forces: dedupeByName(forces),
      locations: dedupeByName(locations),
      metadata: {
        ...seeded.metadata,
        seededFrom:
          blueprint.propertySelections.length > 0
          || blueprint.classicElements.length > 0
          || selectedRuleIds.size > 0
          || selectedFactionIds.size > 0
          || selectedForceIds.size > 0
          || selectedLocationIds.size > 0
          ? "wizard-blueprint"
          : seeded.metadata.seededFrom,
      },
    },
    seeded,
  );
}

export function parseWorldStructurePayload(
  structureJson: string | null | undefined,
  bindingSupportJson: string | null | undefined,
): {
  structure: WorldStructuredData;
  bindingSupport: WorldBindingSupport;
  hasStructuredData: boolean;
} {
  const hasStructuredData = Boolean(structureJson?.trim());
  const structure = normalizeWorldStructuredData(safeParseJSON<unknown>(structureJson, null));
  const bindingSupport = normalizeWorldBindingSupport(safeParseJSON<unknown>(bindingSupportJson, null));
  return { structure, bindingSupport, hasStructuredData };
}

function formatRuleText(rule: WorldRule): string {
  const parts = [rule.summary, rule.cost && `代价：${rule.cost}`, rule.boundary && `边界：${rule.boundary}`, rule.enforcement && `约束：${rule.enforcement}`]
    .filter(Boolean);
  return `${rule.name}${parts.length > 0 ? `：${parts.join("；")}` : ""}`;
}

function buildFactionLegacyText(structure: WorldStructuredData): string | null {
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  const lines = [
    ...structure.factions.map((item) =>
      [
        item.name,
        item.position && `立场：${item.position}`,
        item.doctrine && `主张：${item.doctrine}`,
        item.goals.length > 0 && `目标：${item.goals.join("、")}`,
        item.methods.length > 0 && `手段：${item.methods.join("、")}`,
        item.representativeForceIds.length > 0
          && `代表势力：${item.representativeForceIds.map((id) => forceNameById.get(id) ?? id).join("、")}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    ...structure.forces.map((item) =>
      [
        item.name,
        item.type && `类型：${item.type}`,
        item.summary && `概述：${item.summary}`,
        item.leader && `核心人物：${item.leader}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildBackgroundLegacyText(structure: WorldStructuredData, bindingSupport: WorldBindingSupport): string | null {
  const lines = [
    structure.profile.identity && `世界身份：${structure.profile.identity}`,
    structure.profile.summary && `当前处境：${structure.profile.summary}`,
    structure.profile.coreConflict && `开局压力：${structure.profile.coreConflict}`,
    bindingSupport.recommendedEntryPoints.length > 0
      && `可开局入口：${bindingSupport.recommendedEntryPoints.slice(0, 3).join("；")}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildPowerLegacyText(structure: WorldStructuredData): string | null {
  const ruleLines = [
    structure.rules.summary && `运行规则：${structure.rules.summary}`,
    ...structure.rules.axioms.map((item) =>
      [
        item.name,
        item.summary,
        item.cost && `代价：${item.cost}`,
        item.boundary && `边界：${item.boundary}`,
      ].filter(Boolean).join(" | "),
    ),
  ].filter(Boolean);
  const resourceLines = structure.forces
    .filter((item) => item.resources && item.resources.length > 0)
    .map((item) => `${item.name} 掌握：${(item.resources ?? []).join("、")}`);
  const lines = [...ruleLines, ...resourceLines].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildCultureLegacyText(structure: WorldStructuredData): string | null {
  const lines = [
    structure.profile.tone && `整体气质：${structure.profile.tone}`,
    structure.profile.themes.length > 0 && `主题压力：${structure.profile.themes.join("、")}`,
    ...structure.rules.taboo.map((item) => `禁忌：${item}`),
    ...structure.rules.sharedConsequences.map((item) => `共同后果：${item}`),
    ...structure.factions.map((item) =>
      [
        item.name,
        item.doctrine && `价值主张：${item.doctrine}`,
        item.methods.length > 0 && `常用方式：${item.methods.join("、")}`,
      ].filter(Boolean).join(" | "),
    ),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildHistoryLegacyText(structure: WorldStructuredData): string | null {
  const lines = [
    structure.profile.identity && `故事开始时的世界阶段：${structure.profile.identity}`,
    structure.profile.summary && `当前局面来源：${structure.profile.summary}`,
    structure.profile.coreConflict && `长期矛盾：${structure.profile.coreConflict}`,
    ...structure.relations.forceRelations.slice(0, 4).map((item) =>
      [item.relation, item.tension, item.detail].filter(Boolean).join(" | "),
    ),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildEconomyLegacyText(structure: WorldStructuredData): string | null {
  const lines = structure.forces
    .filter((item) => (item.resources ?? []).length > 0 || item.baseOfPower || item.pressure)
    .map((item) =>
      [
        item.name,
        item.resources && item.resources.length > 0 && `资源：${item.resources.join("、")}`,
        item.baseOfPower && `权力基础：${item.baseOfPower}`,
        item.pressure && `压力：${item.pressure}`,
      ].filter(Boolean).join(" | "),
    );
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildPoliticsLegacyText(structure: WorldStructuredData): string | null {
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  const lines = [
    ...structure.factions.map((item) =>
      [
        item.name,
        item.position && `立场：${item.position}`,
        item.goals.length > 0 && `目标：${item.goals.join("、")}`,
        item.methods.length > 0 && `手段：${item.methods.join("、")}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    ...structure.forces.map((item) =>
      [
        item.name,
        item.currentObjective && `当前目标：${item.currentObjective}`,
        item.pressure && `施压方式：${item.pressure}`,
        item.baseOfPower && `权力基础：${item.baseOfPower}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    ...structure.relations.forceRelations.map((item) =>
      [
        forceNameById.get(item.sourceForceId) ?? item.sourceForceId,
        item.relation,
        forceNameById.get(item.targetForceId) ?? item.targetForceId,
        item.detail,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildGeographyLegacyText(structure: WorldStructuredData): string | null {
  const lines = structure.locations
    .map((item) =>
      [
        item.name,
        item.terrain && `地形：${item.terrain}`,
        item.summary && `概述：${item.summary}`,
        item.narrativeFunction && `叙事功能：${item.narrativeFunction}`,
        item.risk && `风险：${item.risk}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function buildConflictLegacyText(structure: WorldStructuredData): string | null {
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  const lines = [
    structure.profile.coreConflict,
    ...structure.forces
      .map((item) => item.pressure ? `${item.name}：${item.pressure}` : "")
      .filter(Boolean),
    ...structure.relations.forceRelations
      .map((item) =>
        [
          forceNameById.get(item.sourceForceId) ?? item.sourceForceId,
          item.relation,
          forceNameById.get(item.targetForceId) ?? item.targetForceId,
          item.tension,
          item.detail,
        ]
          .filter(Boolean)
          .join(" | "),
      )
      .filter(Boolean),
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

export function buildWorldBindingSupport(structure: WorldStructuredData): WorldBindingSupport {
  const recommendedEntryPoints = Array.from(
    new Set(
      [
        ...structure.locations
          .filter((item) => item.narrativeFunction || item.summary)
          .slice(0, 3)
          .map((item) => `${item.name}${item.narrativeFunction ? `：${item.narrativeFunction}` : ""}`),
        ...structure.forces
          .filter((item) => item.narrativeRole || item.summary)
          .slice(0, 3)
          .map((item) => `${item.name}${item.narrativeRole ? `：${item.narrativeRole}` : ""}`),
      ].filter(Boolean),
    ),
  ).slice(0, 6);

  const highPressureForces = structure.forces
    .filter((item) => item.pressure)
    .map((item) => `${item.name}：${item.pressure}`)
    .slice(0, 6);

  const suggestedLocationClusters = structure.locations
    .slice(0, 3)
    .map((item, index) => ({
      id: makeId("cluster", index, item.name),
      label: `${item.name} 场景群`,
      locationIds: [item.id],
      reason: item.narrativeFunction || item.summary || item.risk,
    }));

  const compatibleConflicts = Array.from(
    new Set(
      structure.relations.forceRelations
        .map((item) => item.detail || item.tension || `${item.sourceForceId} ${item.relation} ${item.targetForceId}`)
        .filter(Boolean),
    ),
  ).slice(0, 8);

  const forbiddenCombinations = [
    ...structure.rules.taboo,
    ...structure.rules.sharedConsequences.map((item) => `避免忽略：${item}`),
  ].slice(0, 8);

  return {
    recommendedEntryPoints,
    highPressureForces,
    suggestedLocationClusters,
    compatibleConflicts,
    forbiddenCombinations,
  };
}

export function applyStructuredWorldToLegacyFields(
  structure: WorldStructuredData,
  existing?: Partial<WorldStructureSource>,
  bindingSupport = buildWorldBindingSupport(structure),
) {
  const axioms = structure.rules.axioms.map(formatRuleText).filter(Boolean);
  const overviewSummary = structure.profile.summary
    || [structure.profile.identity, structure.profile.coreConflict].filter(Boolean).join(" | ");

  return {
    description: structure.profile.summary || existing?.description || null,
    background: buildBackgroundLegacyText(structure, bindingSupport) ?? existing?.background ?? null,
    overviewSummary: overviewSummary || existing?.overviewSummary || null,
    axioms: axioms.length > 0 ? JSON.stringify(axioms) : existing?.axioms ?? null,
    cultures: buildCultureLegacyText(structure) ?? existing?.cultures ?? null,
    magicSystem: buildPowerLegacyText(structure) ?? existing?.magicSystem ?? null,
    factions: buildFactionLegacyText(structure) ?? existing?.factions ?? null,
    politics: buildPoliticsLegacyText(structure) ?? existing?.politics ?? null,
    geography: buildGeographyLegacyText(structure) ?? existing?.geography ?? null,
    conflicts: buildConflictLegacyText(structure) ?? existing?.conflicts ?? null,
    history: buildHistoryLegacyText(structure) ?? existing?.history ?? null,
    economy: buildEconomyLegacyText(structure) ?? existing?.economy ?? null,
    structureJson: JSON.stringify({
      ...structure,
      metadata: {
        ...structure.metadata,
        schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      },
    }),
    bindingSupportJson: JSON.stringify(bindingSupport),
    structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
  };
}

export function buildWorldStructureOverview(structure: WorldStructuredData, bindingSupport: WorldBindingSupport) {
  return {
    summary:
      structure.profile.summary
      || [structure.profile.identity, structure.profile.coreConflict].filter(Boolean).join(" | ")
      || "World summary is not available yet.",
    sections: [
      {
        key: "profile",
        title: "世界概要",
        content: [
          structure.profile.identity && `世界身份：${structure.profile.identity}`,
          structure.profile.tone && `整体调性：${structure.profile.tone}`,
          structure.profile.summary && `摘要：${structure.profile.summary}`,
          structure.profile.coreConflict && `核心冲突：${structure.profile.coreConflict}`,
          structure.profile.themes.length > 0 && `主题：${structure.profile.themes.join("、")}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        key: "rules",
        title: "规则中心",
        content: [
          structure.rules.summary,
          ...structure.rules.axioms.map(formatRuleText),
          ...structure.rules.taboo.map((item) => `禁忌：${item}`),
          ...structure.rules.sharedConsequences.map((item) => `共通后果：${item}`),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        key: "factions",
        title: "阵营与势力",
        content: [buildFactionLegacyText(structure), buildPoliticsLegacyText(structure)].filter(Boolean).join("\n\n"),
      },
      {
        key: "locations",
        title: "地点与地形",
        content: buildGeographyLegacyText(structure) ?? "",
      },
      {
        key: "relations",
        title: "关系网络",
        content: [
          ...structure.relations.forceRelations.map((item) =>
            [item.sourceForceId, item.relation, item.targetForceId, item.tension, item.detail]
              .filter(Boolean)
              .join(" | "),
          ),
          ...structure.relations.locationControls.map((item) =>
            [item.forceId, item.relation, item.locationId, item.detail].filter(Boolean).join(" | "),
          ),
          ...bindingSupport.compatibleConflicts.map((item) => `可兼容冲突：${item}`),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ].filter((section) => section.content.trim()),
  };
}
