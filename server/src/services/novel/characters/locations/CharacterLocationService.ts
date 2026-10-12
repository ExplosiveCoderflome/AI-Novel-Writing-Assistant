import {
  characterLocationProjectionSchema,
  type CharacterLocationDelta,
  type CharacterLocationState,
} from "@ai-novel/shared/types/characterLocation";
import { prisma } from "../../../../db/prisma";
import { buildChapterArtifactContentHash, ChapterArtifactContentVersionError } from "../../runtime/artifactSync/contracts";
import { projectLocationDeltas } from "./locationProjection";

export const CHARACTER_LOCATION_ARTIFACT_TYPE = "character_location_projection:v1";
const SYNC_MODE = "director_v2";
const PAGE_SIZE = 50;

export class CharacterLocationService {
  async applyFinalChapter(input: {
    novelId: string; chapterId: string; content: string; contentHash: string;
    deltas: CharacterLocationDelta[];
    contentProvenance?: "confirmed" | "debt";
  }): Promise<void> {
    if (buildChapterArtifactContentHash(input.content) !== input.contentHash) throw new ChapterArtifactContentVersionError();
    await prisma.$transaction(async tx => {
      const chapter = await tx.chapter.findFirst({
        where: { id: input.chapterId, novelId: input.novelId, content: input.content },
        select: { id: true, order: true, novel: { select: { directorVersion: true } } },
      });
      if (!chapter) throw new ChapterArtifactContentVersionError();
      if (chapter.novel.directorVersion !== "v2") throw new Error("角色位置回填仅适用于导演 V2。");
      const characters = await tx.character.findMany({
        where: { novelId: input.novelId }, select: { id: true, name: true },
      });
      const projection = characterLocationProjectionSchema.parse({
        schemaVersion: 1, novelId: input.novelId, chapterId: input.chapterId,
        chapterOrder: chapter.order, contentHash: input.contentHash,
        contentProvenance: input.contentProvenance ?? "confirmed",
        records: projectLocationDeltas({ content: input.content, characters, deltas: input.deltas, contentProvenance: input.contentProvenance }),
      });
      const identity = {
        novelId: input.novelId, chapterId: input.chapterId, contentHash: input.contentHash,
        artifactType: CHARACTER_LOCATION_ARTIFACT_TYPE, syncMode: SYNC_MODE,
      };
      const data = { status: "succeeded", metadataJson: JSON.stringify(projection) };
      await tx.chapterArtifactSyncCheckpoint.upsert({
        where: { novelId_chapterId_contentHash_artifactType_syncMode: identity },
        create: { ...identity, ...data, sourceType: "chapter_artifact_delta", sourceStage: "chapter_execution" },
        update: data,
      });
    });
  }

  async readBeforeChapter(input: {
    novelId: string; chapterOrder: number;
    characters: Array<{ id: string; name: string; currentLocation?: string | null }>;
  }): Promise<Map<string, CharacterLocationState>> {
    const result = new Map<string, CharacterLocationState>(input.characters.map(character => [character.id, {
      currentLocation: character.currentLocation?.trim() || null,
      source: character.currentLocation?.trim() ? "profile" : "unknown",
      sourceChapterId: null, sourceChapterOrder: null, contentHash: null, evidence: null, concern: null,
    }]));
    const resolved = new Set<string>();
    for (let skip = 0; result.size > resolved.size; skip += PAGE_SIZE) {
      const rows = await prisma.chapterArtifactSyncCheckpoint.findMany({
        where: {
          novelId: input.novelId, artifactType: CHARACTER_LOCATION_ARTIFACT_TYPE,
          syncMode: SYNC_MODE, status: "succeeded",
          chapter: { novelId: input.novelId, order: { lt: input.chapterOrder } },
        },
        orderBy: [{ chapter: { order: "desc" } }, { updatedAt: "desc" }, { id: "asc" }],
        skip, take: PAGE_SIZE,
        select: {
          novelId: true, chapterId: true, contentHash: true, metadataJson: true,
          chapter: { select: { id: true, novelId: true, order: true, content: true } },
        },
      });
      for (const row of rows) {
        if (row.novelId !== input.novelId || row.chapter.novelId !== input.novelId
          || row.chapter.order >= input.chapterOrder || row.chapter.id !== row.chapterId
          || !row.chapter.content || buildChapterArtifactContentHash(row.chapter.content) !== row.contentHash) continue;
        const projection = characterLocationProjectionSchema.parse(JSON.parse(row.metadataJson || "null"));
        if (projection.novelId !== row.novelId || projection.chapterId !== row.chapterId
          || projection.chapterOrder !== row.chapter.order || projection.contentHash !== row.contentHash) {
          throw new Error("角色位置记录与正文来源不一致，请检查后继续。");
        }
        for (const record of projection.records) {
          const previous = result.get(record.characterId);
          if (!previous || resolved.has(record.characterId)) continue;
          if (record.concern || projection.contentProvenance === "debt") {
            if (!previous.concern) previous.concern = `第 ${row.chapter.order} 章：${record.concern || "位置变化来源的章节质量待核对。"}`;
            continue;
          }
          if (!record.locationName || !record.evidence
            || !row.chapter.content.replace(/\s+/g, " ").includes(record.evidence.replace(/\s+/g, " ").trim())) continue;
          result.set(record.characterId, {
            currentLocation: record.locationName, source: "chapter", sourceChapterId: row.chapterId,
            sourceChapterOrder: row.chapter.order, contentHash: row.contentHash,
            evidence: record.evidence, concern: previous.concern,
          });
          resolved.add(record.characterId);
        }
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return result;
  }
}

export const characterLocationService = new CharacterLocationService();

export function formatCharacterLocationContext(
  characters: Array<{ id: string; name: string }>, states: Map<string, CharacterLocationState>,
): string {
  return characters.map(character => {
    const state = states.get(character.id);
    if (!state) return "";
    return [
      `${character.id} | ${character.name} | 最后确认位置=${state.currentLocation || "未知"}`,
      state.sourceChapterOrder !== null ? `来源=第${state.sourceChapterOrder}章` : "来源=基础设定，尚无正文位置记录",
      state.evidence ? `证据=${state.evidence}` : "",
      state.concern ? `待核对=${state.concern}` : "",
    ].filter(Boolean).join(" | ");
  }).filter(Boolean).join("\n");
}
