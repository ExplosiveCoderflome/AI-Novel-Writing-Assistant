import type {
  StoryWorldSlice,
  StoryWorldSliceBuilderMode,
  StoryWorldSliceElement,
  StoryWorldSliceForce,
  StoryWorldSliceLocation,
  StoryWorldSliceOverrides,
  StoryWorldSliceRule,
  StoryWorldSliceView,
} from "@ai-novel/shared/types/storyWorldSlice";
import {
  storyWorldSliceOverridesSchema,
  storyWorldSliceSchema,
} from "@ai-novel/shared/types/storyWorldSlice";
import type {
  WorldBindingSupport,
  WorldStructuredData,
} from "@ai-novel/shared/types/world";

export const STORY_WORLD_SLICE_SCHEMA_VERSION = 1;

function uniqueStrings(values: string[], limit: number): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(
    value.map((item) => normalizeText(item)).filter(Boolean),
    limit,
  );
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeRuleRefs(
  items: unknown,
  availableById: Map<string, { id: string; name: string; summary: string }>,
  requiredIds: Set<string>,
): StoryWorldSliceRule[] {
  const picked: StoryWorldSliceRule[] = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      const record = normalizeRecord(item);
      const id = normalizeText(record.id);
      const available = availableById.get(id);
      if (!available) {
        continue;
      }
      picked.push({
        id,
        name: available.name,
        summary: available.summary,
        whyItMatters: normalizeText(record.whyItMatters),
      });
    }
  }
  for (const id of requiredIds) {
    const available = availableById.get(id);
    if (!available || picked.some((item) => item.id === id)) {
      continue;
    }
    picked.push({
      id,
      name: available.name,
      summary: available.summary,
      whyItMatters: "这是小说侧明确要求保留的规则。",
    });
  }
  return picked.slice(0, 8);
}

function normalizeForceRefs(
  items: unknown,
  availableById: Map<string, { id: string; name: string; summary: string; pressure: string }>,
  requiredIds: Set<string>,
): StoryWorldSliceForce[] {
  const picked: StoryWorldSliceForce[] = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      const record = normalizeRecord(item);
      const id = normalizeText(record.id);
      const available = availableById.get(id);
      if (!available) {
        continue;
      }
      picked.push({
        id,
        name: available.name,
        summary: available.summary,
        roleInStory: normalizeText(record.roleInStory),
        pressure: normalizeText(record.pressure, available.pressure),
      });
    }
  }
  for (const id of requiredIds) {
    const available = availableById.get(id);
    if (!available || picked.some((item) => item.id === id)) {
      continue;
    }
    picked.push({
      id,
      name: available.name,
      summary: available.summary,
      roleInStory: "这是小说侧明确要求保留的组织或势力。",
      pressure: available.pressure,
    });
  }
  return picked.slice(0, 8);
}

function normalizeLocationRefs(
  items: unknown,
  availableById: Map<string, { id: string; name: string; summary: string; risk: string }>,
  requiredIds: Set<string>,
  primaryLocationId?: string | null,
): StoryWorldSliceLocation[] {
  const picked: StoryWorldSliceLocation[] = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      const record = normalizeRecord(item);
      const id = normalizeText(record.id);
      const available = availableById.get(id);
      if (!available) {
        continue;
      }
      picked.push({
        id,
        name: available.name,
        summary: available.summary,
        storyUse: normalizeText(record.storyUse),
        risk: normalizeText(record.risk, available.risk),
      });
    }
  }
  const requiredOrder = primaryLocationId
    ? [primaryLocationId, ...requiredIds]
    : Array.from(requiredIds);
  for (const id of requiredOrder) {
    const available = availableById.get(id);
    if (!available || picked.some((item) => item.id === id)) {
      continue;
    }
    picked.unshift({
      id,
      name: available.name,
      summary: available.summary,
      storyUse: id === primaryLocationId ? "这是小说当前的主舞台。" : "这是小说侧明确要求保留的地点。",
      risk: available.risk,
    });
  }
  return picked.slice(0, 8);
}

function buildFallbackElements(
  rules: StoryWorldSliceRule[],
  forces: StoryWorldSliceForce[],
  locations: StoryWorldSliceLocation[],
): StoryWorldSliceElement[] {
  return [
    ...rules.slice(0, 2).map((item) => ({
      id: `rule:${item.id}`,
      label: item.name,
      type: "rule",
      summary: item.summary,
    })),
    ...forces.slice(0, 2).map((item) => ({
      id: `force:${item.id}`,
      label: item.name,
      type: "force",
      summary: item.pressure || item.summary,
    })),
    ...locations.slice(0, 2).map((item) => ({
      id: `location:${item.id}`,
      label: item.name,
      type: "location",
      summary: item.storyUse || item.summary,
    })),
  ].slice(0, 6);
}

export function parseStoryWorldSlice(raw: string | null | undefined): StoryWorldSlice | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    return storyWorldSliceSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseStoryWorldSliceOverrides(raw: string | null | undefined): StoryWorldSliceOverrides {
  if (!raw?.trim()) {
    return {};
  }
  try {
    return storyWorldSliceOverridesSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function normalizeStoryWorldSlice(input: {
  raw: unknown;
  storyId: string;
  worldId: string;
  sourceWorldUpdatedAt: string;
  storyInputDigest: string;
  builtFromStructuredData: boolean;
  builderMode: StoryWorldSliceBuilderMode;
  structure: WorldStructuredData;
  bindingSupport: WorldBindingSupport;
  overrides: StoryWorldSliceOverrides;
}): StoryWorldSlice {
  const record = normalizeRecord(input.raw);
  const requiredRuleIds = new Set(input.overrides.requiredRuleIds ?? []);
  const requiredForceIds = new Set(input.overrides.requiredForceIds ?? []);
  const requiredLocationIds = new Set(input.overrides.requiredLocationIds ?? []);
  const availableRules = new Map(input.structure.rules.axioms.map((item) => [item.id, item]));
  const availableForces = new Map(input.structure.forces.map((item) => [item.id, item]));
  const availableLocations = new Map(input.structure.locations.map((item) => [item.id, item]));

  const appliedRules = normalizeRuleRefs(record.appliedRules, availableRules, requiredRuleIds);
  const activeForces = normalizeForceRefs(
    record.activeForces,
    new Map(input.structure.forces.map((item) => [item.id, {
      id: item.id,
      name: item.name,
      summary: item.summary,
      pressure: item.pressure,
    }])),
    requiredForceIds,
  );
  const activeLocations = normalizeLocationRefs(
    record.activeLocations,
    new Map(input.structure.locations.map((item) => [item.id, {
      id: item.id,
      name: item.name,
      summary: item.summary,
      risk: item.risk,
    }])),
    requiredLocationIds,
    input.overrides.primaryLocationId ?? null,
  );

  const rawElements = Array.isArray(record.activeElements) ? record.activeElements : [];
  const activeElements = rawElements
    .map((item, index) => {
      const row = normalizeRecord(item);
      const label = normalizeText(row.label ?? row.name);
      if (!label) {
        return null;
      }
      return {
        id: normalizeText(row.id, `element-${index + 1}`),
        label,
        type: normalizeText(row.type, "binding"),
        summary: normalizeText(row.summary ?? row.description),
      } satisfies StoryWorldSliceElement;
    })
    .filter((item): item is StoryWorldSliceElement => Boolean(item))
    .slice(0, 6);

  const finalElements = activeElements.length > 0
    ? activeElements
    : buildFallbackElements(appliedRules, activeForces, activeLocations);

  const fallbackScope = [
    input.overrides.scopeNote?.trim(),
    input.bindingSupport.forbiddenCombinations.length > 0
      ? `需要避开：${input.bindingSupport.forbiddenCombinations.join("；")}`
      : "",
  ].filter(Boolean).join(" ");

  const slice: StoryWorldSlice = {
    storyId: input.storyId,
    worldId: input.worldId,
    coreWorldFrame: normalizeText(record.coreWorldFrame, input.structure.profile.summary || input.structure.profile.identity),
    appliedRules,
    activeForces,
    activeLocations,
    activeElements: finalElements,
    conflictCandidates: uniqueStrings([
      ...normalizeStringArray(record.conflictCandidates, 8),
      ...input.bindingSupport.compatibleConflicts.slice(0, 4),
    ], 8),
    pressureSources: uniqueStrings([
      ...normalizeStringArray(record.pressureSources, 8),
      ...input.bindingSupport.highPressureForces.slice(0, 4),
      ...activeForces.map((item) => `${item.name}：${item.pressure}`).filter((item) => !item.endsWith("：")),
    ], 8),
    mysterySources: uniqueStrings(normalizeStringArray(record.mysterySources, 6), 6),
    suggestedStoryAxes: uniqueStrings(normalizeStringArray(record.suggestedStoryAxes, 6), 6),
    recommendedEntryPoints: uniqueStrings([
      ...normalizeStringArray(record.recommendedEntryPoints, 6),
      ...input.bindingSupport.recommendedEntryPoints.slice(0, 4),
    ], 6),
    forbiddenCombinations: uniqueStrings([
      ...normalizeStringArray(record.forbiddenCombinations, 8),
      ...input.bindingSupport.forbiddenCombinations,
    ], 8),
    storyScopeBoundary: normalizeText(record.storyScopeBoundary, fallbackScope),
    metadata: {
      schemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
      builtAt: new Date().toISOString(),
      sourceWorldUpdatedAt: input.sourceWorldUpdatedAt,
      storyInputDigest: input.storyInputDigest,
      builtFromStructuredData: input.builtFromStructuredData,
      builderMode: input.builderMode,
    },
  };

  return storyWorldSliceSchema.parse(slice);
}

export function buildStoryWorldSliceView(input: {
  worldId: string | null;
  worldName: string | null;
  slice: StoryWorldSlice | null;
  overrides: StoryWorldSliceOverrides;
  structure: WorldStructuredData | null;
  isStale: boolean;
  storyInputSource: string | null;
}): StoryWorldSliceView {
  const structure = input.structure;
  return {
    hasWorld: Boolean(input.worldId),
    worldId: input.worldId,
    worldName: input.worldName,
    slice: input.slice,
    overrides: input.overrides,
    availableRules: structure?.rules.axioms.map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
    })) ?? [],
    availableForces: structure?.forces.map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary || item.pressure,
    })) ?? [],
    availableLocations: structure?.locations.map((item) => ({
      id: item.id,
      name: item.name,
      summary: item.summary || item.narrativeFunction,
    })) ?? [],
    storyInputSource: input.storyInputSource,
    isStale: input.isStale,
  };
}
