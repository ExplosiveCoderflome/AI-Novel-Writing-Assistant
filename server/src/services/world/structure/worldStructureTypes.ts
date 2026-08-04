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
