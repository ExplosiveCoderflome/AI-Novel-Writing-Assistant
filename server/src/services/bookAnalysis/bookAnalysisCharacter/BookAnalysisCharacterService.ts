import type {
  BookAnalysisCharacter,
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerateInput,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { bookAnalysisCharacterGeneratePrompt } from "../../../prompting/prompts/bookAnalysis/bookAnalysisCharacter.prompts";
import { BookAnalysisSourceCacheService } from "../bookAnalysis.cache";
import {
  decodeEvidence,
  getEffectiveContent,
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
  safeParseJSON,
} from "../bookAnalysis.utils";

const DEFAULT_CHARACTER_DIMENSIONS: BookAnalysisCharacterDimension[] = [
  "basic",
  "appearance",
  "personality",
  "motivation",
  "arc",
  "relations",
  "scenes",
];

type CharacterPromptRunner = typeof runStructuredPrompt;

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  const parsed = safeParseJSON<Record<string, unknown> | null>(value, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function parseDimensions(value: string | null): BookAnalysisCharacterDimension[] {
  const parsed = safeParseJSON<unknown[]>(value, []);
  const valid = new Set(DEFAULT_CHARACTER_DIMENSIONS);
  return parsed.filter((item): item is BookAnalysisCharacterDimension =>
    typeof item === "string" && valid.has(item as BookAnalysisCharacterDimension),
  );
}

function normalizeDepth(value: unknown): BookAnalysisCharacterGenerationDepth {
  return value === "quick" || value === "deep" ? value : "standard";
}

function normalizeDimensions(value: unknown): BookAnalysisCharacterDimension[] {
  if (!Array.isArray(value)) {
    return DEFAULT_CHARACTER_DIMENSIONS;
  }
  const valid = new Set(DEFAULT_CHARACTER_DIMENSIONS);
  const normalized = value.filter((item): item is BookAnalysisCharacterDimension =>
    typeof item === "string" && valid.has(item as BookAnalysisCharacterDimension),
  );
  return normalized.length > 0 ? normalized : DEFAULT_CHARACTER_DIMENSIONS;
}

function normalizeProfile(input: Record<string, unknown>, fallbackName: string, fallbackRole: string): CharacterProfile {
  const readString = (key: string) => (typeof input[key] === "string" ? String(input[key]).trim() : "");
  const profile: CharacterProfile = {
    name: readString("name") || fallbackName,
    role: readString("role") || fallbackRole,
  };
  for (const key of [
    "age",
    "gender",
    "appearance",
    "physique",
    "attireStyle",
    "signatureDetail",
    "personality",
    "values",
    "speakingStyle",
    "outerGoal",
    "innerNeed",
    "fear",
    "wound",
    "misbelief",
    "growthTrajectory",
  ] as const) {
    const value = readString(key);
    if (value) {
      profile[key] = value;
    }
  }
  if (Array.isArray(input.aliases)) {
    profile.aliases = input.aliases.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (Array.isArray(input.arcStages)) {
    profile.arcStages = input.arcStages.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (Array.isArray(input.keyRelations)) {
    profile.keyRelations = input.keyRelations
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const row = item as Record<string, unknown>;
        const targetName = typeof row.targetName === "string" ? row.targetName.trim() : "";
        const relationType = typeof row.relationType === "string" ? row.relationType.trim() : "";
        if (!targetName || !relationType) {
          return null;
        }
        const relation: NonNullable<CharacterProfile["keyRelations"]>[number] = {
          targetName,
          relationType,
        };
        const description = typeof row.description === "string" ? row.description.trim() : "";
        if (description) {
          relation.description = description;
        }
        return relation;
      })
      .filter((item): item is NonNullable<CharacterProfile["keyRelations"]>[number] => Boolean(item));
  }
  if (Array.isArray(input.highlightScenes)) {
    profile.highlightScenes = input.highlightScenes
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const row = item as Record<string, unknown>;
        const sceneLabel = typeof row.sceneLabel === "string" ? row.sceneLabel.trim() : "";
        const performance = typeof row.performance === "string" ? row.performance.trim() : "";
        return sceneLabel && performance ? { sceneLabel, performance } : null;
      })
      .filter((item): item is NonNullable<CharacterProfile["highlightScenes"]>[number] => Boolean(item));
  }
  return profile;
}

function serializeCharacter(row: any): BookAnalysisCharacter {
  const profile = normalizeProfile(parseJsonObject(row.profileJson) ?? {}, row.name, row.role);
  return {
    id: row.id,
    analysisId: row.analysisId,
    name: row.name,
    role: row.role,
    generationDepth: normalizeDepth(row.generationDepth),
    selectedDimensions: parseDimensions(row.selectedDimensionsJson),
    profile,
    evidence: decodeEvidence(row.evidenceJson),
    arcs: (row.arcs ?? []).map((arc: any) => ({
      id: arc.id,
      characterId: arc.characterId,
      chapterIndex: arc.chapterIndex,
      stageLabel: arc.stageLabel,
      stateSnapshot: parseJsonObject(arc.stateSnapshotJson),
      evidence: decodeEvidence(arc.evidenceJson),
      sortOrder: arc.sortOrder,
      createdAt: arc.createdAt.toISOString(),
      updatedAt: arc.updatedAt.toISOString(),
    })),
    scenes: (row.scenes ?? []).map((scene: any) => ({
      id: scene.id,
      characterId: scene.characterId,
      sceneLabel: scene.sceneLabel,
      sceneType: scene.sceneType,
      performance: parseJsonObject(scene.performanceJson),
      evidence: decodeEvidence(scene.evidenceJson),
      sortOrder: scene.sortOrder,
      createdAt: scene.createdAt.toISOString(),
      updatedAt: scene.updatedAt.toISOString(),
    })),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
    const characterSystemContext = characterSystemSection ? getEffectiveContent(characterSystemSection) : "";
    const result = await this.promptRunner({
      asset: bookAnalysisCharacterGeneratePrompt,
      promptInput: {
        generationDepth: normalizeDepth(input.generationDepth),
        selectedDimensions: normalizeDimensions(input.selectedDimensions),
        characterNames: (input.characterNames ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8),
        characterSystemContext,
        notesText: renderNotesForPrompt(notesResult.notes, "character_system"),
      },
      options: {
        provider,
        model,
        temperature,
        maxTokens,
      },
    });
    const rows = Array.isArray(result.output?.characters) ? result.output.characters.slice(0, 8) : [];
    const existingCount = await prisma.bookAnalysisCharacter.count({ where: { analysisId } });
    await prisma.$transaction(async (tx) => {
      let offset = existingCount;
      for (const row of rows) {
        const name = typeof row.name === "string" ? row.name.trim() : "";
        const role = typeof row.role === "string" ? row.role.trim() : "";
        if (!name || !role) {
          continue;
        }
        const profile = normalizeProfile(row.profile && typeof row.profile === "object" ? row.profile : {}, name, role);
        const created = await tx.bookAnalysisCharacter.create({
          data: {
            analysisId,
            name: profile.name,
            role: profile.role,
            generationDepth: normalizeDepth(input.generationDepth),
            selectedDimensionsJson: JSON.stringify(normalizeDimensions(input.selectedDimensions)),
            profileJson: JSON.stringify(profile),
            evidenceJson: Array.isArray(row.evidence) && row.evidence.length > 0 ? JSON.stringify(row.evidence) : null,
            sortOrder: offset,
          },
        });
        offset += 1;
        for (const [index, arc] of (Array.isArray(row.arcs) ? row.arcs : []).entries()) {
          if (!arc?.stageLabel) {
            continue;
          }
          await tx.bookAnalysisCharacterArc.create({
            data: {
              characterId: created.id,
              chapterIndex: Number.isInteger(arc.chapterIndex) ? arc.chapterIndex : null,
              stageLabel: String(arc.stageLabel).trim(),
              stateSnapshotJson: arc.stateSnapshot ? JSON.stringify(arc.stateSnapshot) : null,
              evidenceJson: Array.isArray(arc.evidence) && arc.evidence.length > 0 ? JSON.stringify(arc.evidence) : null,
              sortOrder: index,
            },
          });
        }
        for (const [index, scene] of (Array.isArray(row.scenes) ? row.scenes : []).entries()) {
          if (!scene?.sceneLabel) {
            continue;
          }
          await tx.bookAnalysisCharacterScene.create({
            data: {
              characterId: created.id,
              sceneLabel: String(scene.sceneLabel).trim(),
              sceneType: typeof scene.sceneType === "string" ? scene.sceneType.trim() || null : null,
              performanceJson: scene.performance ? JSON.stringify(scene.performance) : null,
              evidenceJson: Array.isArray(scene.evidence) && scene.evidence.length > 0 ? JSON.stringify(scene.evidence) : null,
              sortOrder: index,
            },
          });
        }
      }
    });
    return this.listCharacters(analysisId);
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
