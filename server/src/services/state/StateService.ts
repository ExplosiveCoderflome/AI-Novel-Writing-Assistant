import { prisma } from "../../db/prisma";
import { stringifyStringArray } from "../novel/novelP0Utils";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
import {
  createNovelChapterReferenceLookup,
  resolveNovelChapterId,
  type NovelChapterReferenceLookup,
} from "../payoff/payoffLedgerChapterRefs";
import { openConflictService } from "./OpenConflictService";
import {
  extractSnapshotWithAI,
  type SnapshotExtractionOutput,
  type StateServiceOptions,
} from "./stateSnapshotExtraction";
import { detectStateDiffConflicts } from "./stateConflictDetection";

function clampStateScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStatus(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

async function buildChapterReferenceLookup(novelId: string): Promise<NovelChapterReferenceLookup> {
  const chapters = await prisma.chapter.findMany({
    where: { novelId },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });
  return createNovelChapterReferenceLookup(chapters);
}

export class StateService {
  async getNovelState(novelId: string) {
    return this.getLatestSnapshot(novelId);
  }

  async getLatestSnapshot(novelId: string) {
    return prisma.storyStateSnapshot.findFirst({
      where: { novelId },
      include: {
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getChapterSnapshot(novelId: string, chapterId: string) {
    return prisma.storyStateSnapshot.findFirst({
      where: { novelId, sourceChapterId: chapterId },
      include: {
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
    });
  }

  async getLatestSnapshotBeforeChapter(novelId: string, chapterOrder: number) {
    const snapshots = await prisma.storyStateSnapshot.findMany({
      where: { novelId },
      include: {
        sourceChapter: {
          select: {
            order: true,
          },
        },
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return snapshots.find((item) => (item.sourceChapter?.order ?? Number.MAX_SAFE_INTEGER) < chapterOrder) ?? null;
  }

  async buildStateContextBlock(novelId: string, chapterOrder: number): Promise<string> {
    const snapshot = await this.getLatestSnapshotBeforeChapter(novelId, chapterOrder);
    if (!snapshot) {
      return "";
    }
    const characterLines = snapshot.characterStates
      .map((item) => item.summary?.trim())
      .filter((item): item is string => Boolean(item))
      .slice(0, 4);
    const relationLines = snapshot.relationStates
      .map((item) => item.summary?.trim())
      .filter((item): item is string => Boolean(item))
      .slice(0, 3);
    const infoLines = snapshot.informationStates
      .map((item) => `${item.holderType}:${item.fact}`)
      .slice(0, 4);
    const foreshadowLines = snapshot.foreshadowStates
      .map((item) => `${item.title}(${item.status})`)
      .slice(0, 4);
    return [
      `State snapshot summary: ${snapshot.summary ?? "暂无摘要"}`,
      characterLines.length > 0 ? `Character states:\n- ${characterLines.join("\n- ")}` : "",
      relationLines.length > 0 ? `Relations:\n- ${relationLines.join("\n- ")}` : "",
      infoLines.length > 0 ? `Knowledge:\n- ${infoLines.join("\n- ")}` : "",
      foreshadowLines.length > 0 ? `Foreshadowing:\n- ${foreshadowLines.join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  async syncChapterState(
    novelId: string,
    chapterId: string,
    content: string,
    options: StateServiceOptions = {},
    chapterLookup?: NovelChapterReferenceLookup,
  ) {
    const [chapter, characters, summaryRow, factRows, timelineRows] = await Promise.all([
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: { id: true, title: true, order: true, expectation: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, currentGoal: true, currentState: true, role: true },
      }),
      prisma.chapterSummary.findUnique({
        where: { chapterId },
        select: { summary: true, keyEvents: true, characterStates: true, hook: true },
      }),
      prisma.consistencyFact.findMany({
        where: { novelId, chapterId },
        select: { category: true, content: true },
      }),
      prisma.characterTimeline.findMany({
        where: { novelId, chapterId, source: "chapter_extract" },
        select: { characterId: true, content: true },
      }),
    ]);
    if (!chapter) {
      throw new Error("章节不存在。");
    }
    const previousSnapshot = await this.getLatestSnapshotBeforeChapter(novelId, chapter.order);
    const extracted = await extractSnapshotWithAI({
      novelId,
      chapter,
      content,
      characters,
      summaryRow,
      factRows,
      timelineRows,
      previousSnapshot,
      options,
    });
    return this.persistSnapshot({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      characters,
      previousSnapshot,
      extracted,
      chapterLookup: chapterLookup ?? await buildChapterReferenceLookup(novelId),
    });
  }

  async rebuildState(novelId: string, options: StateServiceOptions = {}) {
    const chapters = await prisma.chapter.findMany({
      where: { novelId },
      select: { id: true, content: true, order: true },
      orderBy: { order: "asc" },
    });
    const chapterLookup = createNovelChapterReferenceLookup(chapters);
    await prisma.storyStateSnapshot.deleteMany({ where: { novelId } });
    const rebuilt = [];
    for (const chapter of chapters) {
      if (!chapter.content?.trim()) {
        continue;
      }
      const snapshot = await this.syncChapterState(novelId, chapter.id, chapter.content, options, chapterLookup);
      rebuilt.push(snapshot);
    }
    return rebuilt;
  }

  private async persistSnapshot(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    characters: Array<{ id: string; name: string }>;
    previousSnapshot: Awaited<ReturnType<StateService["getLatestSnapshotBeforeChapter"]>>;
    extracted: SnapshotExtractionOutput;
    chapterLookup: NovelChapterReferenceLookup;
  }) {
    const characterMap = new Map<string, string>();
    for (const character of input.characters) {
      characterMap.set(character.id, character.id);
      characterMap.set(character.name, character.id);
    }

    const normalizedCharacterStates = (input.extracted.characterStates ?? [])
      .map((item) => {
        const characterId = characterMap.get(item.characterId ?? "") ?? characterMap.get(item.characterName ?? "");
        if (!characterId) {
          return null;
        }
        return {
          characterId,
          currentGoal: item.currentGoal?.trim() || null,
          emotion: item.emotion?.trim() || null,
          stressLevel: clampStateScore(item.stressLevel),
          secretExposure: item.secretExposure?.trim() || null,
          knownFactsJson: stringifyStringArray(item.knownFacts),
          misbeliefsJson: stringifyStringArray(item.misbeliefs),
          summary: item.summary?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const normalizedRelationStates = (input.extracted.relationStates ?? [])
      .map((item) => {
        const sourceCharacterId = characterMap.get(item.sourceCharacterId ?? "") ?? characterMap.get(item.sourceCharacterName ?? "");
        const targetCharacterId = characterMap.get(item.targetCharacterId ?? "") ?? characterMap.get(item.targetCharacterName ?? "");
        if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) {
          return null;
        }
        return {
          sourceCharacterId,
          targetCharacterId,
          trustScore: clampStateScore(item.trustScore),
          intimacyScore: clampStateScore(item.intimacyScore),
          conflictScore: clampStateScore(item.conflictScore),
          dependencyScore: clampStateScore(item.dependencyScore),
          summary: item.summary?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const normalizedInformationStates = (input.extracted.informationStates ?? [])
      .map((item) => {
        const holderType = item.holderType === "character" ? "character" : "reader";
        const holderRefId = holderType === "character"
          ? characterMap.get(item.holderRefId ?? "") ?? characterMap.get(item.holderRefName ?? "")
          : null;
        if (!item.fact?.trim()) {
          return null;
        }
        return {
          holderType,
          holderRefId,
          fact: item.fact.trim(),
          status: normalizeStatus(item.status, "known"),
          summary: item.summary?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const normalizedForeshadowStates = (input.extracted.foreshadowStates ?? [])
      .map((item) => {
        if (!item.title?.trim()) {
          return null;
        }
        const status = normalizeStatus(item.status, "setup");
        const fallbackSetupChapterId = status === "setup" ? input.chapterId : null;
        return {
          title: item.title.trim(),
          summary: item.summary?.trim() || null,
          status,
          setupChapterId: resolveNovelChapterId({
            rawChapterId: item.setupChapterId ?? null,
            fallbackChapterId: fallbackSetupChapterId,
          }, input.chapterLookup) ?? fallbackSetupChapterId,
          payoffChapterId: resolveNovelChapterId({
            rawChapterId: item.payoffChapterId ?? null,
          }, input.chapterLookup),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const rawStateJson = JSON.stringify({
      summary: input.extracted.summary ?? null,
      characterStates: normalizedCharacterStates,
      relationStates: normalizedRelationStates,
      informationStates: normalizedInformationStates,
      foreshadowStates: normalizedForeshadowStates,
    });
    const summary = input.extracted.summary?.trim() || `第${input.chapterOrder}章状态快照`;
    const existing = await prisma.storyStateSnapshot.findFirst({
      where: { novelId: input.novelId, sourceChapterId: input.chapterId },
      select: { id: true },
    });

    const snapshotId = await prisma.$transaction(async (tx) => {
      const snapshot = existing
        ? await tx.storyStateSnapshot.update({
            where: { id: existing.id },
            data: {
              summary,
              rawStateJson,
            },
            select: { id: true },
          })
        : await tx.storyStateSnapshot.create({
            data: {
              novelId: input.novelId,
              sourceChapterId: input.chapterId,
              summary,
              rawStateJson,
            },
            select: { id: true },
          });

      await Promise.all([
        tx.characterState.deleteMany({ where: { snapshotId: snapshot.id } }),
        tx.relationState.deleteMany({ where: { snapshotId: snapshot.id } }),
        tx.informationState.deleteMany({ where: { snapshotId: snapshot.id } }),
        tx.foreshadowState.deleteMany({ where: { snapshotId: snapshot.id } }),
      ]);

      if (normalizedCharacterStates.length > 0) {
        await tx.characterState.createMany({
          data: normalizedCharacterStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      if (normalizedRelationStates.length > 0) {
        await tx.relationState.createMany({
          data: normalizedRelationStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      if (normalizedInformationStates.length > 0) {
        await tx.informationState.createMany({
          data: normalizedInformationStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      if (normalizedForeshadowStates.length > 0) {
        await tx.foreshadowState.createMany({
          data: normalizedForeshadowStates.map((item) => ({
            snapshotId: snapshot.id,
            ...item,
          })),
        });
      }
      return snapshot.id;
    });

    const persistedSnapshot = await prisma.storyStateSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        characterStates: true,
        relationStates: true,
        informationStates: true,
        foreshadowStates: true,
      },
    });

    if (persistedSnapshot) {
      const detected = detectStateDiffConflicts({
        characters: input.characters,
        previousSnapshot: input.previousSnapshot,
        currentSnapshot: persistedSnapshot,
      });
      await openConflictService.syncFromStateDiff({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        sourceSnapshotId: persistedSnapshot.id,
        trackedConflictKeys: detected.trackedConflictKeys,
        conflicts: detected.conflicts,
      }).catch(() => null);
      await payoffLedgerSyncService.syncLedger(input.novelId, {
        chapterOrder: input.chapterOrder,
        sourceChapterId: input.chapterId,
      }).catch(() => null);
    }

    return persistedSnapshot;
  }
}

export const stateService = new StateService();
