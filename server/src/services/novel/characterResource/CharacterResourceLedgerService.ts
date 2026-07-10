import type {
  CharacterResourceContext,
  CharacterResourceLedgerItem,
  CharacterResourceProposalSummary,
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
  return status === "lost" || status === "consumed" || status === "destroyed" || status === "damaged" || status === "stale";
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => compactText(String(item ?? ""))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function mapPendingProposalRow(row: {
  id: string;
  novelId: string;
  chapterId: string | null;
  sourceType: string;
  sourceStage: string | null;
  proposalType: string;
  riskLevel: string;
  status: string;
  summary: string;
  payloadJson: string;
  evidenceJson: string | null;
  validationNotesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterResourceProposalSummary {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    sourceType: row.sourceType,
    sourceStage: row.sourceStage,
    proposalType: "character_resource_update",
    riskLevel: row.riskLevel === "high" ? "high" : row.riskLevel === "medium" ? "medium" : "low",
    status: "pending_review",
    summary: row.summary,
    payload: parseJsonRecord(row.payloadJson),
    evidence: parseStringArray(row.evidenceJson),
    validationNotes: parseStringArray(row.validationNotesJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function matchesCharacterFilter(item: CharacterResourceLedgerItem, characterIds: Set<string>): boolean {
  return Boolean(
    (item.holderCharacterId && characterIds.has(item.holderCharacterId))
    || (item.ownerCharacterId && characterIds.has(item.ownerCharacterId)),
  );
}

function hasChapterWindowPressure(item: CharacterResourceLedgerItem, chapterOrder: number | undefined): boolean {
  if (chapterOrder == null) {
    return false;
  }
  const startsSoon = item.expectedUseStartChapterOrder != null
    && item.expectedUseStartChapterOrder <= chapterOrder + 1;
  const stillRelevant = item.expectedUseEndChapterOrder == null
    || item.expectedUseEndChapterOrder >= chapterOrder - 2;
  return startsSoon && stillRelevant;
}

function isChapterRelevant(item: CharacterResourceLedgerItem, chapterOrder: number | undefined): boolean {
  if (chapterOrder == null) {
    return true;
  }
  if (item.lastTouchedChapterOrder == null && item.expectedUseEndChapterOrder == null) {
    return item.status !== "stale";
  }
  const nearLastTouch = item.lastTouchedChapterOrder == null || item.lastTouchedChapterOrder <= chapterOrder;
  const nearWindow = item.expectedUseEndChapterOrder == null || item.expectedUseEndChapterOrder >= chapterOrder - 2;
  return nearLastTouch && nearWindow;
}

function buildStructuredRiskSignals(input: {
  resourceName: string;
  riskLevel?: "low" | "medium" | "high";
  riskSignals?: CharacterResourceRiskSignal[];
  validationNotes?: string[];
}): CharacterResourceRiskSignal[] {
  if (input.riskSignals && input.riskSignals.length > 0) {
    return input.riskSignals;
  }
  if (input.riskLevel !== "medium" && input.riskLevel !== "high") {
    return [];
  }
  const note = input.validationNotes?.map((item) => compactText(item)).filter(Boolean)[0];
  return [{
    code: input.riskLevel === "high" ? "resource_high_risk_commit" : "resource_medium_risk_commit",
    severity: input.riskLevel === "high" ? "high" : "medium",
    summary: note || `${input.resourceName} 的资源变更需要后续写作谨慎处理。`,
  }];
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
    return this.buildContext(novelId, { chapterId, chapterOrder: chapter.order });
  }

  async buildContext(
    novelId: string,
    options: { chapterId?: string; chapterOrder?: number; characterIds?: string[] } = {},
  ): Promise<CharacterResourceContext> {
    const [rows, pendingProposalRows] = await Promise.all([
      prisma.characterResourceLedgerItem.findMany({
        where: { novelId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 80,
      }),
      prisma.stateChangeProposal.findMany({
        where: {
          novelId,
          proposalType: "character_resource_update",
          status: "pending_review",
          ...(options.chapterId ? { OR: [{ chapterId: options.chapterId }, { chapterId: null }] } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 8,
      }),
    ]);
    const chapterOrder = options.chapterOrder;
    const characterIds = new Set((options.characterIds ?? []).map((item) => compactText(item)).filter(Boolean));
    const items = rows.map(mapCharacterResourceRow);
    const relevant = items.filter((item) => {
      if (!isChapterRelevant(item, chapterOrder)) {
        return false;
      }
      if (characterIds.size === 0) {
        return true;
      }
      return matchesCharacterFilter(item, characterIds) || hasChapterWindowPressure(item, chapterOrder);
    }).slice(0, 20);

    const availableItems = relevant.filter((item) => item.status === "available" || item.status === "borrowed").slice(0, 12);
    const setupNeededItems = relevant.filter((item) => item.status === "hidden" || item.narrativeFunction === "promise").slice(0, 8);
    const blockedItems = relevant.filter((item) => isBlockedStatus(item.status)).slice(0, 8);
    const highRiskCommittedItems = relevant.filter((item) => riskLevelFromItem(item) === "high").slice(0, 8);
    const pendingProposalItems = pendingProposalRows.map(mapPendingProposalRow);
    const riskSignals = relevant.flatMap((item) => item.riskSignals.map((signal) => ({
      ...signal,
      summary: `${item.name}：${signal.summary}`,
    }))).slice(0, 10);

    return {
      summary: this.buildContextSummary({
        availableItems,
        setupNeededItems,
        blockedItems,
        highRiskCommittedItems,
        pendingProposalItems,
      }),
      availableItems,
      setupNeededItems,
      blockedItems,
      highRiskCommittedItems,
      pendingProposalItems,
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
      riskLevel?: "low" | "medium" | "high";
      riskSignals?: CharacterResourceRiskSignal[];
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
    const riskSignals = buildStructuredRiskSignals({
      resourceName: payload.resourceName,
      riskLevel: input.riskLevel,
      riskSignals: input.riskSignals,
      validationNotes: input.validationNotes,
    });

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
    highRiskCommittedItems: CharacterResourceLedgerItem[];
    pendingProposalItems: CharacterResourceProposalSummary[];
  }): string {
    const parts = [
      input.availableItems.length > 0 ? `可用关键资源 ${input.availableItems.length} 项` : "",
      input.setupNeededItems.length > 0 ? `需要留意铺垫 ${input.setupNeededItems.length} 项` : "",
      input.blockedItems.length > 0 ? `不可直接使用 ${input.blockedItems.length} 项` : "",
      input.highRiskCommittedItems.length > 0 ? `高风险已入账资源 ${input.highRiskCommittedItems.length} 项` : "",
      input.pendingProposalItems.length > 0 ? `待确认资源变更 ${input.pendingProposalItems.length} 条` : "",
    ].filter(Boolean);
    return parts.join("；") || "当前章节没有需要特别提示的角色资源。";
  }

  private emptyContext(): CharacterResourceContext {
    return {
      summary: "当前章节没有需要特别提示的角色资源。",
      availableItems: [],
      setupNeededItems: [],
      blockedItems: [],
      highRiskCommittedItems: [],
      pendingProposalItems: [],
      riskSignals: [],
    };
  }
}

export const characterResourceLedgerService = new CharacterResourceLedgerService();
