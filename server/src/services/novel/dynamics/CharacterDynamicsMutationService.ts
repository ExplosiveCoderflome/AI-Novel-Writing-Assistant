import type {
  CharacterRelationStage,
  DynamicCharacterOverview,
} from "@ai-novel/shared/types/characterDynamics";
import { prisma } from "../../../db/prisma";
import type {
  ConfirmCandidateInput,
  MergeCandidateInput,
  UpdateCharacterDynamicStateInput,
  UpdateRelationStageInput,
} from "./characterDynamicsSchemas";
import { generateVolumeProjection, extractChapterDynamics } from "./characterDynamicsLlm";
import { CharacterDynamicsQueryService } from "./CharacterDynamicsQueryService";
import {
  CHAPTER_EXTRACT_SOURCE_TYPE,
  MANUAL_SOURCE_TYPE,
  normalizeName,
  PROJECTION_SOURCE_TYPES,
} from "./characterDynamicsShared";
import { buildVolumeWindows, dedupeStrings, mergeProjectionAssignments, resolveCurrentVolume, toCharacterRelationStage } from "./characterDynamicsUtils";

export class CharacterDynamicsMutationService {
  constructor(private readonly queryService: CharacterDynamicsQueryService) {}

  private getNovelContextService() {
    const { NovelContextService } = require("../NovelContextService") as typeof import("../NovelContextService");
    return new NovelContextService();
  }

  async confirmCandidate(novelId: string, candidateId: string, input: ConfirmCandidateInput) {
    const candidate = await prisma.characterCandidate.findFirst({
      where: { id: candidateId, novelId },
      include: {
        sourceChapter: {
          select: { id: true, order: true },
        },
      },
    });
    if (!candidate) {
      throw new Error("角色候选不存在。");
    }

    const createdCharacter = await this.getNovelContextService().createCharacter(novelId, {
      name: candidate.proposedName,
      role: input.role?.trim() || candidate.proposedRole?.trim() || "新角色",
      castRole: input.castRole,
      relationToProtagonist: input.relationToProtagonist?.trim() || undefined,
      currentState: input.currentState?.trim() || undefined,
      currentGoal: input.currentGoal?.trim() || undefined,
      background: input.summary?.trim() || candidate.summary?.trim() || undefined,
    });

    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.update({
        where: { id: candidate.id },
        data: {
          matchedCharacterId: createdCharacter.id,
          status: "confirmed",
        },
      });
      await tx.creativeDecision.create({
        data: {
          novelId,
          chapterId: candidate.sourceChapter?.id ?? null,
          category: "character_dynamic_confirm",
          content: `确认新角色：${createdCharacter.name}。来源候选：${candidate.proposedName}。${candidate.summary ?? ""}`.trim(),
          importance: "high",
          sourceType: "character_candidate",
          sourceRefId: candidate.id,
          expiresAt: candidate.sourceChapter?.order ? candidate.sourceChapter.order + 6 : null,
        },
      });
    });

    await this.rebuildDynamics(novelId, { sourceType: "rebuild_projection" });
    return {
      candidateId: candidate.id,
      characterId: createdCharacter.id,
    };
  }

  async mergeCandidate(novelId: string, candidateId: string, input: MergeCandidateInput) {
    const [candidate, character] = await Promise.all([
      prisma.characterCandidate.findFirst({
        where: { id: candidateId, novelId },
        include: {
          sourceChapter: {
            select: { id: true, order: true },
          },
        },
      }),
      prisma.character.findFirst({
        where: { id: input.characterId, novelId },
        select: { id: true, name: true },
      }),
    ]);
    if (!candidate) {
      throw new Error("角色候选不存在。");
    }
    if (!character) {
      throw new Error("要合并到的角色不存在。");
    }

    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.update({
        where: { id: candidate.id },
        data: {
          matchedCharacterId: character.id,
          status: "merged",
        },
      });
      await tx.creativeDecision.create({
        data: {
          novelId,
          chapterId: candidate.sourceChapter?.id ?? null,
          category: "character_dynamic_merge",
          content: `候选角色 ${candidate.proposedName} 已并入 ${character.name}。${input.summary?.trim() || candidate.summary || ""}`.trim(),
          importance: "normal",
          sourceType: "character_candidate",
          sourceRefId: candidate.id,
          expiresAt: candidate.sourceChapter?.order ? candidate.sourceChapter.order + 4 : null,
        },
      });
    });

    await this.rebuildDynamics(novelId, { sourceType: "rebuild_projection" });
    return {
      candidateId: candidate.id,
      characterId: character.id,
    };
  }

  async updateCharacterDynamicState(novelId: string, characterId: string, input: UpdateCharacterDynamicStateInput): Promise<DynamicCharacterOverview> {
    const character = await prisma.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true, name: true },
    });
    if (!character) {
      throw new Error("角色不存在。");
    }

    const overview = await this.queryService.getOverview(novelId, {
      chapterOrder: input.chapterOrder,
    });
    const volumeId = input.volumeId || overview.currentVolume?.id || null;

    await prisma.$transaction(async (tx) => {
      if (typeof input.currentState === "string" || typeof input.currentGoal === "string") {
        await tx.character.update({
          where: { id: characterId },
          data: {
            ...(typeof input.currentState === "string" ? { currentState: input.currentState } : {}),
            ...(typeof input.currentGoal === "string" ? { currentGoal: input.currentGoal } : {}),
            lastEvolvedAt: new Date(),
          },
        });
      }

      if (volumeId && (
        typeof input.roleLabel === "string"
        || typeof input.responsibility === "string"
        || typeof input.appearanceExpectation === "string"
        || Array.isArray(input.plannedChapterOrders)
        || typeof input.isCore === "boolean"
      )) {
        const existingAssignment = await tx.characterVolumeAssignment.findFirst({
          where: { novelId, characterId, volumeId },
        });
        if (existingAssignment) {
          await tx.characterVolumeAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              ...(typeof input.roleLabel === "string" ? { roleLabel: input.roleLabel || null } : {}),
              ...(typeof input.responsibility === "string" ? { responsibility: input.responsibility } : {}),
              ...(typeof input.appearanceExpectation === "string" ? { appearanceExpectation: input.appearanceExpectation || null } : {}),
              ...(Array.isArray(input.plannedChapterOrders) ? { plannedChapterOrdersJson: JSON.stringify(input.plannedChapterOrders) } : {}),
              ...(typeof input.isCore === "boolean" ? { isCore: input.isCore } : {}),
              ...(typeof input.absenceWarningThreshold === "number" ? { absenceWarningThreshold: input.absenceWarningThreshold } : {}),
              ...(typeof input.absenceHighRiskThreshold === "number" ? { absenceHighRiskThreshold: input.absenceHighRiskThreshold } : {}),
            },
          });
        } else if (typeof input.responsibility === "string") {
          await tx.characterVolumeAssignment.create({
            data: {
              novelId,
              characterId,
              volumeId,
              roleLabel: input.roleLabel || null,
              responsibility: input.responsibility,
              appearanceExpectation: input.appearanceExpectation || null,
              plannedChapterOrdersJson: JSON.stringify(input.plannedChapterOrders ?? []),
              isCore: input.isCore ?? false,
              absenceWarningThreshold: input.absenceWarningThreshold ?? 3,
              absenceHighRiskThreshold: input.absenceHighRiskThreshold ?? 5,
            },
          });
        }
      }

      if (typeof input.factionLabel === "string" && input.factionLabel.trim()) {
        await tx.characterFactionTrack.create({
          data: {
            novelId,
            characterId,
            volumeId,
            chapterId: input.chapterId ?? null,
            chapterOrder: input.chapterOrder ?? null,
            factionLabel: input.factionLabel,
            stanceLabel: input.stanceLabel || null,
            summary: input.summary || null,
            sourceType: MANUAL_SOURCE_TYPE,
          },
        });
      }

      const decisionSegments = [
        typeof input.currentState === "string" ? `状态=${input.currentState}` : "",
        typeof input.currentGoal === "string" ? `目标=${input.currentGoal}` : "",
        typeof input.factionLabel === "string" ? `阵营=${input.factionLabel}` : "",
        typeof input.roleLabel === "string" ? `卷级身份=${input.roleLabel}` : "",
        typeof input.responsibility === "string" ? `职责=${input.responsibility}` : "",
        input.decisionNote?.trim() || "",
      ].filter(Boolean);
      if (decisionSegments.length > 0) {
        await tx.creativeDecision.create({
          data: {
            novelId,
            chapterId: input.chapterId ?? null,
            category: "character_dynamic_manual_update",
            content: `${character.name} 动态状态更新：${decisionSegments.join("；")}`,
            importance: "normal",
            sourceType: "character_dynamic_state",
            sourceRefId: character.id,
            expiresAt: input.chapterOrder ? input.chapterOrder + 5 : null,
          },
        });
      }
    });

    return this.queryService.getOverview(novelId, {
      chapterOrder: input.chapterOrder,
    });
  }

  async updateRelationStage(novelId: string, relationId: string, input: UpdateRelationStageInput): Promise<CharacterRelationStage> {
    const relation = await prisma.characterRelation.findFirst({
      where: { id: relationId, novelId },
      include: {
        sourceCharacter: { select: { name: true } },
        targetCharacter: { select: { name: true } },
      },
    });
    if (!relation) {
      throw new Error("角色关系不存在。");
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.characterRelationStage.updateMany({
        where: {
          novelId,
          sourceCharacterId: relation.sourceCharacterId,
          targetCharacterId: relation.targetCharacterId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });
      const nextStage = await tx.characterRelationStage.create({
        data: {
          novelId,
          relationId: relation.id,
          sourceCharacterId: relation.sourceCharacterId,
          targetCharacterId: relation.targetCharacterId,
          volumeId: input.volumeId ?? null,
          chapterId: input.chapterId ?? null,
          chapterOrder: input.chapterOrder ?? null,
          stageLabel: input.stageLabel,
          stageSummary: input.stageSummary,
          nextTurnPoint: input.nextTurnPoint || null,
          sourceType: MANUAL_SOURCE_TYPE,
          confidence: input.confidence ?? null,
          isCurrent: true,
        },
        include: {
          sourceCharacter: { select: { name: true } },
          targetCharacter: { select: { name: true } },
          volume: { select: { title: true } },
        },
      });
      await tx.creativeDecision.create({
        data: {
          novelId,
          chapterId: input.chapterId ?? null,
          category: "character_relation_stage_manual_update",
          content: `${relation.sourceCharacter.name} -> ${relation.targetCharacter.name} 关系阶段更新为 ${input.stageLabel}。${input.decisionNote?.trim() || input.stageSummary}`.trim(),
          importance: "normal",
          sourceType: "character_relation_stage",
          sourceRefId: relation.id,
          expiresAt: input.chapterOrder ? input.chapterOrder + 5 : null,
        },
      });
      return nextStage;
    });

    return toCharacterRelationStage(created);
  }

  async rebuildDynamics(
    novelId: string,
    options: { sourceType?: string } = {},
  ): Promise<DynamicCharacterOverview> {
    const context = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        first30ChapterPromise: true,
        outline: true,
        structuredOutline: true,
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
            castRole: true,
            relationToProtagonist: true,
            storyFunction: true,
            currentGoal: true,
            currentState: true,
          },
        },
        characterRelations: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            sourceCharacterId: true,
            targetCharacterId: true,
            surfaceRelation: true,
            hiddenTension: true,
            conflictSource: true,
            dynamicLabel: true,
            nextTurnPoint: true,
            sourceCharacter: { select: { name: true } },
            targetCharacter: { select: { name: true } },
          },
        },
        characterCastOptions: {
          where: { status: "applied" },
          take: 1,
          select: {
            title: true,
            summary: true,
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
    if (!context || context.characters.length === 0 || context.volumePlans.length === 0) {
      return this.queryService.getOverview(novelId);
    }

    const projectionVolumePlans = context.volumePlans.filter((volume) => volume.chapters.length > 0);
    if (projectionVolumePlans.length === 0) {
      return this.queryService.getOverview(novelId);
    }

    const projection = await generateVolumeProjection({
      ...context,
      volumePlans: projectionVolumePlans,
    });
    const sourceType = options.sourceType ?? "rebuild_projection";
    const characterIdByName = new Map(context.characters.map((character) => [normalizeName(character.name), character.id]));
    const volumeBySortOrder = new Map(context.volumePlans.map((volume) => [volume.sortOrder, volume]));
    const mergedAssignments = mergeProjectionAssignments(projection.assignments);
    const validAssignments = mergedAssignments.filter((assignment) => (
      characterIdByName.has(normalizeName(assignment.characterName))
      && volumeBySortOrder.has(assignment.volumeSortOrder)
    ));
    if (mergedAssignments.length < projection.assignments.length) {
      console.warn(
        `[CharacterDynamicsMutationService] Deduped ${projection.assignments.length - mergedAssignments.length} duplicate character-volume assignments for novel ${novelId}.`,
      );
    }
    if (validAssignments.length === 0) {
      console.warn(
        `[CharacterDynamicsMutationService] Skipped character dynamics rebuild for novel ${novelId}: projection contained no valid character-volume assignments.`,
      );
      return this.queryService.getOverview(novelId);
    }
    const relationByPair = new Map(context.characterRelations.map((relation) => [
      `${relation.sourceCharacterId}:${relation.targetCharacterId}`,
      relation,
    ]));
    const anchoredCurrentStagePairs = new Set(
      (await prisma.characterRelationStage.findMany({
        where: {
          novelId,
          isCurrent: true,
          sourceType: { notIn: PROJECTION_SOURCE_TYPES },
        },
        select: {
          sourceCharacterId: true,
          targetCharacterId: true,
        },
      })).map((item) => `${item.sourceCharacterId}:${item.targetCharacterId}`),
    );

    await prisma.$transaction(async (tx) => {
      await tx.characterVolumeAssignment.deleteMany({ where: { novelId } });
      await tx.characterFactionTrack.deleteMany({
        where: {
          novelId,
          sourceType: { in: PROJECTION_SOURCE_TYPES },
        },
      });
      await tx.characterRelationStage.deleteMany({
        where: {
          novelId,
          sourceType: { in: PROJECTION_SOURCE_TYPES },
        },
      });

      for (const assignment of validAssignments) {
        const characterId = characterIdByName.get(normalizeName(assignment.characterName));
        const volume = volumeBySortOrder.get(assignment.volumeSortOrder);
        if (!characterId || !volume) {
          continue;
        }
        const plannedChapterOrders = assignment.plannedChapterOrders.length > 0
          ? assignment.plannedChapterOrders
          : volume.chapters.map((chapter) => chapter.chapterOrder);
        const existingAssignment = await tx.characterVolumeAssignment.findFirst({
          where: { novelId, characterId, volumeId: volume.id },
          select: { id: true },
        });
        if (existingAssignment) {
          await tx.characterVolumeAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              roleLabel: assignment.roleLabel || null,
              responsibility: assignment.responsibility,
              appearanceExpectation: assignment.appearanceExpectation || null,
              plannedChapterOrdersJson: JSON.stringify(plannedChapterOrders),
              isCore: assignment.isCore,
              absenceWarningThreshold: assignment.absenceWarningThreshold ?? 3,
              absenceHighRiskThreshold: assignment.absenceHighRiskThreshold ?? 5,
            },
          });
        } else {
          await tx.characterVolumeAssignment.create({
            data: {
              novelId,
              characterId,
              volumeId: volume.id,
              roleLabel: assignment.roleLabel || null,
              responsibility: assignment.responsibility,
              appearanceExpectation: assignment.appearanceExpectation || null,
              plannedChapterOrdersJson: JSON.stringify(plannedChapterOrders),
              isCore: assignment.isCore,
              absenceWarningThreshold: assignment.absenceWarningThreshold ?? 3,
              absenceHighRiskThreshold: assignment.absenceHighRiskThreshold ?? 5,
            },
          });
        }
      }

      for (const track of projection.factionTracks) {
        const characterId = characterIdByName.get(normalizeName(track.characterName));
        const volume = volumeBySortOrder.get(track.volumeSortOrder) ?? null;
        if (!characterId || !volume) {
          continue;
        }
        await tx.characterFactionTrack.create({
          data: {
            novelId,
            characterId,
            volumeId: volume.id,
            chapterId: null,
            chapterOrder: null,
            factionLabel: track.factionLabel,
            stanceLabel: track.stanceLabel || null,
            summary: track.summary || null,
            sourceType,
            confidence: track.confidence ?? null,
          },
        });
      }

      for (const stage of projection.relationStages) {
        const sourceCharacterId = characterIdByName.get(normalizeName(stage.sourceCharacterName));
        const targetCharacterId = characterIdByName.get(normalizeName(stage.targetCharacterName));
        const volume = volumeBySortOrder.get(stage.volumeSortOrder) ?? null;
        if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId || !volume) {
          continue;
        }
        const relation = relationByPair.get(`${sourceCharacterId}:${targetCharacterId}`) ?? null;
        await tx.characterRelationStage.create({
          data: {
            novelId,
            relationId: relation?.id ?? null,
            sourceCharacterId,
            targetCharacterId,
            volumeId: volume.id,
            chapterId: null,
            chapterOrder: null,
            stageLabel: stage.stageLabel,
            stageSummary: stage.stageSummary,
            nextTurnPoint: stage.nextTurnPoint || null,
            sourceType,
            confidence: stage.confidence ?? null,
            isCurrent: !anchoredCurrentStagePairs.has(`${sourceCharacterId}:${targetCharacterId}`),
          },
        });
      }
    });

    return this.queryService.getOverview(novelId);
  }

  async syncChapterDraftDynamics(novelId: string, chapterId: string, chapterOrder: number): Promise<void> {
    const [chapter, novel] = await Promise.all([
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          title: true,
          order: true,
          content: true,
        },
      }),
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          title: true,
          targetAudience: true,
          bookSellingPoint: true,
          first30ChapterPromise: true,
          characters: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              role: true,
              currentGoal: true,
              currentState: true,
            },
          },
          characterRelations: {
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              sourceCharacterId: true,
              targetCharacterId: true,
              sourceCharacter: { select: { name: true } },
              targetCharacter: { select: { name: true } },
              surfaceRelation: true,
              dynamicLabel: true,
              nextTurnPoint: true,
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
      }),
    ]);
    if (!chapter?.content?.trim() || !novel) {
      return;
    }

    const currentVolume = resolveCurrentVolume(buildVolumeWindows(novel.volumePlans), chapterOrder);
    const extracted = await extractChapterDynamics({
      novelId,
      chapterId,
      novelTitle: novel.title,
      targetAudience: novel.targetAudience,
      bookSellingPoint: novel.bookSellingPoint,
      first30ChapterPromise: novel.first30ChapterPromise,
      currentVolumeTitle: currentVolume?.title ?? null,
      rosterLines: novel.characters.map((item) => `${item.name} | ${item.role} | goal=${item.currentGoal ?? ""} | state=${item.currentState ?? ""}`),
      relationLines: novel.characterRelations.map((item) => `${item.sourceCharacter.name} -> ${item.targetCharacter.name} | ${item.surfaceRelation} | dynamic=${item.dynamicLabel ?? ""} | next=${item.nextTurnPoint ?? ""}`),
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
      chapterContent: chapter.content,
    });

    const characterByName = new Map(novel.characters.map((item) => [normalizeName(item.name), item]));
    const relationByPair = new Map(novel.characterRelations.map((item) => [
      `${item.sourceCharacterId}:${item.targetCharacterId}`,
      item,
    ]));
    const dedupedCandidates = extracted.candidates.filter((candidate, index, list) => (
      list.findIndex((item) => normalizeName(item.proposedName) === normalizeName(candidate.proposedName)) === index
    ));

    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.deleteMany({
        where: {
          novelId,
          sourceChapterId: chapterId,
          status: "pending",
        },
      });
      for (const candidate of dedupedCandidates) {
        const matchedCharacter = candidate.matchedCharacterName
          ? characterByName.get(normalizeName(candidate.matchedCharacterName))
          : characterByName.get(normalizeName(candidate.proposedName));
        if (matchedCharacter) {
          continue;
        }
        await tx.characterCandidate.create({
          data: {
            novelId,
            sourceChapterId: chapterId,
            proposedName: candidate.proposedName,
            proposedRole: candidate.proposedRole || null,
            summary: candidate.summary || null,
            evidenceJson: JSON.stringify(dedupeStrings(candidate.evidence)),
            matchedCharacterId: null,
            status: "pending",
            confidence: candidate.confidence ?? null,
          },
        });
      }

      await tx.characterFactionTrack.deleteMany({
        where: {
          novelId,
          chapterId,
          sourceType: CHAPTER_EXTRACT_SOURCE_TYPE,
        },
      });
      for (const update of extracted.factionUpdates) {
        const matched = characterByName.get(normalizeName(update.characterName));
        if (!matched) {
          continue;
        }
        await tx.characterFactionTrack.create({
          data: {
            novelId,
            characterId: matched.id,
            volumeId: currentVolume?.id ?? null,
            chapterId,
            chapterOrder,
            factionLabel: update.factionLabel,
            stanceLabel: update.stanceLabel || null,
            summary: update.summary || null,
            sourceType: CHAPTER_EXTRACT_SOURCE_TYPE,
            confidence: update.confidence ?? null,
          },
        });
      }

      await tx.characterRelationStage.deleteMany({
        where: {
          novelId,
          chapterId,
          sourceType: CHAPTER_EXTRACT_SOURCE_TYPE,
        },
      });
      for (const stage of extracted.relationStages) {
        const sourceCharacter = characterByName.get(normalizeName(stage.sourceCharacterName));
        const targetCharacter = characterByName.get(normalizeName(stage.targetCharacterName));
        if (!sourceCharacter || !targetCharacter || sourceCharacter.id === targetCharacter.id) {
          continue;
        }
        await tx.characterRelationStage.updateMany({
          where: {
            novelId,
            sourceCharacterId: sourceCharacter.id,
            targetCharacterId: targetCharacter.id,
            isCurrent: true,
          },
          data: {
            isCurrent: false,
          },
        });
        const relation = relationByPair.get(`${sourceCharacter.id}:${targetCharacter.id}`) ?? null;
        await tx.characterRelationStage.create({
          data: {
            novelId,
            relationId: relation?.id ?? null,
            sourceCharacterId: sourceCharacter.id,
            targetCharacterId: targetCharacter.id,
            volumeId: currentVolume?.id ?? null,
            chapterId,
            chapterOrder,
            stageLabel: stage.stageLabel,
            stageSummary: stage.stageSummary,
            nextTurnPoint: stage.nextTurnPoint || null,
            sourceType: CHAPTER_EXTRACT_SOURCE_TYPE,
            confidence: stage.confidence ?? null,
            isCurrent: true,
          },
        });
      }
    });
  }
}
