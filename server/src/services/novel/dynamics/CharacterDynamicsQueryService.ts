import type {
  CharacterCandidate,
  DynamicCharacterOverview,
} from "@ai-novel/shared/types/characterDynamics";
import { prisma } from "../../../db/prisma";
import { compareDynamicRows, PROJECTION_SOURCE_TYPES } from "./characterDynamicsShared";
import {
  buildOverviewItem,
  buildOverviewSummary,
  buildVolumeWindows,
  resolveCurrentVolume,
  toCharacterCandidate,
  toCharacterFactionTrack,
  toCharacterRelationStage,
  toCharacterVolumeAssignment,
} from "./characterDynamicsUtils";

export class CharacterDynamicsQueryService {
  async getOverview(
    novelId: string,
    options: { chapterOrder?: number } = {},
  ): Promise<DynamicCharacterOverview> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        chapters: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            content: true,
          },
        },
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
            castRole: true,
            currentState: true,
            currentGoal: true,
          },
        },
        volumePlans: {
          orderBy: { sortOrder: "asc" },
          include: {
            chapters: {
              orderBy: { chapterOrder: "asc" },
            },
          },
        },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }

    const currentChapterOrder = typeof options.chapterOrder === "number"
      ? options.chapterOrder
      : novel.chapters
        .filter((chapter) => Boolean(chapter.content?.trim()))
        .map((chapter) => chapter.order)
        .sort((a, b) => b - a)[0]
        ?? novel.chapters.map((chapter) => chapter.order).sort((a, b) => b - a)[0]
        ?? null;
    const volumeWindows = buildVolumeWindows(novel.volumePlans);
    const currentVolume = resolveCurrentVolume(volumeWindows, currentChapterOrder);
    const currentVolumeChapterOrders = new Set(
      novel.volumePlans.find((volume) => volume.id === currentVolume?.id)?.chapters.map((chapter) => chapter.chapterOrder) ?? [],
    );

    const [candidateRows, assignmentRows, factionRows, relationStageRows, timelineRows] = await Promise.all([
      prisma.characterCandidate.findMany({
        where: { novelId, status: "pending" },
        include: {
          sourceChapter: {
            select: { order: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      currentVolume?.id
        ? prisma.characterVolumeAssignment.findMany({
            where: { novelId, volumeId: currentVolume.id },
            include: {
              volume: {
                select: { title: true },
              },
            },
            orderBy: [{ isCore: "desc" }, { updatedAt: "desc" }],
          })
        : Promise.resolve([]),
      prisma.characterFactionTrack.findMany({
        where: {
          novelId,
          OR: [
            { sourceType: { notIn: PROJECTION_SOURCE_TYPES } },
            ...(currentVolume?.id
              ? [{ sourceType: { in: PROJECTION_SOURCE_TYPES }, volumeId: currentVolume.id }]
              : []),
          ],
        },
        include: {
          volume: {
            select: { title: true },
          },
        },
        orderBy: [{ chapterOrder: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.characterRelationStage.findMany({
        where: {
          novelId,
          isCurrent: true,
          OR: [
            { sourceType: { notIn: PROJECTION_SOURCE_TYPES } },
            ...(currentVolume?.id
              ? [{ sourceType: { in: PROJECTION_SOURCE_TYPES }, volumeId: currentVolume.id }]
              : []),
          ],
        },
        include: {
          sourceCharacter: { select: { name: true } },
          targetCharacter: { select: { name: true } },
          volume: { select: { title: true } },
        },
        orderBy: [{ chapterOrder: "desc" }, { updatedAt: "desc" }],
      }),
      currentVolumeChapterOrders.size > 0
        ? prisma.characterTimeline.findMany({
            where: {
              novelId,
              chapterOrder: { in: Array.from(currentVolumeChapterOrders) },
            },
            select: {
              characterId: true,
              chapterOrder: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const candidates = candidateRows.map((row) => toCharacterCandidate(row));
    const assignments = assignmentRows.map((row) => toCharacterVolumeAssignment(row));
    const factionTracks = factionRows.map((row) => toCharacterFactionTrack(row));
    const relations = relationStageRows.map((row) => toCharacterRelationStage(row));

    const assignmentByCharacterId = new Map(assignments.map((assignment) => [assignment.characterId, assignment]));
    const appearanceOrdersByCharacterId = new Map<string, number[]>();
    for (const row of timelineRows) {
      if (typeof row.chapterOrder !== "number") {
        continue;
      }
      const current = appearanceOrdersByCharacterId.get(row.characterId) ?? [];
      current.push(row.chapterOrder);
      appearanceOrdersByCharacterId.set(
        row.characterId,
        Array.from(new Set(current)).sort((a, b) => a - b),
      );
    }

    const factionTrackByCharacterId = new Map<string, typeof factionTracks[number]>();
    for (const track of factionTracks.slice().sort(compareDynamicRows)) {
      if (!factionTrackByCharacterId.has(track.characterId)) {
        factionTrackByCharacterId.set(track.characterId, track);
      }
    }

    const characters = novel.characters
      .map((character) => buildOverviewItem({
        character,
        assignment: assignmentByCharacterId.get(character.id) ?? null,
        factionTrack: factionTrackByCharacterId.get(character.id) ?? null,
        appearanceOrders: appearanceOrdersByCharacterId.get(character.id) ?? [],
        currentChapterOrder,
      }))
      .sort((left, right) => {
        if (left.isCoreInVolume !== right.isCoreInVolume) {
          return left.isCoreInVolume ? -1 : 1;
        }
        if (left.absenceRisk !== right.absenceRisk) {
          return ["high", "warn", "info", "none"].indexOf(left.absenceRisk) - ["high", "warn", "info", "none"].indexOf(right.absenceRisk);
        }
        return left.name.localeCompare(right.name, "zh-Hans-CN");
      });

    const highCount = characters.filter((item) => item.absenceRisk === "high").length;
    const warnCount = characters.filter((item) => item.absenceRisk === "warn").length;
    const coreCount = characters.filter((item) => item.isCoreInVolume).length;

    return {
      novelId,
      currentVolume,
      summary: buildOverviewSummary({
        volumeTitle: currentVolume?.title ?? null,
        coreCount,
        warnCount,
        highCount,
        pendingCandidateCount: candidates.length,
        relationStageCount: relations.length,
      }),
      pendingCandidateCount: candidates.length,
      characters,
      relations,
      candidates,
      factionTracks,
      assignments,
    };
  }

  async buildContextDigest(novelId: string, options: { chapterOrder?: number } = {}): Promise<string> {
    const overview = await this.getOverview(novelId, options);
    return this.formatContextDigest(overview);
  }

  formatContextDigest(overview: DynamicCharacterOverview): string {
    const characterLines = overview.characters.slice(0, 8).map((item) => (
      [
        `${item.name}(${item.role})`,
        item.isCoreInVolume ? "核心卷级角色" : "非核心卷级角色",
        item.volumeRoleLabel ? `卷级身份=${item.volumeRoleLabel}` : "",
        item.volumeResponsibility ? `职责=${item.volumeResponsibility}` : "",
        item.currentGoal ? `当前目标=${item.currentGoal}` : "",
        item.currentState ? `当前状态=${item.currentState}` : "",
        item.factionLabel ? `阵营=${item.factionLabel}` : "",
        item.stanceLabel ? `立场=${item.stanceLabel}` : "",
        item.absenceRisk !== "none" ? `缺席风险=${item.absenceRisk}(跨度=${item.absenceSpan})` : "",
      ].filter(Boolean).join(" | ")
    ));
    const relationLines = overview.relations.slice(0, 8).map((item) => (
      `${item.sourceCharacterName} -> ${item.targetCharacterName}: ${item.stageLabel} | ${item.stageSummary}${item.nextTurnPoint ? ` | 下一步=${item.nextTurnPoint}` : ""}`
    ));
    return [
      `Dynamic character system summary: ${overview.summary}`,
      overview.currentVolume
        ? `Current volume: ${overview.currentVolume.title} (chapters ${overview.currentVolume.startChapterOrder ?? "?"}-${overview.currentVolume.endChapterOrder ?? "?"}, current=${overview.currentVolume.currentChapterOrder ?? "?"})`
        : "Current volume: unavailable",
      `Volume assignments and risks:\n${characterLines.join("\n") || "none"}`,
      `Current relationship stages:\n${relationLines.join("\n") || "none"}`,
      `Pending character candidates: ${overview.pendingCandidateCount} (do not inject into generation until confirmed)`,
    ].join("\n\n");
  }

  async listCandidates(novelId: string): Promise<CharacterCandidate[]> {
    const rows = await prisma.characterCandidate.findMany({
      where: { novelId },
      include: {
        sourceChapter: {
          select: { order: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => toCharacterCandidate(row));
  }
}

export const characterDynamicsQueryService = new CharacterDynamicsQueryService();
