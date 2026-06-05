import type { NovelWorldHandbook } from "@ai-novel/shared/types/novelWorld";
import { normalizeWorldStructuredData } from "../../world/worldStructure";

export interface NovelWorldHandbookSource {
  title: string | null;
  coverSummary: string | null;
  structuredDataJson: string | null;
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseCommercialTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
    }
  } catch {
    // Fall through to delimiter parsing.
  }
  return raw
    .split(/[\n,，;；、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function buildNovelWorldHandbook(row: NovelWorldHandbookSource): NovelWorldHandbook | null {
  if (!row.structuredDataJson?.trim()) {
    return null;
  }
  const structure = normalizeWorldStructuredData(safeJsonParse<unknown>(row.structuredDataJson, null));
  const forceNameById = new Map(structure.forces.map((force) => [force.id, force.name]));
  const forceTensions = structure.relations.forceRelations.map((relation) => {
    const source = forceNameById.get(relation.sourceForceId) ?? relation.sourceForceId;
    const target = forceNameById.get(relation.targetForceId) ?? relation.targetForceId;
    return [source, relation.relation, target, relation.tension || relation.detail]
      .filter(Boolean)
      .join(" / ");
  });
  return {
    title: row.title,
    summary: structure.profile.summary || row.coverSummary || null,
    identity: structure.profile.identity || null,
    tone: structure.profile.tone || null,
    themes: structure.profile.themes.slice(0, 6),
    coreRules: structure.rules.axioms.slice(0, 5).map((rule) => ({
      name: rule.name || "未命名规则",
      summary: rule.summary || rule.enforcement || "",
      cost: rule.cost || null,
      boundary: rule.boundary || null,
    })),
    factions: structure.factions.slice(0, 5).map((faction) => ({
      name: faction.name,
      position: faction.position || null,
      doctrine: faction.doctrine || null,
    })),
    forces: structure.forces.slice(0, 6).map((force) => ({
      name: force.name,
      summary: force.summary || null,
      pressure: force.pressure || null,
      narrativeRole: force.narrativeRole || null,
    })),
    locations: structure.locations.slice(0, 6).map((location) => ({
      name: location.name,
      summary: location.summary || null,
      narrativeFunction: location.narrativeFunction || null,
      risk: location.risk || null,
    })),
    tensions: [
      structure.profile.coreConflict,
      ...forceTensions,
      ...structure.rules.sharedConsequences.map((item) => `共同代价：${item}`),
    ].filter((item): item is string => Boolean(item?.trim())).slice(0, 6),
    generationGuidance: {
      characterUses: [
        ...structure.forces.map((force) => [
          force.name,
          force.narrativeRole || force.pressure || force.summary,
        ].filter(Boolean).join("：")),
        ...structure.factions.map((faction) => [
          faction.name,
          faction.position || faction.doctrine,
        ].filter(Boolean).join("：")),
      ].filter((item): item is string => Boolean(item?.trim())).slice(0, 5),
      outlineUses: [
        structure.profile.coreConflict,
        ...forceTensions,
        ...structure.locations.map((location) => [
          location.name,
          location.narrativeFunction || location.risk || location.summary,
        ].filter(Boolean).join("：")),
      ].filter((item): item is string => Boolean(item?.trim())).slice(0, 5),
      chapterUses: [
        ...structure.rules.axioms.map((rule) => [
          rule.name,
          rule.boundary || rule.cost || rule.summary,
        ].filter(Boolean).join("：")),
        ...structure.locations.map((location) => [
          location.name,
          location.risk || location.narrativeFunction,
        ].filter(Boolean).join("：")),
      ].filter((item): item is string => Boolean(item?.trim())).slice(0, 5),
      avoidUses: [
        ...structure.rules.taboo,
        ...structure.rules.sharedConsequences.map((item) => `不要忽略后果：${item}`),
      ].filter((item): item is string => Boolean(item?.trim())).slice(0, 5),
    },
  };
}
