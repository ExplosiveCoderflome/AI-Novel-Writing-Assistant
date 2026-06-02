import type { NovelWorldSyncDiff, NovelWorldSyncInput, NovelWorldSyncSection } from "@ai-novel/shared/types/novelWorld";
import type { WorldStructuredData } from "@ai-novel/shared/types/world";
import { prisma } from "../../../db/prisma";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "../../world/worldStructure";
import type { NovelWorldInstanceRow } from "./NovelWorldInstanceService";
import { safeJsonParse } from "./novelWorldProjection";

export const SYNC_SECTIONS: NovelWorldSyncSection[] = ["profile", "rules", "factions", "forces", "locations", "relations"];

const SYNC_SECTION_LABELS: Record<NovelWorldSyncSection, string> = {
  profile: "世界概要",
  rules: "核心规则",
  factions: "阵营",
  forces: "势力",
  locations: "地点",
  relations: "关系网络",
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function getSection(structure: WorldStructuredData, section: NovelWorldSyncSection): unknown {
  return structure[section];
}

function compactItems(items: Array<string | null | undefined>, fallback: string): string {
  const normalized = items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
  if (normalized.length === 0) {
    return fallback;
  }
  const visible = normalized.slice(0, 3).join("、");
  return normalized.length > 3 ? `${visible} 等 ${normalized.length} 项` : visible;
}

function summarizeProfile(structure: WorldStructuredData): string {
  return compactItems([
    structure.profile.identity,
    structure.profile.tone,
    structure.profile.coreConflict,
    structure.profile.summary,
  ], "未填写概要");
}

function summarizeRules(structure: WorldStructuredData): string {
  return compactItems([
    structure.rules.summary,
    ...structure.rules.axioms.map((rule) => rule.name || rule.summary),
    ...structure.rules.taboo.map((item) => `禁忌：${item}`),
  ], "未填写规则");
}

function summarizeRelations(structure: WorldStructuredData): string {
  const forceNameById = new Map(structure.forces.map((force) => [force.id, force.name]));
  return compactItems([
    ...structure.relations.forceRelations.map((relation) => {
      const source = forceNameById.get(relation.sourceForceId) ?? relation.sourceForceId;
      const target = forceNameById.get(relation.targetForceId) ?? relation.targetForceId;
      return [source, relation.relation, target].filter(Boolean).join(" / ");
    }),
    ...structure.relations.locationControls.map((relation) => {
      const force = forceNameById.get(relation.forceId) ?? relation.forceId;
      return [force, relation.relation, relation.locationId].filter(Boolean).join(" / ");
    }),
  ], "未填写关系");
}

function summarizeSection(structure: WorldStructuredData, section: NovelWorldSyncSection): string {
  switch (section) {
    case "profile":
      return summarizeProfile(structure);
    case "rules":
      return summarizeRules(structure);
    case "factions":
      return compactItems(structure.factions.map((item) => item.name), "未填写阵营");
    case "forces":
      return compactItems(structure.forces.map((item) => item.name), "未填写势力");
    case "locations":
      return compactItems(structure.locations.map((item) => item.name), "未填写地点");
    case "relations":
      return summarizeRelations(structure);
    default:
      return "未填写内容";
  }
}

function buildDifferenceSummary(input: {
  section: NovelWorldSyncSection;
  status: "changed" | "local_only" | "library_only";
  localStructure: WorldStructuredData;
  libraryStructure: WorldStructuredData;
}): string {
  const label = SYNC_SECTION_LABELS[input.section];
  const localSummary = summarizeSection(input.localStructure, input.section);
  const librarySummary = summarizeSection(input.libraryStructure, input.section);
  if (input.status === "local_only") {
    return `本书世界的「${label}」为：${localSummary}；世界库缺少这一部分。`;
  }
  if (input.status === "library_only") {
    return `世界库的「${label}」为：${librarySummary}；本书世界缺少这一部分。`;
  }
  return `本书世界的「${label}」为：${localSummary}；世界库为：${librarySummary}。`;
}

function setSection(
  structure: WorldStructuredData,
  section: NovelWorldSyncSection,
  value: unknown,
): WorldStructuredData {
  return normalizeWorldStructuredData({
    ...structure,
    [section]: value,
  }, structure);
}

export function buildSyncDiffItems(
  localStructure: WorldStructuredData,
  libraryStructure: WorldStructuredData,
): NovelWorldSyncDiff["differences"] {
  return SYNC_SECTIONS.flatMap((section) => {
    const localValue = getSection(localStructure, section);
    const libraryValue = getSection(libraryStructure, section);
    const localText = stableStringify(localValue);
    const libraryText = stableStringify(libraryValue);
    if (localText === libraryText) {
      return [];
    }
    const hasLocal = localText !== stableStringify(getSection(normalizeWorldStructuredData(null), section));
    const hasLibrary = libraryText !== stableStringify(getSection(normalizeWorldStructuredData(null), section));
    const status = hasLocal && hasLibrary ? "changed" : hasLocal ? "local_only" : "library_only";
    return [{
      section,
      label: SYNC_SECTION_LABELS[section],
      status,
      summary: buildDifferenceSummary({
        section,
        status,
        localStructure,
        libraryStructure,
      }),
    }];
  });
}

export function buildSyncPendingChangesPayload(
  differences: NovelWorldSyncDiff["differences"],
): string | null {
  if (differences.length === 0) {
    return null;
  }
  return JSON.stringify({
    differenceCount: differences.length,
    sections: differences.map((item) => item.section),
    summary: differences.map((item) => `${item.label}：${item.summary}`).join("\n"),
    computedAt: new Date().toISOString(),
  });
}

export class NovelWorldSyncService {
  constructor(
    private readonly ensureNovelWorld: (novelId: string) => Promise<NovelWorldInstanceRow | null>,
  ) {}

  async getSyncDiff(novelId: string): Promise<NovelWorldSyncDiff> {
    const novelWorld = await this.ensureNovelWorld(novelId);
    if (!novelWorld) {
      return {
        canSync: false,
        reason: "这本书还没有本书世界。",
        novelWorldId: null,
        sourceWorldId: null,
        sourceWorldName: null,
        differenceCount: 0,
        differences: [],
      };
    }
    if (!novelWorld.sourceWorldId) {
      await this.persistPendingChanges(novelWorld.id, null);
      return {
        canSync: false,
        reason: "本书世界还没有关联世界库样本。",
        novelWorldId: novelWorld.id,
        sourceWorldId: null,
        sourceWorldName: null,
        differenceCount: 0,
        differences: [],
      };
    }

    const sourceWorld = await prisma.world.findUnique({
      where: { id: novelWorld.sourceWorldId },
      select: {
        id: true,
        name: true,
        structureJson: true,
        bindingSupportJson: true,
      },
    });
    if (!sourceWorld) {
      await this.persistPendingChanges(novelWorld.id, null);
      return {
        canSync: false,
        reason: "关联的世界库样本不存在。",
        novelWorldId: novelWorld.id,
        sourceWorldId: novelWorld.sourceWorldId,
        sourceWorldName: null,
        differenceCount: 0,
        differences: [],
      };
    }

    const localStructure = normalizeWorldStructuredData(safeJsonParse<unknown>(novelWorld.structuredDataJson, null));
    const libraryStructure = parseWorldStructurePayload(
      sourceWorld.structureJson,
      sourceWorld.bindingSupportJson,
    ).structure;
    const differences = buildSyncDiffItems(localStructure, libraryStructure);
    await this.persistPendingChanges(novelWorld.id, buildSyncPendingChangesPayload(differences));
    return {
      canSync: true,
      reason: null,
      novelWorldId: novelWorld.id,
      sourceWorldId: sourceWorld.id,
      sourceWorldName: sourceWorld.name,
      differenceCount: differences.length,
      differences,
    };
  }

  async syncWithLibrary(novelId: string, input: NovelWorldSyncInput): Promise<NovelWorldSyncDiff> {
    const novelWorld = await this.ensureNovelWorld(novelId);
    if (!novelWorld?.sourceWorldId) {
      throw new Error("本书世界还没有关联世界库样本。");
    }
    if (input.direction === "none") {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "NovelWorld"
          SET
            "syncEnabled" = ${false},
            "syncDirection" = ${"none"},
            "syncPendingChangesJson" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${novelWorld.id}
        `;
        await tx.$executeRaw`
          INSERT INTO "WorldSyncRecord" (
            "id",
            "novelWorldId",
            "sourceWorldId",
            "direction",
            "syncedFieldsJson",
            "diffSummary",
            "triggeredBy",
            "createdAt"
          ) VALUES (
            ${`world_sync_${novelWorld.id}_${Date.now()}`},
            ${novelWorld.id},
            ${novelWorld.sourceWorldId},
            ${"none"},
            ${JSON.stringify([])},
            ${"关闭同步：本书世界保留为独立副本。"},
            ${"user"},
            CURRENT_TIMESTAMP
          )
        `;
      });
      return {
        canSync: false,
        reason: "同步已关闭，本书世界会保留为独立副本。",
        novelWorldId: novelWorld.id,
        sourceWorldId: novelWorld.sourceWorldId,
        sourceWorldName: null,
        differenceCount: 0,
        differences: [],
      };
    }
    const sourceWorld = await prisma.world.findUnique({
      where: { id: novelWorld.sourceWorldId },
    });
    if (!sourceWorld) {
      throw new Error("关联的世界库样本不存在。");
    }

    const selectedSections = (input.sections?.length ? input.sections : SYNC_SECTIONS)
      .filter((section, index, sections) => SYNC_SECTIONS.includes(section) && sections.indexOf(section) === index);
    if (selectedSections.length === 0) {
      throw new Error("请选择至少一个要同步的世界部分。");
    }

    const localStructure = normalizeWorldStructuredData(safeJsonParse<unknown>(novelWorld.structuredDataJson, null));
    const libraryStructure = parseWorldStructurePayload(sourceWorld.structureJson, sourceWorld.bindingSupportJson).structure;
    const mergedStructure = selectedSections.reduce((current, section) => {
      const source = input.direction === "push" ? localStructure : libraryStructure;
      return setSection(current, section, getSection(source, section));
    }, input.direction === "push" ? libraryStructure : localStructure);
    mergedStructure.metadata = {
      ...mergedStructure.metadata,
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      lastGeneratedAt: new Date().toISOString(),
    };
    const nextBindingSupport = buildWorldBindingSupport(mergedStructure);
    const structuredFields = applyStructuredWorldToLegacyFields(
      mergedStructure,
      input.direction === "push"
        ? sourceWorld
        : {
          id: novelWorld.id,
          name: novelWorld.title ?? sourceWorld.name,
          worldType: sourceWorld.worldType,
          description: novelWorld.coverSummary ?? sourceWorld.description,
          overviewSummary: novelWorld.coverSummary ?? sourceWorld.overviewSummary,
          axioms: null,
          background: null,
          geography: null,
          cultures: null,
          magicSystem: null,
          politics: null,
          races: null,
          religions: null,
          technology: null,
          conflicts: null,
          history: null,
          economy: null,
          factions: null,
          selectedElements: null,
          structureJson: null,
          bindingSupportJson: null,
          structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
        },
      nextBindingSupport,
    );

    await prisma.$transaction(async (tx) => {
      if (input.direction === "push") {
        const updatedWorld = await tx.world.update({
          where: { id: sourceWorld.id },
          data: {
            ...structuredFields,
            version: { increment: 1 },
          },
        });
        await tx.$executeRaw`
          UPDATE "NovelWorld"
          SET
            "syncEnabled" = ${true},
            "syncDirection" = CASE WHEN "syncDirection" = 'none' THEN ${"bidirectional"} ELSE "syncDirection" END,
            "syncBaseVersion" = ${updatedWorld.version},
            "lastSyncedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${novelWorld.id}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE "NovelWorld"
          SET
            "title" = COALESCE("title", ${sourceWorld.name}),
            "coverSummary" = ${((structuredFields.overviewSummary as string | null | undefined) ?? sourceWorld.overviewSummary ?? sourceWorld.description ?? null)},
            "structuredDataJson" = ${structuredFields.structureJson as string},
            "bindingContractJson" = ${structuredFields.bindingSupportJson as string},
            "storySliceJson" = NULL,
            "storySliceOverridesJson" = NULL,
            "storySliceBuiltAt" = NULL,
            "storySliceDigest" = NULL,
            "syncEnabled" = ${true},
            "syncDirection" = CASE WHEN "syncDirection" = 'none' THEN ${"bidirectional"} ELSE "syncDirection" END,
            "syncBaseVersion" = ${sourceWorld.version},
            "lastSyncedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${novelWorld.id}
        `;
      }
      await tx.$executeRaw`
        INSERT INTO "WorldSyncRecord" (
          "id",
          "novelWorldId",
          "sourceWorldId",
          "direction",
          "syncedFieldsJson",
          "diffSummary",
          "triggeredBy",
          "createdAt"
        ) VALUES (
          ${`world_sync_${novelWorld.id}_${Date.now()}`},
          ${novelWorld.id},
          ${sourceWorld.id},
          ${input.direction},
          ${JSON.stringify(selectedSections)},
          ${`${input.direction === "push" ? "推送" : "拉取"}：${selectedSections.map((section) => SYNC_SECTION_LABELS[section]).join("、")}`},
          ${"user"},
          CURRENT_TIMESTAMP
        )
      `;
    });

    return this.getSyncDiff(novelId);
  }

  private async persistPendingChanges(novelWorldId: string, payload: string | null): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "NovelWorld"
      SET "syncPendingChangesJson" = ${payload}
      WHERE "id" = ${novelWorldId}
    `;
  }
}
