import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  baseCharacterDraftSchema,
  characterLibraryLinkSchema,
  characterSyncProposalAiOutputSchema,
  characterSyncProposalSchema,
  importBaseCharacterToNovelInputSchema,
  type BaseCharacterDraft,
  type BaseCharacterImportMode,
  type CharacterLibraryLink,
  type CharacterLibraryLinkStatus,
  type CharacterSyncFieldUpdate,
  type CharacterSyncPolicy,
  type CharacterSyncProposal,
  type CharacterSyncProposalPayload,
  type ImportBaseCharacterToNovelInput,
  type NovelCharacterSaveToLibraryInput,
} from "@ai-novel/shared/types/characterSync";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { characterSyncClassificationPrompt } from "../../prompting/prompts/character/characterSync.prompts";
import { queueRagUpsert } from "../novel/novelCoreSupport";

const APPLY_TO_NOVEL_FIELDS = ["name", "role", "personality", "background", "development"] as const;

type ApplyToNovelField = (typeof APPLY_TO_NOVEL_FIELDS)[number];

type BaseCharacterRow = {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  appearance: string | null;
  weaknesses: string | null;
  interests: string | null;
  keyEvents: string | null;
  tags: string | null;
  category: string;
};

type CharacterRow = {
  id: string;
  novelId: string;
  name: string;
  role: string;
  personality: string | null;
  background: string | null;
  development: string | null;
  currentState: string | null;
  currentGoal: string | null;
  baseCharacterId: string | null;
};

function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
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

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function sanitizeBaseCharacterDraft(input: unknown): BaseCharacterDraft {
  const parsed = baseCharacterDraftSchema.parse(input);
  return {
    name: parsed.name,
    role: parsed.role,
    personality: parsed.personality,
    background: parsed.background,
    development: parsed.development,
    appearance: compactText(parsed.appearance) || null,
    weaknesses: compactText(parsed.weaknesses) || null,
    interests: compactText(parsed.interests) || null,
    keyEvents: compactText(parsed.keyEvents) || null,
    tags: compactText(parsed.tags),
    category: parsed.category,
  };
}

function baseCharacterToDraft(row: BaseCharacterRow): BaseCharacterDraft {
  return sanitizeBaseCharacterDraft({
    name: row.name,
    role: row.role,
    personality: row.personality,
    background: row.background,
    development: row.development,
    appearance: row.appearance,
    weaknesses: row.weaknesses,
    interests: row.interests,
    keyEvents: row.keyEvents,
    tags: row.tags ?? "",
    category: row.category,
  });
}

function mapLink(row: {
  id: string;
  novelId: string;
  characterId: string;
  baseCharacterId: string;
  baseRevisionId: string | null;
  syncPolicy: string;
  linkStatus: string;
  localOverridesJson: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterLibraryLink {
  return characterLibraryLinkSchema.parse({
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    baseCharacterId: row.baseCharacterId,
    baseRevisionId: row.baseRevisionId,
    syncPolicy: row.syncPolicy,
    linkStatus: row.linkStatus,
    localOverrides: parseJsonObject(row.localOverridesJson),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapProposal(row: {
  id: string;
  novelId: string | null;
  characterId: string | null;
  baseCharacterId: string | null;
  baseRevisionId: string | null;
  direction: string;
  status: string;
  confidence: number | null;
  summary: string;
  payloadJson: string;
  safeUpdatesJson: string | null;
  novelOnlyUpdatesJson: string | null;
  riskyUpdatesJson: string | null;
  recommendedAction: string | null;
  sourceType: string;
  sourceRefId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterSyncProposal {
  return characterSyncProposalSchema.parse({
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    baseCharacterId: row.baseCharacterId,
    baseRevisionId: row.baseRevisionId,
    direction: row.direction,
    status: row.status,
    confidence: row.confidence,
    summary: row.summary,
    payload: parseJsonObject(row.payloadJson),
    safeUpdates: parseJsonArray<CharacterSyncFieldUpdate>(row.safeUpdatesJson),
    novelOnlyUpdates: parseJsonArray<CharacterSyncFieldUpdate>(row.novelOnlyUpdatesJson),
    riskyUpdates: parseJsonArray<CharacterSyncFieldUpdate>(row.riskyUpdatesJson),
    recommendedAction: row.recommendedAction,
    sourceType: row.sourceType,
    sourceRefId: row.sourceRefId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function buildLibraryUpdateFields(baseSnapshot: BaseCharacterDraft): CharacterSyncFieldUpdate[] {
  return APPLY_TO_NOVEL_FIELDS.map((field) => ({
    field,
    layer: field === "name" || field === "role" ? "identity" : "persona",
    summary: `角色库字段 ${field} 有新版本`,
    reason: "这是角色库里的稳定基础设定，应用到本小说前需要用户确认。",
    toValue: String(baseSnapshot[field] ?? ""),
  }));
}

export class CharacterLibrarySyncService {
  async ensureLatestBaseRevision(baseCharacterId: string, sourceType = "backfill") {
    const latest = await prisma.baseCharacterRevision.findFirst({
      where: { baseCharacterId },
      orderBy: { version: "desc" },
    });
    if (latest) {
      return latest;
    }

    const baseCharacter = await prisma.baseCharacter.findUnique({ where: { id: baseCharacterId } });
    if (!baseCharacter) {
      throw new Error("基础角色不存在");
    }

    return prisma.baseCharacterRevision.create({
      data: {
        baseCharacterId,
        version: 1,
        snapshotJson: toJson(baseCharacterToDraft(baseCharacter)),
        changeSummary: "为现有角色库角色建立初始版本。",
        sourceType,
      },
    });
  }

  async createBaseRevision(baseCharacterId: string, changeSummary: string, sourceType = "manual", sourceRefId?: string) {
    const baseCharacter = await prisma.baseCharacter.findUnique({ where: { id: baseCharacterId } });
    if (!baseCharacter) {
      throw new Error("基础角色不存在");
    }
    const latest = await prisma.baseCharacterRevision.findFirst({
      where: { baseCharacterId },
      orderBy: { version: "desc" },
    });
    return prisma.baseCharacterRevision.create({
      data: {
        baseCharacterId,
        version: (latest?.version ?? 0) + 1,
        snapshotJson: toJson(baseCharacterToDraft(baseCharacter)),
        changeSummary,
        sourceType,
        sourceRefId,
      },
    });
  }

  async listLinks(novelId: string): Promise<CharacterLibraryLink[]> {
    const rows = await prisma.characterLibraryLink.findMany({
      where: { novelId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(mapLink);
  }

  async listProposals(input: {
    novelId?: string;
    characterId?: string;
    baseCharacterId?: string;
    status?: "pending_review" | "applied" | "ignored" | "rejected";
  }): Promise<CharacterSyncProposal[]> {
    const rows = await prisma.characterSyncProposal.findMany({
      where: {
        novelId: input.novelId,
        characterId: input.characterId,
        baseCharacterId: input.baseCharacterId,
        status: input.status ?? "pending_review",
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 80,
    });
    return rows.map(mapProposal);
  }

  async previewNovelCharacterToLibrary(input: {
    novelId: string;
    characterId: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    userIntent?: string;
  }): Promise<CharacterSyncProposal> {
    const [novel, character, link, timelines] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: input.novelId },
        select: { id: true, title: true, description: true },
      }),
      prisma.character.findFirst({
        where: { id: input.characterId, novelId: input.novelId },
      }),
      prisma.characterLibraryLink.findUnique({
        where: { characterId: input.characterId },
        include: { baseCharacter: true, baseRevision: true },
      }),
      prisma.characterTimeline.findMany({
        where: { novelId: input.novelId, characterId: input.characterId },
        orderBy: [{ chapterOrder: "desc" }, { createdAt: "desc" }],
        take: 12,
      }),
    ]);

    if (!novel || !character) {
      throw new Error("小说或角色不存在");
    }

    const aiResult = await runStructuredPrompt({
      asset: characterSyncClassificationPrompt,
      promptInput: {
        novelTitle: novel.title,
        novelSummary: novel.description ?? "",
        novelCharacterJson: JSON.stringify(character, null, 2),
        baseCharacterJson: link?.baseCharacter ? JSON.stringify(baseCharacterToDraft(link.baseCharacter), null, 2) : "",
        currentBaseRevisionJson: link?.baseRevision?.snapshotJson ?? "",
        recentTimelineText: timelines.map((item) => `${item.title}: ${item.content}`).join("\n"),
        userIntent: input.userIntent ?? "判断当前小说角色中哪些设定适合沉淀到角色库。",
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
      },
    });

    const parsed = characterSyncProposalAiOutputSchema.parse(aiResult.output);
    const payload: CharacterSyncProposalPayload = {
      baseCharacterDraft: parsed.baseCharacterDraft ? sanitizeBaseCharacterDraft(parsed.baseCharacterDraft) : null,
      applyableFields: parsed.safeUpdates.map((item) => item.field),
      warnings: parsed.riskyUpdates.map((item) => item.summary),
      scopeNote: parsed.scopeNote,
    };

    const row = await prisma.characterSyncProposal.create({
      data: {
        novelId: input.novelId,
        characterId: input.characterId,
        baseCharacterId: link?.baseCharacterId ?? character.baseCharacterId ?? null,
        baseRevisionId: link?.baseRevisionId ?? null,
        direction: "novel_to_library",
        status: "pending_review",
        confidence: parsed.confidence,
        summary: parsed.summary,
        payloadJson: toJson(payload),
        safeUpdatesJson: toJson(parsed.safeUpdates),
        novelOnlyUpdatesJson: toJson(parsed.novelOnlyUpdates),
        riskyUpdatesJson: toJson(parsed.riskyUpdates),
        recommendedAction: parsed.recommendedAction,
        sourceType: "ai_character_sync_classification",
      },
    });

    return mapProposal(row);
  }

  async saveNovelCharacterToLibrary(
    novelId: string,
    characterId: string,
    input: NovelCharacterSaveToLibraryInput,
  ) {
    const character = await prisma.character.findFirst({
      where: { id: characterId, novelId },
    });
    if (!character) {
      throw new Error("角色不存在");
    }

    let draft = input.baseCharacter ? sanitizeBaseCharacterDraft(input.baseCharacter) : null;
    let proposalId: string | null = null;
    if (input.proposalId) {
      const proposal = await prisma.characterSyncProposal.findFirst({
        where: {
          id: input.proposalId,
          novelId,
          characterId,
          direction: "novel_to_library",
          status: "pending_review",
        },
      });
      if (!proposal) {
        throw new Error("角色同步提案不存在或已处理。");
      }
      const payload = parseJsonObject(proposal.payloadJson);
      draft = sanitizeBaseCharacterDraft(payload.baseCharacterDraft);
      proposalId = proposal.id;
    }
    if (!draft) {
      throw new Error("缺少可写入角色库的角色设定。");
    }

    const result = await prisma.$transaction(async (tx) => {
      const baseCharacter = await tx.baseCharacter.create({
        data: {
          name: draft.name,
          role: draft.role,
          personality: draft.personality,
          background: draft.background,
          development: draft.development,
          appearance: draft.appearance ?? undefined,
          weaknesses: draft.weaknesses ?? undefined,
          interests: draft.interests ?? undefined,
          keyEvents: draft.keyEvents ?? undefined,
          tags: draft.tags,
          category: draft.category,
        },
      });
      const revision = await tx.baseCharacterRevision.create({
        data: {
          baseCharacterId: baseCharacter.id,
          version: 1,
          snapshotJson: toJson(draft),
          changeSummary: `从小说角色《${character.name}》保存到角色库。`,
          sourceType: "novel_character_export",
          sourceRefId: character.id,
        },
      });
      const updatedCharacter = await tx.character.update({
        where: { id: character.id },
        data: { baseCharacterId: baseCharacter.id },
      });
      const link = await tx.characterLibraryLink.upsert({
        where: { characterId: character.id },
        create: {
          novelId,
          characterId: character.id,
          baseCharacterId: baseCharacter.id,
          baseRevisionId: revision.id,
          syncPolicy: input.syncPolicy,
          linkStatus: input.linkStatus,
          lastSyncedAt: new Date(),
        },
        update: {
          baseCharacterId: baseCharacter.id,
          baseRevisionId: revision.id,
          syncPolicy: input.syncPolicy,
          linkStatus: input.linkStatus,
          lastSyncedAt: new Date(),
        },
      });
      if (proposalId) {
        await tx.characterSyncProposal.update({
          where: { id: proposalId },
          data: {
            status: "applied",
            baseCharacterId: baseCharacter.id,
            baseRevisionId: revision.id,
          },
        });
      }
      return { baseCharacter, revision, character: updatedCharacter, link };
    });

    queueRagUpsert("character", result.character.id);
    return {
      ...result,
      link: mapLink(result.link),
    };
  }

  async importBaseCharacterToNovel(novelId: string, rawInput: ImportBaseCharacterToNovelInput) {
    const input = importBaseCharacterToNovelInputSchema.parse(rawInput);
    const baseCharacter = await prisma.baseCharacter.findUnique({
      where: { id: input.baseCharacterId },
    });
    if (!baseCharacter) {
      throw new Error("基础角色不存在");
    }

    const revision = await this.ensureLatestBaseRevision(baseCharacter.id, "base_character_import");
    const draft = baseCharacterToDraft(baseCharacter);
    const modeConfig = this.resolveImportMode(input.mode);

    const result = await prisma.$transaction(async (tx) => {
      const character = await tx.character.create({
        data: {
          novelId,
          baseCharacterId: baseCharacter.id,
          name: input.overrides.name ?? draft.name,
          role: input.overrides.role ?? draft.role,
          personality: draft.personality,
          background: draft.background,
          development: draft.development,
          storyFunction: input.overrides.storyFunction,
          relationToProtagonist: input.overrides.relationToProtagonist,
          currentState: input.overrides.currentState,
          currentGoal: input.overrides.currentGoal,
        },
      });
      const link = await tx.characterLibraryLink.create({
        data: {
          novelId,
          characterId: character.id,
          baseCharacterId: baseCharacter.id,
          baseRevisionId: revision.id,
          syncPolicy: modeConfig.syncPolicy,
          linkStatus: modeConfig.linkStatus,
          localOverridesJson: toJson(input.overrides),
          lastSyncedAt: modeConfig.linkStatus === "linked" ? new Date() : null,
        },
      });
      return { character, link, baseCharacter, revision };
    });

    queueRagUpsert("character", result.character.id);
    return {
      ...result,
      link: mapLink(result.link),
    };
  }

  async createLibraryUpdateProposals(
    baseCharacterId: string,
    baseRevisionId: string,
    options: { excludeCharacterId?: string | null } = {},
  ): Promise<CharacterSyncProposal[]> {
    const revision = await prisma.baseCharacterRevision.findUnique({
      where: { id: baseRevisionId },
    });
    if (!revision) {
      throw new Error("角色库版本不存在");
    }
    const baseSnapshot = sanitizeBaseCharacterDraft(JSON.parse(revision.snapshotJson) as unknown);
    const links = await prisma.characterLibraryLink.findMany({
      where: {
        baseCharacterId,
        linkStatus: "linked",
        syncPolicy: { not: "locked_instance" },
        ...(options.excludeCharacterId ? { characterId: { not: options.excludeCharacterId } } : {}),
      },
      include: { character: true },
    });

    const rows = [];
    for (const link of links) {
      const existing = await prisma.characterSyncProposal.findFirst({
        where: {
          novelId: link.novelId,
          characterId: link.characterId,
          baseCharacterId,
          baseRevisionId,
          direction: "library_to_novel",
          status: "pending_review",
        },
      });
      if (existing) {
        rows.push(existing);
        continue;
      }
      rows.push(await prisma.characterSyncProposal.create({
        data: {
          novelId: link.novelId,
          characterId: link.characterId,
          baseCharacterId,
          baseRevisionId,
          direction: "library_to_novel",
          status: "pending_review",
          confidence: null,
          summary: `角色库《${baseSnapshot.name}》有新版本，可选择是否应用到《${link.character.name}》。`,
          payloadJson: toJson({
            baseSnapshot,
            applyableFields: [...APPLY_TO_NOVEL_FIELDS],
            warnings: ["应用后只会改变当前小说中的这个角色，不会影响角色库或其他小说。"],
            scopeNote: "这次更新不会自动影响其他小说。",
          }),
          safeUpdatesJson: toJson(buildLibraryUpdateFields(baseSnapshot)),
          novelOnlyUpdatesJson: toJson([]),
          riskyUpdatesJson: toJson([]),
          recommendedAction: "review_before_apply",
          sourceType: "base_character_revision",
          sourceRefId: baseRevisionId,
        },
      }));
    }
    return rows.map(mapProposal);
  }

  async applyProposal(proposalId: string): Promise<CharacterSyncProposal> {
    const proposal = await prisma.characterSyncProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.status !== "pending_review") {
      throw new Error("角色同步提案不存在或已处理。");
    }

    if (proposal.direction === "library_to_novel") {
      await this.applyLibraryToNovelProposal(proposal);
    } else if (proposal.direction === "novel_to_library") {
      const revision = await this.applyNovelToLibraryProposal(proposal);
      if (proposal.baseCharacterId && proposal.characterId) {
        await this.createLibraryUpdateProposals(proposal.baseCharacterId, revision.id, {
          excludeCharacterId: proposal.characterId,
        });
      }
    } else {
      throw new Error("未知的角色同步方向。");
    }

    const updated = await prisma.characterSyncProposal.findUnique({ where: { id: proposalId } });
    if (!updated) {
      throw new Error("角色同步提案不存在。");
    }
    return mapProposal(updated);
  }

  async ignoreProposal(proposalId: string): Promise<CharacterSyncProposal> {
    const updated = await prisma.characterSyncProposal.update({
      where: { id: proposalId },
      data: { status: "ignored" },
    });
    return mapProposal(updated);
  }

  private resolveImportMode(mode: BaseCharacterImportMode): {
    syncPolicy: CharacterSyncPolicy;
    linkStatus: CharacterLibraryLinkStatus;
  } {
    if (mode === "detached_copy") {
      return { syncPolicy: "locked_instance", linkStatus: "detached" };
    }
    if (mode === "linked") {
      return { syncPolicy: "manual_review", linkStatus: "linked" };
    }
    return { syncPolicy: "manual_review", linkStatus: "linked" };
  }

  private async applyLibraryToNovelProposal(proposal: {
    id: string;
    novelId: string | null;
    characterId: string | null;
    baseRevisionId: string | null;
    payloadJson: string;
  }): Promise<void> {
    if (!proposal.characterId || !proposal.baseRevisionId) {
      throw new Error("同步提案缺少小说角色或角色库版本。");
    }
    const payload = parseJsonObject(proposal.payloadJson);
    const baseSnapshot = sanitizeBaseCharacterDraft(payload.baseSnapshot);
    const data: Partial<Record<ApplyToNovelField, string>> = {};
    for (const field of APPLY_TO_NOVEL_FIELDS) {
      data[field] = baseSnapshot[field];
    }
    await prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: proposal.characterId ?? "" },
        data,
      });
      await tx.characterLibraryLink.update({
        where: { characterId: proposal.characterId ?? "" },
        data: {
          baseRevisionId: proposal.baseRevisionId,
          lastSyncedAt: new Date(),
        },
      });
      await tx.characterSyncProposal.update({
        where: { id: proposal.id },
        data: { status: "applied" },
      });
    });
    queueRagUpsert("character", proposal.characterId);
  }

  private async applyNovelToLibraryProposal(proposal: {
    id: string;
    novelId: string | null;
    characterId: string | null;
    baseCharacterId: string | null;
    payloadJson: string;
    summary: string;
  }): Promise<{ id: string }> {
    if (!proposal.baseCharacterId || !proposal.characterId) {
      throw new Error("更新角色库需要已有角色库角色和小说角色。新建角色库请使用保存到角色库入口。");
    }
    const payload = parseJsonObject(proposal.payloadJson);
    const draft = sanitizeBaseCharacterDraft(payload.baseCharacterDraft);
    const revision = await prisma.$transaction(async (tx) => {
      await tx.baseCharacter.update({
        where: { id: proposal.baseCharacterId ?? "" },
        data: {
          name: draft.name,
          role: draft.role,
          personality: draft.personality,
          background: draft.background,
          development: draft.development,
          appearance: draft.appearance ?? undefined,
          weaknesses: draft.weaknesses ?? undefined,
          interests: draft.interests ?? undefined,
          keyEvents: draft.keyEvents ?? undefined,
          tags: draft.tags,
          category: draft.category,
        },
      });
      const latest = await tx.baseCharacterRevision.findFirst({
        where: { baseCharacterId: proposal.baseCharacterId ?? "" },
        orderBy: { version: "desc" },
      });
      const revision = await tx.baseCharacterRevision.create({
        data: {
          baseCharacterId: proposal.baseCharacterId ?? "",
          version: (latest?.version ?? 0) + 1,
          snapshotJson: toJson(draft),
          changeSummary: proposal.summary,
          sourceType: "novel_character_sync",
          sourceRefId: proposal.characterId,
        },
      });
      await tx.characterLibraryLink.update({
        where: { characterId: proposal.characterId ?? "" },
        data: {
          baseRevisionId: revision.id,
          lastSyncedAt: new Date(),
        },
      });
      await tx.characterSyncProposal.update({
        where: { id: proposal.id },
        data: {
          status: "applied",
          baseRevisionId: revision.id,
        },
      });
      return revision;
    });
    return revision;
  }
}

export const characterLibrarySyncService = new CharacterLibrarySyncService();
