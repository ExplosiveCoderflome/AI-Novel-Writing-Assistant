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
  createdAt: string;
  updatedAt: string;
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
