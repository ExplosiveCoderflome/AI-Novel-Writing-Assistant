import type {
  CharacterResourceContext,
  CharacterResourceLedgerItem,
  CharacterResourceRiskSignal,
  CharacterResourceUpdatePayload,
} from "@ai-novel/shared/types/characterResource";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import {
  compactText,
  mapCharacterResourceRow,
  normalizeResourceKey,
  stringifyJson,
} from "./characterResourceShared";

function riskLevelFromItem(item: CharacterResourceLedgerItem): "none" | "info" | "warn" | "high" {
  if (item.riskSignals.some((signal) => signal.severity === "critical" || signal.severity === "high")) {
    return "high";
  }
  if (item.status === "lost" || item.status === "destroyed" || item.status === "consumed") {
    return "warn";
  }
  if (item.riskSignals.length > 0 || item.status === "damaged" || item.status === "hidden") {
    return "info";
  }
  return "none";
}

function isBlockedStatus(status: CharacterResourceLedgerItem["status"]): boolean {
  return status === "lost" || status === "consumed" || status === "destroyed" || status === "damaged";
}

export class CharacterResourceLedgerService {
  async listResources(novelId: string): Promise<CharacterResourceLedgerItem[]> {
    const rows = await prisma.characterResourceLedgerItem.findMany({
      where: { novelId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapCharacterResourceRow);
  }

  async listCharacterResources(novelId: string, characterId: string): Promise<CharacterResourceLedgerItem[]> {
    const rows = await prisma.characterResourceLedgerItem.findMany({
      where: {
        novelId,
        OR: [
          { holderCharacterId: characterId },
          { ownerCharacterId: characterId },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapCharacterResourceRow);
  }

  async getChapterResourceContext(novelId: string, chapterId: string): Promise<CharacterResourceContext> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, order: true },
    });
    if (!chapter) {
      return this.emptyContext();
    }
    return this.buildContext(novelId, { chapterOrder: chapter.order });
  }

  async buildContext(
    novelId: string,
    options: { chapterOrder?: number; characterIds?: string[] } = {},
  ): Promise<CharacterResourceContext> {
    const rows = await prisma.characterResourceLedgerItem.findMany({
      where: {
        novelId,
        ...(options.characterIds && options.characterIds.length > 0
          ? {
              OR: [
                { holderCharacterId: { in: options.characterIds } },
                { ownerCharacterId: { in: options.characterIds } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 60,
    });
    const chapterOrder = options.chapterOrder;
    const items = rows.map(mapCharacterResourceRow);
    const relevant = items.filter((item) => {
      if (chapterOrder == null) {
        return true;
      }
      if (item.lastTouchedChapterOrder == null && item.expectedUseEndChapterOrder == null) {
        return item.status !== "stale";
      }
      const nearLastTouch = item.lastTouchedChapterOrder == null || item.lastTouchedChapterOrder <= chapterOrder;
      const nearWindow = item.expectedUseEndChapterOrder == null || item.expectedUseEndChapterOrder >= chapterOrder - 2;
      return nearLastTouch && nearWindow;
    }).slice(0, 20);

    const availableItems = relevant.filter((item) => item.status === "available" || item.status === "borrowed").slice(0, 12);
    const setupNeededItems = relevant.filter((item) => item.status === "hidden" || item.narrativeFunction === "promise").slice(0, 8);
    const blockedItems = relevant.filter((item) => isBlockedStatus(item.status)).slice(0, 8);
    const pendingReviewItems = relevant.filter((item) => riskLevelFromItem(item) === "high").slice(0, 8);
    const riskSignals = relevant.flatMap((item) => item.riskSignals.map((signal) => ({
      ...signal,
      summary: `${item.name}：${signal.summary}`,
    }))).slice(0, 10);

    return {
      summary: this.buildContextSummary({ availableItems, setupNeededItems, blockedItems, pendingReviewItems }),
      availableItems,
      setupNeededItems,
      blockedItems,
      pendingReviewItems,
      riskSignals,
    };
  }

  buildCharacterSummaries(items: CharacterResourceLedgerItem[]) {
    return items.slice(0, 8).map((item) => ({
      resourceId: item.id,
      name: item.name,
      status: item.status,
      narrativeFunction: item.narrativeFunction,
      summary: item.summary,
      constraints: item.constraints,
      riskLevel: riskLevelFromItem(item),
    }));
  }

  async applyCommittedUpdate(
    tx: Prisma.TransactionClient,
    input: {
      novelId: string;
      chapterId?: string | null;
      chapterOrder?: number | null;
      payload: CharacterResourceUpdatePayload;
      evidence: string[];
      validationNotes?: string[];
    },
  ): Promise<void> {
    const payload = input.payload;
    const resourceKey = compactText(payload.resourceKey)
      || normalizeResourceKey({
        name: payload.resourceName,
        holderCharacterId: payload.holderCharacterId,
        ownerName: payload.ownerName,
      });
    const now = new Date();
    const riskSignals: CharacterResourceRiskSignal[] = (input.validationNotes ?? [])
      .filter((note) => /risk|风险|review|缺失|冲突/i.test(note))
      .map((note) => ({
        code: "resource_validation_note",
        severity: "medium",
        summary: note,
      }));

    const existing = await tx.characterResourceLedgerItem.findUnique({
      where: {
        novelId_resourceKey: {
          novelId: input.novelId,
          resourceKey,
        },
      },
    });

    const data = {
      name: payload.resourceName,
      summary: compactText(payload.summary) || payload.narrativeImpact,
      resourceType: payload.resourceType,
      narrativeFunction: payload.narrativeFunction,
      ownerType: payload.ownerType,
      ownerId: payload.ownerId ?? (payload.ownerType === "character" ? payload.holderCharacterId ?? null : null),
      ownerName: payload.ownerName ?? payload.holderCharacterName ?? null,
      ownerCharacterId: payload.ownerType === "character" ? payload.ownerId ?? payload.holderCharacterId ?? null : null,
      holderCharacterId: payload.holderCharacterId ?? null,
      holderCharacterName: payload.holderCharacterName ?? null,
      status: payload.statusAfter,
      readerKnows: payload.visibilityAfter.readerKnows,
      holderKnows: payload.visibilityAfter.holderKnows,
      knownByCharacterIdsJson: stringifyJson(payload.visibilityAfter.knownByCharacterIds),
      introducedChapterId: existing?.introducedChapterId ?? input.chapterId ?? null,
      introducedChapterOrder: existing?.introducedChapterOrder ?? input.chapterOrder ?? null,
      lastTouchedChapterId: input.chapterId ?? null,
      lastTouchedChapterOrder: input.chapterOrder ?? null,
      expectedUseStartChapterOrder: payload.expectedUseStartChapterOrder ?? null,
      expectedUseEndChapterOrder: payload.expectedUseEndChapterOrder ?? null,
      constraintsJson: stringifyJson(payload.constraints),
      riskSignalsJson: stringifyJson(riskSignals),
      sourceRefsJson: stringifyJson([{
        kind: "chapter_content",
        refId: input.chapterId ?? null,
        refLabel: input.chapterOrder ? `第${input.chapterOrder}章` : "章节内容",
        chapterId: input.chapterId ?? null,
        chapterOrder: input.chapterOrder ?? null,
      }]),
      evidenceJson: stringifyJson(input.evidence.map((summary) => ({
        summary,
        chapterId: input.chapterId ?? null,
        chapterOrder: input.chapterOrder ?? null,
      }))),
      confidence: payload.confidence ?? null,
      updatedAt: now,
    };

    const row = await tx.characterResourceLedgerItem.upsert({
      where: {
        novelId_resourceKey: {
          novelId: input.novelId,
          resourceKey,
        },
      },
      create: {
        id: payload.resourceId || undefined,
        novelId: input.novelId,
        resourceKey,
        ...data,
      },
      update: data,
    });

    await tx.characterResourceEvent.create({
      data: {
        novelId: input.novelId,
        resourceId: row.id,
        chapterId: input.chapterId ?? null,
        chapterOrder: input.chapterOrder ?? null,
        eventType: payload.updateType,
        actorCharacterId: payload.holderCharacterId ?? null,
        fromHolderCharacterId: payload.previousHolderCharacterId ?? null,
        toHolderCharacterId: payload.holderCharacterId ?? null,
        summary: payload.narrativeImpact,
        evidenceJson: stringifyJson(input.evidence),
      },
    });
  }

  private buildContextSummary(input: {
    availableItems: CharacterResourceLedgerItem[];
    setupNeededItems: CharacterResourceLedgerItem[];
    blockedItems: CharacterResourceLedgerItem[];
    pendingReviewItems: CharacterResourceLedgerItem[];
  }): string {
    const parts = [
      input.availableItems.length > 0 ? `可用关键资源 ${input.availableItems.length} 项` : "",
      input.setupNeededItems.length > 0 ? `需要留意铺垫 ${input.setupNeededItems.length} 项` : "",
      input.blockedItems.length > 0 ? `不可直接使用 ${input.blockedItems.length} 项` : "",
      input.pendingReviewItems.length > 0 ? `高风险资源 ${input.pendingReviewItems.length} 项` : "",
    ].filter(Boolean);
    return parts.join("；") || "当前章节没有需要特别提示的角色资源。";
  }

  private emptyContext(): CharacterResourceContext {
    return {
      summary: "当前章节没有需要特别提示的角色资源。",
      availableItems: [],
      setupNeededItems: [],
      blockedItems: [],
      pendingReviewItems: [],
      riskSignals: [],
    };
  }
}

export const characterResourceLedgerService = new CharacterResourceLedgerService();
