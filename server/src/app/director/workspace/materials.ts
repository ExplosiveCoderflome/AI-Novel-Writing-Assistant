import type {Character, NovelWorld, World} from "@prisma/client";
import type {DirectorCharacterMaterials, DirectorWorldMaterials} from "@ai-novel/shared/types/director/workspace";
import {storyWorldSliceSchema} from "@ai-novel/shared/types/storyWorldSlice";
import {normalizeWorldStructuredData} from "../../../services/world/worldStructure";

/** Display saved data only: never initialize a copy, build a slice, or synchronize the library. */
export function projectWorldMaterials(novelId: string, local: NovelWorld | null, library: World | null, legacySlice: string | null): DirectorWorldMaterials | null {
  if (!local && !library) return null;
  const warnings: string[] = [];
  let structure: DirectorWorldMaterials["structure"] = null;
  const rawStructure = local ? local.structuredDataJson : library?.structureJson;
  if (rawStructure?.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawStructure);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid saved structure");
      structure = normalizeWorldStructuredData(parsed);
    } catch {
      warnings.push("世界详细设定读取失败，请核对本书保存的世界资料。");
    }
  }
  let storySlice: DirectorWorldMaterials["storySlice"] = null;
  const rawSlice = local ? local.storySliceJson : legacySlice;
  if (rawSlice?.trim()) {
    try {
      const parsed = storyWorldSliceSchema.parse(JSON.parse(rawSlice));
      const worldIds = local ? [local.id, local.sourceWorldId] : [library?.id];
      if (parsed.storyId !== novelId || !worldIds.includes(parsed.worldId)) throw new Error("invalid saved slice ownership");
      storySlice = parsed;
    } catch {
      warnings.push("本书写作范围读取失败或归属不符，请核对保存的世界使用范围。");
    }
  }
  return {
    id: local?.id ?? library!.id,
    name: local ? local.title?.trim() || "本书世界" : library!.name,
    summary: structure?.profile.summary || (local ? local.coverSummary : library?.overviewSummary || library?.description) || null,
    source: local ? "novel" : "library", structure, storySlice, warnings,
    // External sample fields cannot override or fill gaps in an existing book copy.
    ...(!local && library ? {legacyLayers: {
      axioms:library.axioms, background:library.background, geography:library.geography, cultures:library.cultures,
      magicSystem:library.magicSystem, politics:library.politics, races:library.races, religions:library.religions,
      technology:library.technology, conflicts:library.conflicts, history:library.history, economy:library.economy, factions:library.factions,
    }} : {}),
  };
}

export function projectCharacterMaterials(character: Character): DirectorCharacterMaterials {
  const {id,name,role,storyFunction,currentGoal,personality,background,development,relationToProtagonist,
    identityLabel,factionLabel,stanceLabel,powerLevel,realm,outerGoal,innerNeed,fear,wound,misbelief,secret,moralLine,
    firstImpression,appearance,physique,attireStyle,signatureDetail,voiceTexture,presenceImpression,arcStart,arcMidpoint,arcClimax,arcEnd} = character;
  return {id,name,role,storyFunction,currentGoal,personality,background,development,relationToProtagonist,
    identityLabel,factionLabel,stanceLabel,powerLevel,realm,outerGoal,innerNeed,fear,wound,misbelief,secret,moralLine,
    firstImpression,appearance,physique,attireStyle,signatureDetail,voiceTexture,presenceImpression,arcStart,arcMidpoint,arcClimax,arcEnd};
}

export function savedStringList(raw: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  } catch { return []; }
}
