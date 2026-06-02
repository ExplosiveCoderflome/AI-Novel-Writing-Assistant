import type { NovelWorldSaveToLibraryInput } from "@ai-novel/shared/types/novelWorld";
import { prisma } from "../../../db/prisma";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  normalizeWorldStructuredData,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "../../world/worldStructure";
import { normalizeLayerStates } from "../../world/worldServiceShared";
import { safeJsonParse } from "./novelWorldProjection";
import { NovelWorldInstanceService, type NovelWorldInstanceView } from "./NovelWorldInstanceService";

export class NovelWorldLibrarySaveService {
  constructor(private readonly viewService = new NovelWorldInstanceService()) {}

  async saveNovelWorldToLibrary(input: {
    novelId: string;
  } & NovelWorldSaveToLibraryInput): Promise<NovelWorldInstanceView> {
    const novelWorld = await this.viewService.getByNovelId(input.novelId);
    if (!novelWorld) {
      throw new Error("这本书还没有本书世界。");
    }
    if (novelWorld.sourceWorldId) {
      throw new Error("本书世界已经关联世界库样本。");
    }

    const structuredData = normalizeWorldStructuredData(safeJsonParse<unknown>(novelWorld.structuredDataJson, null));
    structuredData.metadata = {
      ...structuredData.metadata,
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: structuredData.metadata.seededFrom ?? "novel-world",
      lastGeneratedAt: new Date().toISOString(),
    };
    const bindingSupport = buildWorldBindingSupport(structuredData);
    const title = novelWorld.title?.trim() || "本书世界";
    const coverSummary = novelWorld.coverSummary?.trim() || structuredData.profile.summary || null;
    const worldType = structuredData.profile.identity || "custom";
    const structuredFields = applyStructuredWorldToLegacyFields(structuredData, {
      id: "",
      name: title,
      worldType,
      description: coverSummary,
      overviewSummary: coverSummary,
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
    }, bindingSupport);

    await prisma.$transaction(async (tx) => {
      const world = await tx.world.create({
        data: {
          name: title,
          description: (structuredFields.description as string | null | undefined) ?? coverSummary,
          worldType,
          templateKey: "custom",
          axioms: structuredFields.axioms as string | null | undefined,
          geography: structuredFields.geography as string | null | undefined,
          politics: structuredFields.politics as string | null | undefined,
          conflicts: structuredFields.conflicts as string | null | undefined,
          factions: structuredFields.factions as string | null | undefined,
          status: "draft",
          layerStates: JSON.stringify(normalizeLayerStates(undefined)),
          overviewSummary: (structuredFields.overviewSummary as string | null | undefined) ?? coverSummary,
          structureJson: structuredFields.structureJson as string,
          bindingSupportJson: structuredFields.bindingSupportJson as string,
          structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
        },
      });
      await tx.novel.update({
        where: { id: input.novelId },
        data: { worldId: world.id },
      });
      await tx.$executeRaw`
        UPDATE "NovelWorld"
        SET
          "sourceWorldId" = ${world.id},
          "syncEnabled" = ${input.syncEnabled ?? true},
          "syncDirection" = ${(input.syncEnabled ?? true) ? "bidirectional" : "none"},
          "syncBaseVersion" = ${world.version},
          "savedToLibraryAt" = CURRENT_TIMESTAMP,
          "syncPendingChangesJson" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${novelWorld.id}
      `;
      await tx.worldSnapshot.create({
        data: {
          worldId: world.id,
          label: "novel-world-saved",
          data: JSON.stringify(world),
        },
      });
    });

    return this.viewService.getNovelWorldView(input.novelId);
  }
}
