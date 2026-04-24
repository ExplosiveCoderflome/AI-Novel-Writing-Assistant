import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import { createHash } from "crypto";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { characterResourceExtractionPrompt } from "../../../prompting/prompts/novel/characterResource.prompts";
import { compactText, normalizeResourceKey } from "./characterResourceShared";
import { characterResourceLedgerService } from "./CharacterResourceLedgerService";

const BACKGROUND_RESOURCE_SOURCE_TYPE = "chapter_background_sync";
const RESOURCE_SYNC_CHECKPOINT_TYPE = "character_resource_sync_checkpoint";
const inFlightBackgroundExtractions = new Set<string>();

function buildContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 24);
}

function getSourceStage(input: { sourceStage?: string | null }): string {
  return input.sourceStage ?? "character_resource_extraction";
}

function buildRosterText(characters: Array<{ id: string; name: string; role: string; castRole: string | null }>): string {
  return characters.map((item) => `- ${item.id} | ${item.name} | ${item.role}${item.castRole ? ` | ${item.castRole}` : ""}`).join("\n");
}

function resolveCharacterId(
  characters: Array<{ id: string; name: string }>,
  name: string | null | undefined,
): string | null {
  const normalized = compactText(name);
  if (!normalized) {
    return null;
  }
  const exact = characters.find((item) => item.name === normalized);
  if (exact) {
    return exact.id;
  }
  const fuzzy = characters.find((item) => normalized.includes(item.name) || item.name.includes(normalized));
  return fuzzy?.id ?? null;
}

export class CharacterResourceExtractionService {
  private async hasProcessedBackgroundContent(input: {
    novelId: string;
    chapterId: string;
    sourceType: string;
    sourceStage: string;
  }): Promise<boolean> {
    if (input.sourceType !== BACKGROUND_RESOURCE_SOURCE_TYPE) {
      return false;
    }
    const processedCount = await prisma.stateChangeProposal.count({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        sourceType: input.sourceType,
        sourceStage: input.sourceStage,
        proposalType: { in: ["character_resource_update", RESOURCE_SYNC_CHECKPOINT_TYPE] },
      },
    });
    return processedCount > 0;
  }

  private async markBackgroundContentProcessed(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    sourceType: string;
    sourceStage: string;
    contentHash: string;
  }): Promise<void> {
    if (input.sourceType !== BACKGROUND_RESOURCE_SOURCE_TYPE) {
      return;
    }
    await prisma.stateChangeProposal.create({
      data: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        sourceSnapshotId: null,
        sourceType: input.sourceType,
        sourceStage: input.sourceStage,
        proposalType: RESOURCE_SYNC_CHECKPOINT_TYPE,
        riskLevel: "low",
        status: "committed",
        summary: "本章角色资源同步已完成，未发现需要进入账本的变化。",
        payloadJson: JSON.stringify({
          syncContentHash: input.contentHash,
          chapterOrder: input.chapterOrder,
          updateCount: 0,
        }),
        evidenceJson: JSON.stringify([]),
        validationNotesJson: JSON.stringify(["background character resource sync checkpoint"]),
      },
    }).catch(() => null);
  }

  async extractChapterResourceProposals(input: {
    novelId: string;
    chapterId: string;
    chapterOrder?: number;
    sourceType?: string;
    sourceStage?: string | null;
    provider?: string;
    model?: string;
    temperature?: number;
  }): Promise<StateChangeProposal[]> {
    const [novel, chapter, characters, existingResources] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: input.novelId },
        select: { title: true },
      }),
      prisma.chapter.findFirst({
        where: { id: input.chapterId, novelId: input.novelId },
        select: { id: true, order: true, title: true, content: true },
      }),
      prisma.character.findMany({
        where: { novelId: input.novelId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, role: true, castRole: true },
      }),
      characterResourceLedgerService.listResources(input.novelId).catch(() => []),
    ]);

    const content = compactText(chapter?.content);
    if (!novel || !chapter || !content || characters.length === 0) {
      return [];
    }

    const sourceType = input.sourceType ?? BACKGROUND_RESOURCE_SOURCE_TYPE;
    const sourceStage = getSourceStage(input);
    const contentHash = buildContentHash(content);
    const inFlightKey = `${input.novelId}:${input.chapterId}:${sourceType}:${sourceStage}:${contentHash}`;
    if (sourceType === BACKGROUND_RESOURCE_SOURCE_TYPE) {
      if (inFlightBackgroundExtractions.has(inFlightKey)) {
        return [];
      }
      if (await this.hasProcessedBackgroundContent({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceType,
        sourceStage,
      })) {
        return [];
      }
      inFlightBackgroundExtractions.add(inFlightKey);
    }

    try {
    const result = await runStructuredPrompt({
      asset: characterResourceExtractionPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterOrder: chapter.order,
        chapterTitle: chapter.title,
        chapterContent: content,
        rosterText: buildRosterText(characters),
        existingResourceText: existingResources.slice(0, 20).map((item) => (
          `- ${item.name} | holder=${item.holderCharacterName ?? "未知"} | status=${item.status} | ${item.summary}`
        )).join("\n"),
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
        novelId: input.novelId,
        chapterId: input.chapterId,
        stage: "character_resource_extraction",
      },
    });

    if (result.output.updates.length === 0) {
      await this.markBackgroundContentProcessed({
        novelId: input.novelId,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        sourceType,
        sourceStage,
        contentHash,
      });
    }

    return result.output.updates.map((update): StateChangeProposal => {
      const holderCharacterId = resolveCharacterId(characters, update.holderCharacterName);
      const previousHolderCharacterId = resolveCharacterId(characters, update.previousHolderCharacterName);
      const knownByCharacterIds = update.knownByCharacterNames
        .map((name) => resolveCharacterId(characters, name))
        .filter((id): id is string => Boolean(id));
      const ownerCharacterId = update.ownerType === "character"
        ? resolveCharacterId(characters, update.ownerName) ?? holderCharacterId
        : null;
      const resourceKey = normalizeResourceKey({
        name: update.resourceName,
        holderCharacterId,
        ownerName: update.ownerName ?? null,
      });
      const riskLevel = update.riskLevel === "high" ? "high" : update.riskLevel === "medium" ? "medium" : "low";

      return {
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId: null,
        sourceType,
        sourceStage,
        proposalType: "character_resource_update",
        riskLevel,
        status: "validated",
        summary: `${update.resourceName} resource update in chapter ${chapter.order}`,
        payload: {
          resourceKey,
          resourceName: update.resourceName,
          chapterOrder: chapter.order,
          resourceType: update.resourceType,
          narrativeFunction: update.narrativeFunction,
          updateType: update.updateType,
          ownerType: update.ownerType,
          ownerId: ownerCharacterId,
          ownerName: update.ownerName ?? update.holderCharacterName ?? null,
          holderCharacterId,
          holderCharacterName: update.holderCharacterName ?? null,
          previousHolderCharacterId,
          statusAfter: update.statusAfter,
          visibilityAfter: {
            readerKnows: update.readerKnows,
            holderKnows: update.holderKnows,
            knownByCharacterIds,
          },
          summary: update.summary ?? undefined,
          narrativeImpact: update.narrativeImpact,
          expectedFutureUse: update.expectedFutureUse ?? null,
          expectedUseStartChapterOrder: update.expectedUseStartChapterOrder ?? null,
          expectedUseEndChapterOrder: update.expectedUseEndChapterOrder ?? null,
          constraints: update.constraints,
          confidence: update.confidence ?? null,
          syncContentHash: contentHash,
        },
        evidence: update.evidence,
        validationNotes: [update.riskReason ?? ""].filter(Boolean),
      };
    });
    } finally {
      inFlightBackgroundExtractions.delete(inFlightKey);
    }
  }
}

export const characterResourceExtractionService = new CharacterResourceExtractionService();
