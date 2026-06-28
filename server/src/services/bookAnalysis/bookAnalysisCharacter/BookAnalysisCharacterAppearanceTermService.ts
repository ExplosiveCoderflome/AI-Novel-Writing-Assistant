import type {
  BookAnalysisCharacterAppearanceMergeResult,
  BookAnalysisCharacterAppearanceTerm,
  BookAnalysisCharacterAppearanceTermStatus,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { bookAnalysisCharacterAppearanceMergePrompt } from "../../../prompting/prompts/bookAnalysis/bookAnalysisCharacter.prompts";
import { BookAnalysisBudgetGuard } from "../caching/bookAnalysis.budget";
import {
  decodeEvidence,
  normalizeMaxTokens,
  normalizeTemperature,
} from "../shared/bookAnalysis.utils";
import {
  normalizeProfile,
  parseJsonObject,
  serializeAppearance,
  serializeAppearanceTerm,
  serializeCharacter,
} from "./BookAnalysisCharacterSerializers";

type AppearanceTermPromptRunner = typeof runStructuredPrompt;

type MergeableTermStatus = Extract<BookAnalysisCharacterAppearanceTermStatus, "pending" | "accepted">;

function normalizeWritableStatus(value: unknown): Exclude<BookAnalysisCharacterAppearanceTermStatus, "merged"> {
  return value === "accepted" || value === "rejected" ? value : "pending";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean) : [];
}

function readProfileAppearance(profile: CharacterProfile): string {
  return typeof profile.appearance === "string" ? profile.appearance.trim() : "";
}

function mergeConsolidatedAppearance(
  current: Record<string, unknown> | null,
  patch: Record<string, unknown>,
  mergedAppearance: string,
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    ...(Object.keys(patch).length > 0 ? patch : { appearance: mergedAppearance }),
  };
}

export class BookAnalysisCharacterAppearanceTermService {
  constructor(private readonly promptRunner: AppearanceTermPromptRunner = runStructuredPrompt) {}

  async listTerms(
    analysisId: string,
    characterId: string,
    status?: BookAnalysisCharacterAppearanceTermStatus,
  ): Promise<BookAnalysisCharacterAppearanceTerm[]> {
    await this.assertCharacterExists(analysisId, characterId);
    const rows = await prisma.bookAnalysisCharacterAppearanceTerm.findMany({
      where: {
        characterId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: "asc" }, { chapterIndex: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(serializeAppearanceTerm);
  }

  async updateTermStatus(
    analysisId: string,
    characterId: string,
    termId: string,
    status: Exclude<BookAnalysisCharacterAppearanceTermStatus, "merged">,
  ): Promise<BookAnalysisCharacterAppearanceTerm> {
    await this.assertAnalysisWritable(analysisId);
    await this.assertCharacterExists(analysisId, characterId);
    const current = await prisma.bookAnalysisCharacterAppearanceTerm.findFirst({
      where: { id: termId, characterId },
    });
    if (!current) {
      throw new AppError("Book analysis character appearance term not found.", 404);
    }
    if (current.status === "merged") {
      throw new AppError("Merged appearance terms cannot be edited.", 400);
    }
    const row = await prisma.bookAnalysisCharacterAppearanceTerm.update({
      where: { id: termId },
      data: { status: normalizeWritableStatus(status) },
    });
    return serializeAppearanceTerm(row);
  }

  async mergeTerms(
    analysisId: string,
    characterId: string,
    termIds: string[],
  ): Promise<BookAnalysisCharacterAppearanceMergeResult> {
    await this.assertAnalysisWritable(analysisId);
    const selectedIds = Array.from(new Set(termIds.map((item) => item.trim()).filter(Boolean))).slice(0, 24);
    if (selectedIds.length === 0) {
      throw new AppError("Select at least one appearance term to merge.", 400);
    }

    const context = await this.buildPromptContext(analysisId);
    const character = await prisma.bookAnalysisCharacter.findFirst({
      where: { id: characterId, analysisId },
      include: {
        appearance: true,
      },
    });
    if (!character) {
      throw new AppError("Book analysis character not found.", 404);
    }

    const terms = await prisma.bookAnalysisCharacterAppearanceTerm.findMany({
      where: {
        id: { in: selectedIds },
        characterId,
        status: { in: ["pending", "accepted"] satisfies MergeableTermStatus[] },
      },
      orderBy: [{ chapterIndex: "asc" }, { createdAt: "asc" }],
    });
    if (terms.length === 0) {
      throw new AppError("No mergeable appearance terms were selected.", 400);
    }

    const profile = normalizeProfile(parseJsonObject(character.profileJson) ?? {}, character.name, character.role);
    const currentConsolidated = parseJsonObject(character.appearance?.consolidatedAppearanceJson ?? null);
    const result = await this.promptRunner({
      asset: bookAnalysisCharacterAppearanceMergePrompt,
      promptInput: {
        character: {
          name: character.name,
          role: character.role,
          profile: { ...profile },
        },
        currentAppearance: readProfileAppearance(profile),
        consolidatedAppearance: currentConsolidated,
        selectedTerms: terms.map((term) => ({
          id: term.id,
          text: term.text,
          category: term.category,
          confidence: term.confidence,
          stability: term.stability,
          evidence: decodeEvidence(term.evidenceJson),
        })),
      },
      options: {
        provider: context.provider,
        model: context.model,
        temperature: context.temperature,
        maxTokens: context.maxTokens,
      },
    });
    await new BookAnalysisBudgetGuard(analysisId).onSectionFinished(result.meta.tokenUsage);

    const selectedIdSet = new Set(terms.map((term) => term.id));
    const ignoredIds = readStringArray(result.output.ignoredTermIds).filter((id) => selectedIdSet.has(id));
    const acceptedIds = readStringArray(result.output.acceptedTermIds).filter((id) => selectedIdSet.has(id));
    const mergedIds = acceptedIds.length > 0
      ? acceptedIds
      : terms.map((term) => term.id).filter((id) => !ignoredIds.includes(id));
    if (mergedIds.length === 0) {
      throw new AppError("The selected appearance terms were not suitable for merging.", 400);
    }

    const mergedProfile = {
      ...(parseJsonObject(character.profileJson) ?? {}),
      name: character.name,
      role: character.role,
      appearance: result.output.mergedAppearance,
    };
    const consolidatedAppearance = mergeConsolidatedAppearance(
      currentConsolidated,
      result.output.consolidatedAppearancePatch ?? {},
      result.output.mergedAppearance,
    );

    await prisma.$transaction(async (tx) => {
      await tx.bookAnalysisCharacter.update({
        where: { id: characterId },
        data: {
          profileJson: JSON.stringify(normalizeProfile(mergedProfile, character.name, character.role)),
          status: "generated",
          lastGenerationError: null,
        },
      });
      await tx.bookAnalysisCharacterAppearance.upsert({
        where: { characterId },
        create: {
          characterId,
          coveragePercent: 0,
          consolidatedAppearanceJson: JSON.stringify(consolidatedAppearance),
          variantPolicyJson: JSON.stringify({}),
        },
        update: {
          consolidatedAppearanceJson: JSON.stringify(consolidatedAppearance),
        },
      });
      if (mergedIds.length > 0) {
        await tx.bookAnalysisCharacterAppearanceTerm.updateMany({
          where: { id: { in: mergedIds }, characterId },
          data: { status: "merged" },
        });
      }
      if (ignoredIds.length > 0) {
        await tx.bookAnalysisCharacterAppearanceTerm.updateMany({
          where: { id: { in: ignoredIds }, characterId },
          data: { status: "rejected" },
        });
      }
    });

    const updatedCharacter = await prisma.bookAnalysisCharacter.findUnique({
      where: { id: characterId },
      include: {
        arcs: { orderBy: [{ sortOrder: "asc" }] },
        scenes: { orderBy: [{ sortOrder: "asc" }] },
        appearance: {
          include: {
            snapshots: {
              include: { images: { include: { imageAsset: true } } },
              orderBy: [{ chapterIndex: "asc" }],
            },
          },
        },
      },
    });
    const updatedAppearance = await prisma.bookAnalysisCharacterAppearance.findUnique({
      where: { characterId },
      include: {
        snapshots: {
          include: { images: { include: { imageAsset: true } } },
          orderBy: [{ chapterIndex: "asc" }],
        },
      },
    });
    const updatedTerms = await this.listTerms(analysisId, characterId);
    if (!updatedCharacter) {
      throw new AppError("Book analysis character not found after appearance merge.", 500);
    }
    return {
      character: serializeCharacter(updatedCharacter),
      appearance: serializeAppearance(updatedAppearance),
      terms: updatedTerms,
      mergedAppearance: result.output.mergedAppearance,
      mergeNotes: readStringArray(result.output.mergeNotes),
    };
  }

  private async buildPromptContext(analysisId: string): Promise<{
    provider: LLMProvider;
    model?: string;
    temperature: number;
    maxTokens?: number;
  }> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        provider: true,
        model: true,
        temperature: true,
        maxTokens: true,
      },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    return {
      provider: (analysis.provider as LLMProvider | null) ?? "deepseek",
      model: analysis.model ?? undefined,
      temperature: normalizeTemperature(analysis.temperature),
      maxTokens: normalizeMaxTokens(analysis.maxTokens),
    };
  }

  private async assertAnalysisWritable(analysisId: string): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: { status: true },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be edited.", 400);
    }
  }

  private async assertCharacterExists(analysisId: string, characterId: string): Promise<void> {
    const exists = await prisma.bookAnalysisCharacter.count({
      where: { id: characterId, analysisId },
    });
    if (!exists) {
      throw new AppError("Book analysis character not found.", 404);
    }
  }
}

export const bookAnalysisCharacterAppearanceTermService = new BookAnalysisCharacterAppearanceTermService();
