import type { NovelWorldManualInput } from "@ai-novel/shared/types/novelWorld";
import { prisma } from "../../../db/prisma";
import {
  buildWorldBindingSupport,
  normalizeWorldStructuredData,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "../../world/worldStructure";
import { NovelWorldInstanceService, type NovelWorldInstanceView } from "./NovelWorldInstanceService";

export class NovelWorldManualService {
  constructor(private readonly viewService = new NovelWorldInstanceService()) {}

  async createManualNovelWorld(input: {
    novelId: string;
  } & NovelWorldManualInput): Promise<NovelWorldInstanceView> {
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      select: {
        id: true,
        title: true,
        description: true,
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }

    const title = input.title?.trim() || `${novel.title}世界`;
    const coverSummary = input.coverSummary?.trim()
      || novel.description?.trim()
      || `围绕《${novel.title}》展开的本书世界。`;
    const structuredData = normalizeWorldStructuredData(null);
    structuredData.profile = {
      ...structuredData.profile,
      summary: coverSummary,
      identity: "本书自定义世界",
      themes: structuredData.profile.themes.length > 0 ? structuredData.profile.themes : ["待完善"],
    };
    structuredData.metadata = {
      ...structuredData.metadata,
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: "manual",
      lastGeneratedAt: new Date().toISOString(),
    };
    const bindingSupport = buildWorldBindingSupport(structuredData);
    const novelWorldId = `novel_world_${input.novelId}`;
    const structuredDataJson = JSON.stringify(structuredData);
    const bindingContractJson = JSON.stringify(bindingSupport);

    await prisma.$transaction(async (tx) => {
      await tx.novel.update({
        where: { id: input.novelId },
        data: {
          worldId: null,
          storyWorldSliceJson: null,
          storyWorldSliceOverridesJson: null,
        },
      });
      await tx.$executeRaw`
        INSERT INTO "NovelWorld" (
          "id",
          "novelId",
          "sourceWorldId",
          "sourceType",
          "title",
          "coverSummary",
          "structuredDataJson",
          "bindingContractJson",
          "storySliceJson",
          "storySliceOverridesJson",
          "storySliceSchemaVersion",
          "storySliceBuiltAt",
          "storySliceDigest",
          "syncEnabled",
          "syncDirection",
          "syncBaseVersion",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${novelWorldId},
          ${input.novelId},
          ${null},
          ${"manual"},
          ${title},
          ${coverSummary},
          ${structuredDataJson},
          ${bindingContractJson},
          ${null},
          ${null},
          ${1},
          ${null},
          ${null},
          ${false},
          ${"none"},
          ${null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("novelId") DO UPDATE SET
          "sourceWorldId" = NULL,
          "sourceType" = EXCLUDED."sourceType",
          "title" = EXCLUDED."title",
          "coverSummary" = EXCLUDED."coverSummary",
          "structuredDataJson" = EXCLUDED."structuredDataJson",
          "bindingContractJson" = EXCLUDED."bindingContractJson",
          "storySliceJson" = NULL,
          "storySliceOverridesJson" = NULL,
          "storySliceBuiltAt" = NULL,
          "storySliceDigest" = NULL,
          "syncEnabled" = false,
          "syncDirection" = ${"none"},
          "syncBaseVersion" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      `;
    });

    return this.viewService.getNovelWorldView(input.novelId);
  }
}
