import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterBatchGenerateInput,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerateInput,
  BookAnalysisCharacterGenerationDepth,
  BookAnalysisCharacterIdentifyInput,
  BookAnalysisCharacterProfileGenerateInput,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  bookAnalysisCharacterGeneratePrompt,
  bookAnalysisCharacterIdentifyPrompt,
  bookAnalysisCharacterProfilePrompt,
} from "../../../prompting/prompts/bookAnalysis/bookAnalysisCharacter.prompts";
import { BookAnalysisBudgetGuard } from "../caching/bookAnalysis.budget";
import { BookAnalysisSourceCacheService } from "../caching/bookAnalysis.cache";
import {
  getEffectiveContent,
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
} from "../shared/bookAnalysis.utils";
import {
  DEFAULT_CHARACTER_DIMENSIONS,
  normalizeCandidateName,
  normalizeDepth,
  normalizeDimensions,
  normalizeProfile,
  parseJsonObject,
  parseStringArray,
  serializeCharacter,
} from "./BookAnalysisCharacterSerializers";

const GENERATED_CHARACTER_BATCH_CONCURRENCY = 3;
const MAX_IDENTIFIED_CANDIDATES = 16;

type CharacterPromptRunner = typeof runStructuredPrompt;

type CharacterGenerationContext = {
  provider: LLMProvider;
  model?: string;
  temperature: number;
  maxTokens?: number;
  characterSystemContext: string;
  notesText: string;
};

export class BookAnalysisCharacterService {
  constructor(
    private readonly sourceCache = new BookAnalysisSourceCacheService(),
    private readonly promptRunner: CharacterPromptRunner = runStructuredPrompt,
  ) {}

  async listCharacters(analysisId: string): Promise<BookAnalysisCharacter[]> {
    await this.assertAnalysisExists(analysisId);
    const rows = await prisma.bookAnalysisCharacter.findMany({
      where: { analysisId },
      include: {
        arcs: { orderBy: [{ sortOrder: "asc" }] },
        scenes: { orderBy: [{ sortOrder: "asc" }] },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(serializeCharacter);
  }

  async createCharacter(
    analysisId: string,
    input: {
      name: string;
      role: string;
      profile?: Record<string, unknown>;
      generationDepth?: BookAnalysisCharacterGenerationDepth;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ): Promise<BookAnalysisCharacter> {
    await this.assertAnalysisWritable(analysisId);
    const count = await prisma.bookAnalysisCharacter.count({ where: { analysisId } });
    const profile = normalizeProfile(input.profile ?? {}, input.name.trim(), input.role.trim());
    const row = await prisma.bookAnalysisCharacter.create({
      data: {
        analysisId,
        name: profile.name,
        role: profile.role,
        status: "generated",
        generationDepth: normalizeDepth(input.generationDepth),
        selectedDimensionsJson: JSON.stringify(normalizeDimensions(input.selectedDimensions)),
        profileJson: JSON.stringify(profile),
        sortOrder: count,
      },
      include: {
        arcs: true,
        scenes: true,
      },
    });
    return serializeCharacter(row);
  }

  async updateCharacter(
    analysisId: string,
    characterId: string,
    input: {
      name?: string;
      role?: string;
      profile?: Record<string, unknown>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ): Promise<BookAnalysisCharacter> {
    await this.assertAnalysisWritable(analysisId);
    const current = await prisma.bookAnalysisCharacter.findFirst({
      where: { id: characterId, analysisId },
    });
    if (!current) {
      throw new AppError("Book analysis character not found.", 404);
    }
    const currentProfile = parseJsonObject(current.profileJson) ?? {};
    const nextName = input.name?.trim() || current.name;
    const nextRole = input.role?.trim() || current.role;
    const profile = normalizeProfile({ ...currentProfile, ...(input.profile ?? {}), name: nextName, role: nextRole }, nextName, nextRole);
    const row = await prisma.bookAnalysisCharacter.update({
      where: { id: characterId },
      data: {
        name: profile.name,
        role: profile.role,
        ...(input.profile !== undefined ? { status: "generated", lastGenerationError: null } : {}),
        profileJson: JSON.stringify(profile),
        ...(input.selectedDimensions !== undefined
          ? { selectedDimensionsJson: JSON.stringify(normalizeDimensions(input.selectedDimensions)) }
          : {}),
      },
      include: {
        arcs: { orderBy: [{ sortOrder: "asc" }] },
        scenes: { orderBy: [{ sortOrder: "asc" }] },
      },
    });
    return serializeCharacter(row);
  }

  async deleteCharacter(analysisId: string, characterId: string): Promise<void> {
    await this.assertAnalysisWritable(analysisId);
    await prisma.bookAnalysisCharacter.deleteMany({
      where: {
        id: characterId,
        analysisId,
      },
    });
  }

  async generateCharacters(
    analysisId: string,
    input: BookAnalysisCharacterGenerateInput,
  ): Promise<BookAnalysisCharacter[]> {
    const characterNames = (input.characterNames ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    if (characterNames.length > 0) {
      await this.upsertNamedCandidates(analysisId, characterNames);
    } else {
      await this.identifyCharacterCandidates(analysisId);
    }
    return this.generateAllCandidates(analysisId, {
      generationDepth: input.generationDepth,
      selectedDimensions: input.selectedDimensions,
      includeFailed: true,
    });
  }

  async identifyCharacterCandidates(
    analysisId: string,
    input: BookAnalysisCharacterIdentifyInput = {},
  ): Promise<BookAnalysisCharacter[]> {
    await this.assertAnalysisWritable(analysisId);
    const context = await this.buildGenerationContext(analysisId);
    const existingCharacters = await prisma.bookAnalysisCharacter.findMany({
      where: { analysisId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const result = await this.promptRunner({
      asset: bookAnalysisCharacterIdentifyPrompt,
      promptInput: {
        characterSystemContext: context.characterSystemContext,
        notesText: context.notesText,
        existingCharacters: existingCharacters.map((item) => item.name),
        limit: Math.min(MAX_IDENTIFIED_CANDIDATES, Math.max(1, input.limit ?? MAX_IDENTIFIED_CANDIDATES)),
      },
      options: {
        provider: context.provider,
        model: context.model,
        temperature: context.temperature,
        maxTokens: context.maxTokens,
      },
    });
    await new BookAnalysisBudgetGuard(analysisId).onSectionFinished(result.meta.tokenUsage);

    const candidates = Array.isArray(result.output?.candidates)
      ? result.output.candidates.slice(0, MAX_IDENTIFIED_CANDIDATES)
      : [];
    await this.upsertCandidateRows(analysisId, candidates.map((candidate) => ({
      name: candidate.name,
      role: candidate.roleHint,
      importance: candidate.importance,
      briefDescription: candidate.briefDescription,
      occurringChapters: candidate.occurringChapters,
    })));
    return this.listCharacters(analysisId);
  }

  async generateCharacterProfile(
    analysisId: string,
    characterId: string,
    input: BookAnalysisCharacterProfileGenerateInput,
  ): Promise<BookAnalysisCharacter> {
    await this.assertAnalysisWritable(analysisId);
    const context = await this.buildGenerationContext(analysisId);
    const budgetGuard = new BookAnalysisBudgetGuard(analysisId);
    await this.runProfileGeneration(analysisId, characterId, input, context, budgetGuard);
    const rows = await prisma.bookAnalysisCharacter.findMany({
      where: { id: characterId, analysisId },
      include: {
        arcs: { orderBy: [{ sortOrder: "asc" }] },
        scenes: { orderBy: [{ sortOrder: "asc" }] },
      },
    });
    const row = rows[0];
    if (!row) {
      throw new AppError("Book analysis character not found after generation.", 500);
    }
    return serializeCharacter(row);
  }

  async generateAllCandidates(
    analysisId: string,
    input: BookAnalysisCharacterBatchGenerateInput,
  ): Promise<BookAnalysisCharacter[]> {
    await this.assertAnalysisWritable(analysisId);
    const statuses = input.includeFailed ? ["candidate", "failed"] : ["candidate"];
    const candidates = await prisma.bookAnalysisCharacter.findMany({
      where: {
        analysisId,
        status: { in: statuses },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (candidates.length === 0) {
      return this.listCharacters(analysisId);
    }

    const context = await this.buildGenerationContext(analysisId);
    const budgetGuard = new BookAnalysisBudgetGuard(analysisId);
    let nextIndex = 0;
    let stopped = false;
    const worker = async () => {
      while (!stopped) {
        const candidate = candidates[nextIndex];
        nextIndex += 1;
        if (!candidate) {
          return;
        }
        try {
          await this.runProfileGeneration(analysisId, candidate.id, input, context, budgetGuard);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    };
    const workerCount = Math.min(GENERATED_CHARACTER_BATCH_CONCURRENCY, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return this.listCharacters(analysisId);
  }

  private async buildGenerationContext(analysisId: string): Promise<CharacterGenerationContext> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        documentVersion: true,
        sections: true,
      },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot generate character profiles.", 400);
    }
    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);
    const notesResult = await this.sourceCache.getOrBuildSourceNotes({
      documentVersionId: analysis.documentVersionId,
      content: analysis.documentVersion.content,
      provider,
      model,
      temperature,
      sectionMaxTokens: maxTokens,
    });
    const characterSystemSection = analysis.sections.find((section) => section.sectionKey === "character_system");
    return {
      provider,
      model,
      temperature,
      maxTokens,
      characterSystemContext: characterSystemSection ? getEffectiveContent(characterSystemSection) : "",
      notesText: renderNotesForPrompt(notesResult.notes, "character_system"),
    };
  }

  private async upsertNamedCandidates(analysisId: string, names: string[]): Promise<void> {
    await this.assertAnalysisWritable(analysisId);
    await this.upsertCandidateRows(analysisId, names.map((name) => ({
      name,
      role: "待分析角色",
      importance: "medium",
      briefDescription: "用户指定的角色候选。",
      occurringChapters: [],
    })));
  }

  private async upsertCandidateRows(
    analysisId: string,
    candidates: Array<{
      name: string;
      role: string;
      importance?: string | null;
      briefDescription?: string | null;
      occurringChapters?: string[];
    }>,
  ): Promise<void> {
    const existingCharacters = await prisma.bookAnalysisCharacter.findMany({
      where: { analysisId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const existingByName = new Map(existingCharacters.map((item) => [normalizeCandidateName(item.name), item]));
    let offset = existingCharacters.length;
    await prisma.$transaction(async (tx) => {
      for (const candidate of candidates) {
        const name = candidate.name.trim();
        const role = candidate.role.trim();
        if (!name || !role) {
          continue;
        }
        const key = normalizeCandidateName(name);
        if (!key) {
          continue;
        }
        const existing = existingByName.get(key);
        const data = {
          role,
          importance: candidate.importance?.trim() || null,
          briefDescription: candidate.briefDescription?.trim() || null,
          occurringChaptersJson: JSON.stringify((candidate.occurringChapters ?? []).map((item) => item.trim()).filter(Boolean)),
        };
        if (existing) {
          if (existing.status !== "generated") {
            await tx.bookAnalysisCharacter.update({
              where: { id: existing.id },
              data,
            });
          }
          continue;
        }
        const created = await tx.bookAnalysisCharacter.create({
          data: {
            analysisId,
            name,
            status: "candidate",
            generationDepth: "standard",
            selectedDimensionsJson: JSON.stringify(DEFAULT_CHARACTER_DIMENSIONS),
            profileJson: null,
            evidenceJson: null,
            sortOrder: offset,
            ...data,
          },
        });
        existingByName.set(key, created);
        offset += 1;
      }
    });
  }

  private async runProfileGeneration(
    analysisId: string,
    characterId: string,
    input: BookAnalysisCharacterProfileGenerateInput,
    context: CharacterGenerationContext,
    budgetGuard: BookAnalysisBudgetGuard,
  ): Promise<void> {
    const character = await prisma.bookAnalysisCharacter.findFirst({
      where: { id: characterId, analysisId },
      include: {
        arcs: true,
        scenes: true,
      },
    });
    if (!character) {
      throw new AppError("Book analysis character not found.", 404);
    }
    await prisma.bookAnalysisCharacter.update({
      where: { id: characterId },
      data: {
        status: "generating",
        lastGenerationError: null,
      },
    });

    try {
      const result = await this.promptRunner({
        asset: bookAnalysisCharacterProfilePrompt,
        promptInput: {
          generationDepth: normalizeDepth(input.generationDepth),
          selectedDimensions: normalizeDimensions(input.selectedDimensions),
          character: {
            name: character.name,
            role: character.role,
            briefDescription: character.briefDescription,
            importance: character.importance,
            occurringChapters: parseStringArray(character.occurringChaptersJson),
          },
          characterSystemContext: context.characterSystemContext,
          notesText: context.notesText,
        },
        options: {
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
          maxTokens: context.maxTokens,
        },
      });
      await budgetGuard.onSectionFinished(result.meta.tokenUsage);
      const row = result.output?.character;
      const name = typeof row?.name === "string" ? row.name.trim() : character.name;
      const role = typeof row?.role === "string" ? row.role.trim() : character.role;
      const profile = normalizeProfile(row?.profile && typeof row.profile === "object" ? row.profile : {}, name, role);
      await this.replaceGeneratedCharacterContent({
        characterId,
        name: profile.name,
        role: profile.role,
        generationDepth: normalizeDepth(input.generationDepth),
        selectedDimensions: normalizeDimensions(input.selectedDimensions),
        profile,
        evidence: Array.isArray(row?.evidence) ? row.evidence : [],
        arcs: Array.isArray(row?.arcs) ? row.arcs : [],
        scenes: Array.isArray(row?.scenes) ? row.scenes : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.bookAnalysisCharacter.update({
        where: { id: characterId },
        data: {
          status: "failed",
          lastGenerationError: message,
        },
      });
      throw error;
    }
  }

  private async replaceGeneratedCharacterContent(input: {
    characterId: string;
    name: string;
    role: string;
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
    profile: CharacterProfile;
    evidence: unknown[];
    arcs: any[];
    scenes: any[];
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.bookAnalysisCharacterArc.deleteMany({ where: { characterId: input.characterId } });
      await tx.bookAnalysisCharacterScene.deleteMany({ where: { characterId: input.characterId } });
      await tx.bookAnalysisCharacter.update({
        where: { id: input.characterId },
        data: {
          name: input.name,
          role: input.role,
          status: "generated",
          generationDepth: input.generationDepth,
          selectedDimensionsJson: JSON.stringify(input.selectedDimensions),
          profileJson: JSON.stringify(input.profile),
          evidenceJson: input.evidence.length > 0 ? JSON.stringify(input.evidence) : null,
          lastGenerationError: null,
        },
      });
      for (const [index, arc] of input.arcs.entries()) {
        if (!arc?.stageLabel) {
          continue;
        }
        await tx.bookAnalysisCharacterArc.create({
          data: {
            characterId: input.characterId,
            chapterIndex: Number.isInteger(arc.chapterIndex) ? arc.chapterIndex : null,
            stageLabel: String(arc.stageLabel).trim(),
            stateSnapshotJson: arc.stateSnapshot ? JSON.stringify(arc.stateSnapshot) : null,
            evidenceJson: Array.isArray(arc.evidence) && arc.evidence.length > 0 ? JSON.stringify(arc.evidence) : null,
            sortOrder: index,
          },
        });
      }
      for (const [index, scene] of input.scenes.entries()) {
        if (!scene?.sceneLabel) {
          continue;
        }
        await tx.bookAnalysisCharacterScene.create({
          data: {
            characterId: input.characterId,
            sceneLabel: String(scene.sceneLabel).trim(),
            sceneType: typeof scene.sceneType === "string" ? scene.sceneType.trim() || null : null,
            performanceJson: scene.performance ? JSON.stringify(scene.performance) : null,
            evidenceJson: Array.isArray(scene.evidence) && scene.evidence.length > 0 ? JSON.stringify(scene.evidence) : null,
            sortOrder: index,
          },
        });
      }
    });
  }

  private async assertAnalysisWritable(analysisId: string): Promise<void> {
    const analysis = await this.assertAnalysisExists(analysisId);
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be edited.", 400);
    }
  }

  private async assertAnalysisExists(analysisId: string): Promise<{ status: string }> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: { status: true },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    return analysis;
  }
}

export const bookAnalysisCharacterService = new BookAnalysisCharacterService();
