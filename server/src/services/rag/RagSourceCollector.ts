import { prisma } from "../../db/prisma";
import type { RagOwnerType, RagSourceDocument } from "./types";
import { normalizeRagText } from "./utils";
import { ragJobManager, type RagJobPayloadRecord } from "./RagJobManager";

function buildJoinedText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((item) => (item ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export class RagSourceCollector {
  async loadSourceDocuments(
    ownerType: RagOwnerType,
    ownerId: string,
    tenantId: string,
    payload?: RagJobPayloadRecord,
  ): Promise<RagSourceDocument[]> {
    switch (ownerType) {
      case "novel": {
        const novel = await prisma.novel.findUnique({
          where: { id: ownerId },
          include: { world: true },
        });
        if (!novel) {
          return [];
        }
        const content = buildJoinedText(
          novel.title,
          novel.description ?? undefined,
          novel.outline ?? undefined,
          novel.structuredOutline ?? undefined,
          novel.world?.description ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: novel.id,
            worldId: novel.worldId ?? undefined,
            title: novel.title,
            content,
            metadata: {
              status: novel.status,
              updatedAt: novel.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "chapter": {
        const chapter = await prisma.chapter.findUnique({ where: { id: ownerId } });
        if (!chapter) {
          return [];
        }
        const content = buildJoinedText(chapter.title, chapter.content ?? undefined);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: chapter.novelId,
            title: chapter.title,
            content,
            metadata: {
              order: chapter.order,
              chapterOrder: chapter.order,
              state: chapter.generationState,
              updatedAt: chapter.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "world": {
        const world = await prisma.world.findUnique({ where: { id: ownerId } });
        if (!world) {
          return [];
        }
        const content = buildJoinedText(
          world.name,
          world.description ?? undefined,
          world.background ?? undefined,
          world.geography ?? undefined,
          world.magicSystem ?? undefined,
          world.politics ?? undefined,
          world.cultures ?? undefined,
          world.races ?? undefined,
          world.religions ?? undefined,
          world.technology ?? undefined,
          world.history ?? undefined,
          world.economy ?? undefined,
          world.factions ?? undefined,
          world.conflicts ?? undefined,
          world.overviewSummary ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            worldId: world.id,
            title: world.name,
            content,
            metadata: {
              worldType: world.worldType,
              status: world.status,
              version: world.version,
              updatedAt: world.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "character": {
        const character = await prisma.character.findUnique({ where: { id: ownerId } });
        if (!character) {
          return [];
        }
        const content = buildJoinedText(
          character.name,
          character.role,
          character.personality ?? undefined,
          character.background ?? undefined,
          character.development ?? undefined,
          character.currentState ?? undefined,
          character.currentGoal ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: character.novelId,
            title: character.name,
            content,
            metadata: {
              role: character.role,
              updatedAt: character.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "bible": {
        const bible = await prisma.novelBible.findUnique({ where: { novelId: ownerId } });
        if (!bible) {
          return [];
        }
        const content = buildJoinedText(
          bible.mainPromise ?? undefined,
          bible.coreSetting ?? undefined,
          bible.forbiddenRules ?? undefined,
          bible.characterArcs ?? undefined,
          bible.worldRules ?? undefined,
          bible.rawContent ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: bible.novelId,
            title: `bible-${bible.novelId}`,
            content,
            metadata: {
              updatedAt: bible.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "chapter_summary": {
        const summary = await prisma.chapterSummary.findUnique({ where: { chapterId: ownerId } });
        if (!summary) {
          return [];
        }
        const content = buildJoinedText(
          summary.summary,
          summary.keyEvents ?? undefined,
          summary.characterStates ?? undefined,
          summary.hook ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: summary.novelId,
            title: `chapter-summary-${summary.chapterId}`,
            content,
            metadata: {
              chapterId: summary.chapterId,
              updatedAt: summary.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "consistency_fact": {
        const fact = await prisma.consistencyFact.findUnique({ where: { id: ownerId } });
        if (!fact) {
          return [];
        }
        const content = normalizeRagText(fact.content);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: fact.novelId,
            title: `fact-${fact.category}`,
            content,
            metadata: {
              category: fact.category,
              source: fact.source,
              chapterId: fact.chapterId,
              updatedAt: fact.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "character_timeline": {
        const timeline = await prisma.characterTimeline.findUnique({ where: { id: ownerId } });
        if (!timeline) {
          return [];
        }
        const content = buildJoinedText(timeline.title, timeline.content);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: timeline.novelId,
            title: timeline.title,
            content,
            metadata: {
              source: timeline.source,
              characterId: timeline.characterId,
              chapterId: timeline.chapterId,
              chapterOrder: timeline.chapterOrder,
              updatedAt: timeline.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "world_library_item": {
        const item = await prisma.worldPropertyLibrary.findUnique({ where: { id: ownerId } });
        if (!item) {
          return [];
        }
        const content = buildJoinedText(item.name, item.description ?? undefined);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            worldId: item.sourceWorldId ?? undefined,
            title: item.name,
            content,
            metadata: {
              category: item.category,
              worldType: item.worldType,
              usageCount: item.usageCount,
              updatedAt: item.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "knowledge_document": {
        const document = await prisma.knowledgeDocument.findUnique({
          where: { id: ownerId },
          include: { activeVersion: true },
        });
        if (!document?.activeVersion || document.status === "archived") {
          return [];
        }
        const content = normalizeRagText(document.activeVersion.content);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            title: document.title,
            content,
            preChunks: ragJobManager.normalizePreChunks(payload?.preChunks),
            metadata: {
              fileName: document.fileName,
              kind: document.kind,
              sourceAnalysisId: document.sourceAnalysisId,
              version: document.activeVersion.versionNumber,
              checksum: document.activeVersion.contentHash,
              updatedAt: document.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      default:
        return [];
    }
  }
}

export const ragSourceCollector = new RagSourceCollector();
