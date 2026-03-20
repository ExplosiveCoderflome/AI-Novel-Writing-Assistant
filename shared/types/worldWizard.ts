import type {
  WorldFaction,
  WorldForce,
  WorldLayerKey,
  WorldLocation,
  WorldRule,
} from "./world";

export type WorldOptionRefinementLevel = "basic" | "standard" | "detailed";
export type WorldReferenceMode = "extract_base" | "adapt_world" | "tone_rebuild";

export interface WorldReferenceAnchor {
  id: string;
  label: string;
  content: string;
}

export interface WorldReferenceRuleSeed extends Pick<WorldRule, "id" | "name" | "summary" | "cost" | "boundary" | "enforcement"> {}

export interface WorldReferenceFactionSeed extends Pick<WorldFaction, "id" | "name" | "position" | "doctrine" | "goals" | "methods" | "representativeForceIds"> {}

export interface WorldReferenceForceSeed extends Pick<
  WorldForce,
  "id" | "name" | "type" | "factionId" | "summary" | "baseOfPower" | "currentObjective" | "pressure" | "leader" | "narrativeRole"
> {}

export interface WorldReferenceLocationSeed extends Pick<
  WorldLocation,
  "id" | "name" | "terrain" | "summary" | "narrativeFunction" | "risk" | "entryConstraint" | "exitCost" | "controllingForceIds"
> {}

export interface WorldReferenceSeedBundle {
  rules: WorldReferenceRuleSeed[];
  factions: WorldReferenceFactionSeed[];
  forces: WorldReferenceForceSeed[];
  locations: WorldReferenceLocationSeed[];
}

export interface WorldReferenceSeedSelection {
  ruleIds: string[];
  factionIds: string[];
  forceIds: string[];
  locationIds: string[];
}

export interface WorldReferenceContext {
  mode: WorldReferenceMode;
  preserveElements: string[];
  allowedChanges: string[];
  forbiddenElements: string[];
  anchors: WorldReferenceAnchor[];
  referenceSeeds?: WorldReferenceSeedBundle | null;
  selectedSeedIds?: WorldReferenceSeedSelection | null;
}

export interface WorldPropertyChoice {
  id: string;
  label: string;
  summary: string;
}

export interface WorldPropertyOption {
  id: string;
  name: string;
  description: string;
  targetLayer: WorldLayerKey;
  reason?: string | null;
  choices?: WorldPropertyChoice[];
  source: "ai" | "library";
  libraryItemId?: string | null;
  sourceCategory?: string | null;
}

export interface WorldPropertySelection {
  optionId: string;
  name: string;
  description: string;
  targetLayer: WorldLayerKey;
  detail?: string | null;
  choiceId?: string | null;
  choiceLabel?: string | null;
  choiceSummary?: string | null;
  source: "ai" | "library";
  libraryItemId?: string | null;
  sourceCategory?: string | null;
}

export interface WorldGenerationBlueprint {
  version: 1;
  classicElements: string[];
  propertySelections: WorldPropertySelection[];
  referenceContext?: WorldReferenceContext | null;
}

const WORLD_LAYER_KEYS: WorldLayerKey[] = [
  "foundation",
  "power",
  "society",
  "culture",
  "history",
  "conflict",
];

const WORLD_LAYER_KEY_SET = new Set<WorldLayerKey>(WORLD_LAYER_KEYS);

export function isWorldLayerKey(value: string): value is WorldLayerKey {
  return WORLD_LAYER_KEY_SET.has(value as WorldLayerKey);
}

export function normalizeWorldGenerationBlueprint(
  raw: unknown,
): WorldGenerationBlueprint {
  if (!raw) {
    return {
      version: 1,
      classicElements: [],
      propertySelections: [],
    };
  }

  if (Array.isArray(raw)) {
    const classicElements = raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return {
      version: 1,
      classicElements: Array.from(new Set(classicElements)),
      propertySelections: [],
    };
  }

  if (typeof raw !== "object") {
    return {
      version: 1,
      classicElements: [],
      propertySelections: [],
      referenceContext: null,
    };
  }

  const record = raw as Record<string, unknown>;
  const classicElements = Array.isArray(record.classicElements)
    ? record.classicElements
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
    : [];

  const propertySelections = Array.isArray(record.propertySelections)
    ? record.propertySelections
      .map<WorldPropertySelection | null>((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const selection = item as Record<string, unknown>;
        const optionId = typeof selection.optionId === "string"
          ? selection.optionId.trim()
          : typeof selection.id === "string"
            ? selection.id.trim()
            : "";
        const name = typeof selection.name === "string" ? selection.name.trim() : "";
        const description = typeof selection.description === "string" ? selection.description.trim() : "";
        const detail = typeof selection.detail === "string" ? selection.detail.trim() : "";
        const choiceId = typeof selection.choiceId === "string" ? selection.choiceId.trim() : "";
        const choiceLabel = typeof selection.choiceLabel === "string" ? selection.choiceLabel.trim() : "";
        const choiceSummary = typeof selection.choiceSummary === "string" ? selection.choiceSummary.trim() : "";
        const targetLayer = typeof selection.targetLayer === "string" && isWorldLayerKey(selection.targetLayer)
          ? selection.targetLayer
          : null;
        const source = selection.source === "library" ? "library" : "ai";
        const libraryItemId = typeof selection.libraryItemId === "string" ? selection.libraryItemId.trim() : "";
        const sourceCategory = typeof selection.sourceCategory === "string"
          ? selection.sourceCategory.trim()
          : "";

        if (!optionId || !name || !description || !targetLayer) {
          return null;
        }

        return {
          optionId,
          name,
          description,
          detail: detail || null,
          choiceId: choiceId || null,
          choiceLabel: choiceLabel || null,
          choiceSummary: choiceSummary || null,
          targetLayer,
          source,
          libraryItemId: libraryItemId || null,
          sourceCategory: sourceCategory || null,
        };
      })
      .filter((item): item is WorldPropertySelection => Boolean(item))
    : [];

  const referenceContext = normalizeWorldReferenceContext(record.referenceContext);

  return {
    version: 1,
    classicElements: Array.from(new Set(classicElements)),
    propertySelections,
    referenceContext,
  };
}

export function parseWorldGenerationBlueprint(
  raw: string | null | undefined,
): WorldGenerationBlueprint {
  if (!raw?.trim()) {
    return normalizeWorldGenerationBlueprint(null);
  }

  try {
    return normalizeWorldGenerationBlueprint(JSON.parse(raw));
  } catch {
    return normalizeWorldGenerationBlueprint(raw);
  }
}

export function serializeWorldGenerationBlueprint(
  blueprint: WorldGenerationBlueprint,
): string {
  return JSON.stringify(normalizeWorldGenerationBlueprint(blueprint));
}

function normalizeReferenceAnchor(raw: unknown, index: number): WorldReferenceAnchor | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const content = typeof record.content === "string" ? record.content.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!label || !content) {
    return null;
  }
  return {
    id: id || `anchor-${index + 1}`,
    label,
    content,
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function normalizeReferenceRuleSeed(raw: unknown, index: number): WorldReferenceRuleSeed | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!name && !summary) {
    return null;
  }
  return {
    id: id || `reference-rule-${index + 1}`,
    name: name || `原作规则 ${index + 1}`,
    summary,
    cost: typeof record.cost === "string" ? record.cost.trim() : "",
    boundary: typeof record.boundary === "string" ? record.boundary.trim() : "",
    enforcement: typeof record.enforcement === "string" ? record.enforcement.trim() : "",
  };
}

function normalizeReferenceFactionSeed(raw: unknown, index: number): WorldReferenceFactionSeed | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!name) {
    return null;
  }
  return {
    id: id || `reference-faction-${index + 1}`,
    name,
    position: typeof record.position === "string" ? record.position.trim() : "",
    doctrine: typeof record.doctrine === "string" ? record.doctrine.trim() : "",
    goals: normalizeStringList(record.goals),
    methods: normalizeStringList(record.methods),
    representativeForceIds: normalizeStringList(record.representativeForceIds),
  };
}

function normalizeReferenceForceSeed(raw: unknown, index: number): WorldReferenceForceSeed | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!name) {
    return null;
  }
  return {
    id: id || `reference-force-${index + 1}`,
    name,
    type: typeof record.type === "string" ? record.type.trim() : "",
    factionId: typeof record.factionId === "string" ? record.factionId.trim() : null,
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    baseOfPower: typeof record.baseOfPower === "string" ? record.baseOfPower.trim() : "",
    currentObjective: typeof record.currentObjective === "string" ? record.currentObjective.trim() : "",
    pressure: typeof record.pressure === "string" ? record.pressure.trim() : "",
    leader: typeof record.leader === "string" ? record.leader.trim() : null,
    narrativeRole: typeof record.narrativeRole === "string" ? record.narrativeRole.trim() : "",
  };
}

function normalizeReferenceLocationSeed(raw: unknown, index: number): WorldReferenceLocationSeed | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!name) {
    return null;
  }
  return {
    id: id || `reference-location-${index + 1}`,
    name,
    terrain: typeof record.terrain === "string" ? record.terrain.trim() : "",
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    narrativeFunction: typeof record.narrativeFunction === "string" ? record.narrativeFunction.trim() : "",
    risk: typeof record.risk === "string" ? record.risk.trim() : "",
    entryConstraint: typeof record.entryConstraint === "string" ? record.entryConstraint.trim() : "",
    exitCost: typeof record.exitCost === "string" ? record.exitCost.trim() : "",
    controllingForceIds: normalizeStringList(record.controllingForceIds),
  };
}

export function createEmptyWorldReferenceSeedBundle(): WorldReferenceSeedBundle {
  return {
    rules: [],
    factions: [],
    forces: [],
    locations: [],
  };
}

export function createEmptyWorldReferenceSeedSelection(): WorldReferenceSeedSelection {
  return {
    ruleIds: [],
    factionIds: [],
    forceIds: [],
    locationIds: [],
  };
}

export function normalizeWorldReferenceSeedBundle(raw: unknown): WorldReferenceSeedBundle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyWorldReferenceSeedBundle();
  }

  const record = raw as Record<string, unknown>;
  const rules = Array.isArray(record.rules)
    ? record.rules
      .map((item, index) => normalizeReferenceRuleSeed(item, index))
      .filter((item): item is WorldReferenceRuleSeed => Boolean(item))
    : [];
  const factions = Array.isArray(record.factions)
    ? record.factions
      .map((item, index) => normalizeReferenceFactionSeed(item, index))
      .filter((item): item is WorldReferenceFactionSeed => Boolean(item))
    : [];
  const forces = Array.isArray(record.forces)
    ? record.forces
      .map((item, index) => normalizeReferenceForceSeed(item, index))
      .filter((item): item is WorldReferenceForceSeed => Boolean(item))
    : [];
  const locations = Array.isArray(record.locations)
    ? record.locations
      .map((item, index) => normalizeReferenceLocationSeed(item, index))
      .filter((item): item is WorldReferenceLocationSeed => Boolean(item))
    : [];

  return {
    rules: Array.from(new Map(rules.map((item) => [item.id, item])).values()),
    factions: Array.from(new Map(factions.map((item) => [item.id, item])).values()),
    forces: Array.from(new Map(forces.map((item) => [item.id, item])).values()),
    locations: Array.from(new Map(locations.map((item) => [item.id, item])).values()),
  };
}

export function normalizeWorldReferenceSeedSelection(raw: unknown): WorldReferenceSeedSelection {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyWorldReferenceSeedSelection();
  }

  const record = raw as Record<string, unknown>;
  return {
    ruleIds: normalizeStringList(record.ruleIds),
    factionIds: normalizeStringList(record.factionIds),
    forceIds: normalizeStringList(record.forceIds),
    locationIds: normalizeStringList(record.locationIds),
  };
}

export function normalizeWorldReferenceContext(raw: unknown): WorldReferenceContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const mode = record.mode === "extract_base" || record.mode === "adapt_world" || record.mode === "tone_rebuild"
    ? record.mode
    : null;

  if (!mode) {
    return null;
  }

  const anchors = Array.isArray(record.anchors)
    ? record.anchors
      .map((item, index) => normalizeReferenceAnchor(item, index))
      .filter((item): item is WorldReferenceAnchor => Boolean(item))
    : [];

  return {
    mode,
    preserveElements: normalizeStringList(record.preserveElements),
    allowedChanges: normalizeStringList(record.allowedChanges),
    forbiddenElements: normalizeStringList(record.forbiddenElements),
    anchors,
    referenceSeeds: normalizeWorldReferenceSeedBundle(record.referenceSeeds ?? record.seedPackage),
    selectedSeedIds: normalizeWorldReferenceSeedSelection(record.selectedSeedIds),
  };
}

export function mapWorldLibraryCategoryToLayer(category: string | null | undefined): WorldLayerKey {
  const normalized = (category ?? "").trim().toLowerCase();
  switch (normalized) {
    case "terrain":
      return "foundation";
    case "power_system":
    case "artifact":
      return "power";
    case "race":
    case "organization":
      return "society";
    case "resource":
      return "culture";
    case "event":
      return "history";
    default:
      return "conflict";
  }
}
