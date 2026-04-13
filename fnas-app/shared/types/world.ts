export interface World {
  id: string;
  name: string;
  description?: string | null;
  worldType?: string | null;
  templateKey?: string | null;
  axioms?: string | null;
  background?: string | null;
  geography?: string | null;
  cultures?: string | null;
  magicSystem?: string | null;
  politics?: string | null;
  races?: string | null;
  religions?: string | null;
  technology?: string | null;
  conflicts?: string | null;
  history?: string | null;
  economy?: string | null;
  factions?: string | null;
  status: string;
  version: number;
  selectedDimensions?: string | null;
  selectedElements?: string | null;
  layerStates?: string | null;
  consistencyReport?: string | null;
  overviewSummary?: string | null;
  structureJson?: string | null;
  bindingSupportJson?: string | null;
  structureSchemaVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export type WorldStructureSectionKey =
  | "profile"
  | "rules"
  | "factions"
  | "locations"
  | "relations";

export interface WorldProfile {
  summary: string;
  identity: string;
  tone: string;
  themes: string[];
  coreConflict: string;
}

export interface WorldRule {
  id: string;
  name: string;
  summary: string;
  cost: string;
  boundary: string;
  enforcement: string;
}

export interface WorldRules {
  summary: string;
  axioms: WorldRule[];
  taboo: string[];
  sharedConsequences: string[];
}

export interface WorldFaction {
  id: string;
  name: string;
  position: string;
  doctrine: string;
  goals: string[];
  methods: string[];
  representativeForceIds: string[];
}

export interface WorldForce {
  id: string;
  name: string;
  type: string;
  factionId?: string | null;
  summary: string;
  baseOfPower: string;
  currentObjective: string;
  pressure: string;
  leader?: string | null;
  narrativeRole: string;
}

export interface WorldLocation {
  id: string;
  name: string;
  terrain: string;
  summary: string;
  narrativeFunction: string;
  risk: string;
  entryConstraint: string;
  exitCost: string;
  controllingForceIds: string[];
}

export interface WorldForceRelation {
  id: string;
  sourceForceId: string;
  targetForceId: string;
  relation: string;
  tension: string;
  detail: string;
}

export interface WorldLocationControlRelation {
  id: string;
  forceId: string;
  locationId: string;
  relation: string;
  detail: string;
}

export interface WorldRelations {
  forceRelations: WorldForceRelation[];
  locationControls: WorldLocationControlRelation[];
}

export interface WorldBindingLocationCluster {
  id: string;
  label: string;
  locationIds: string[];
  reason: string;
}

export interface WorldBindingSupport {
  recommendedEntryPoints: string[];
  highPressureForces: string[];
  suggestedLocationClusters: WorldBindingLocationCluster[];
  compatibleConflicts: string[];
  forbiddenCombinations: string[];
}

export interface WorldStructureMeta {
  schemaVersion: number;
  seededFrom?: string | null;
  lastBackfilledAt?: string | null;
  lastGeneratedAt?: string | null;
  lastSectionGenerated?: WorldStructureSectionKey | null;
}

export interface WorldStructuredData {
  profile: WorldProfile;
  rules: WorldRules;
  factions: WorldFaction[];
  forces: WorldForce[];
  locations: WorldLocation[];
  relations: WorldRelations;
  metadata: WorldStructureMeta;
}

export interface WorldPropertyLibrary {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  worldType?: string | null;
  usageCount: number;
  sourceWorldId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WorldLayerKey =
  | "foundation"
  | "power"
  | "society"
  | "culture"
  | "history"
  | "conflict";

export interface WorldLayerState {
  key: WorldLayerKey;
  status: "pending" | "generated" | "confirmed" | "stale";
  updatedAt?: string;
}

export interface WorldAxiom {
  text: string;
  source?: "user" | "ai";
}

export interface WorldTemplate {
  key: string;
  name: string;
  description: string;
  worldType: string;
  requiredLayers: WorldLayerKey[];
  optionalLayers: WorldLayerKey[];
  classicElements: string[];
  pitfalls: string[];
}

export interface WorldDeepeningQuestion {
  id: string;
  worldId: string;
  priority: "required" | "recommended" | "optional";
  question: string;
  quickOptions?: string[];
  targetLayer?: WorldLayerKey;
  targetField?: string;
  answer?: string | null;
  integratedSummary?: string | null;
  status: "pending" | "answered" | "integrated";
  createdAt: string;
  updatedAt: string;
}

export interface WorldConsistencyIssue {
  id: string;
  worldId: string;
  severity: "pass" | "warn" | "error";
  code: string;
  message: string;
  detail?: string | null;
  source: "rule" | "llm";
  status: "open" | "resolved" | "ignored";
  targetField?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorldConsistencyReport {
  worldId: string;
  score: number;
  summary: string;
  status: "pass" | "warn" | "error";
  generatedAt?: string;
  issues: WorldConsistencyIssue[];
}

export interface WorldSnapshot {
  id: string;
  worldId: string;
  label?: string | null;
  data: string;
  createdAt: string;
}

export interface WorldVisualizationPayload {
  worldId: string;
  factionGraph: {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ source: string; target: string; relation: string }>;
  };
  powerTree: Array<{ level: string; description: string }>;
  geographyMap: {
    nodes: Array<{ id: string; label: string }>;
    edges: Array<{ source: string; target: string; relation: string }>;
  };
  timeline: Array<{ year: string; event: string }>;
}
