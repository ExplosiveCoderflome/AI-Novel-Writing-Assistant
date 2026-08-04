import type {
  WorldBindingSupport,
  WorldFaction,
  WorldForce,
  WorldForceRelation,
  WorldLocation,
  WorldRule,
  WorldStructuredData,
  WorldStructureSectionKey,
} from "@ai-novel/shared/types/world";
import { parseWorldGenerationBlueprint } from "@ai-novel/shared/types/worldWizard";
import {
  WORLD_STRUCTURE_SCHEMA_VERSION,
  WorldStructureSource,
  createEmptyWorldBindingSupport,
  createEmptyWorldRelations,
  createEmptyWorldStructure,
} from "./worldStructureTypes";
import {
  buildStructuredRulesFromAxiomTexts,
  dedupeById,
  makeId,
  normalizeFaction,
  normalizeForce,
  normalizeLocation,
  normalizeRecord,
  normalizeStringArray,
  normalizeText,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  parseAxiomStrings,
  parseLegacyArray,
  parseLegacyObject,
  parseListText,
  safeParseJSON,
} from "./worldStructureNormalizers";


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
