import type {
  BookAnalysisCharacterAppearance,
  BookAnalysisCharacterAppearanceScanInput,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  bookAnalysisCharacterAppearanceConsolidatePrompt,
  bookAnalysisCharacterAppearanceSnapshotPrompt,
} from "../../../prompting/prompts/bookAnalysis/bookAnalysisCharacter.prompts";
import { DocumentChapterService } from "../../knowledge/DocumentChapterService";
import { BookAnalysisBudgetGuard } from "../caching/bookAnalysis.budget";
import { BookAnalysisSourceCacheService } from "../caching/bookAnalysis.cache";
import {
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
} from "../shared/bookAnalysis.utils";
import {
  normalizeProfile,
  parseJsonObject,
  serializeAppearance,
} from "./BookAnalysisCharacterSerializers";
import { bookAnalysisCharacterRagAdapter } from "./BookAnalysisCharacterRagAdapter";

type AppearancePromptRunner = typeof runStructuredPrompt;

interface AppearanceContext {
  documentId: string;
  documentVersionId: string;
  documentContent: string;
  provider: LLMProvider;
  model?: string;
  temperature: number;
  maxTokens?: number;
  notesText: string;
  sourceStartChapterIndex?: number | null;
  sourceEndChapterIndex?: number | null;
}

interface ChapterSlice {
  chapterIndex: number;
  title: string;
  content: string;
}

export class BookAnalysisCharacterAppearanceService {
  constructor(
    private readonly sourceCache = new BookAnalysisSourceCacheService(),
    private readonly chapterService = new DocumentChapterService(),
    private readonly promptRunner: AppearancePromptRunner = runStructuredPrompt,
  ) {}

  async getAppearance(analysisId: string, characterId: string): Promise<BookAnalysisCharacterAppearance | null> {
    await this.assertCharacterExists(analysisId, characterId);
    const row = await prisma.bookAnalysisCharacterAppearance.findUnique({
      where: { characterId },
      include: {
        snapshots: {
          include: { images: { include: { imageAsset: true } } },
          orderBy: [{ chapterIndex: "asc" }],
        },
      },
    });
    return serializeAppearance(row);
  }

  async scanAppearance(
    analysisId: string,
    characterId: string,
    input: BookAnalysisCharacterAppearanceScanInput,
  ): Promise<BookAnalysisCharacterAppearance> {
    const targetPercent = Math.max(0, Math.min(100, Math.round(input.targetPercent)));
    await this.assertAnalysisWritable(analysisId);
    const context = await this.buildContext(analysisId);
    const character = await prisma.bookAnalysisCharacter.findFirst({
      where: { id: characterId, analysisId },
    });
    if (!character) {
      throw new AppError("Book analysis character not found.", 404);
    }

    const profile = normalizeProfile(parseJsonObject(character.profileJson) ?? {}, character.name, character.role);
    const chapters = await this.buildChapterSlices(context);
    const targetCount = Math.min(chapters.length, Math.ceil(chapters.length * targetPercent / 100));
    const appearanceRow = await prisma.bookAnalysisCharacterAppearance.upsert({
      where: { characterId },
      create: {
        characterId,
        coveragePercent: chapters.length === 0 ? 0 : Math.round((await this.countSnapshots(characterId)) / chapters.length * 100),
      },
      update: {},
    });

    const existingSnapshots = await prisma.bookAnalysisCharacterAppearanceSnapshot.findMany({
      where: { characterId },
      orderBy: [{ chapterIndex: "asc" }],
    });
    const existingChapterIndexes = new Set(existingSnapshots.map((snapshot) => snapshot.chapterIndex));
    const chaptersToScan = this.pickChaptersToReachTarget(chapters, existingChapterIndexes, targetCount);
    const budgetGuard = new BookAnalysisBudgetGuard(analysisId);

    for (const chapter of chaptersToScan) {
      const current = await prisma.bookAnalysisCharacterAppearanceSnapshot.findUnique({
        where: {
          characterId_chapterIndex: {
            characterId,
            chapterIndex: chapter.chapterIndex,
          },
        },
      });
      if (current?.manuallyEdited) {
        continue;
      }
      const ragEvidence = await bookAnalysisCharacterRagAdapter.retrieveDimensionEvidence({
        documentId: context.documentId,
        characterName: character.name,
        dimensions: ["appearance"],
        occurringChapters: [chapter.title],
      });
      const result = await this.promptRunner({
        asset: bookAnalysisCharacterAppearanceSnapshotPrompt,
        promptInput: {
          character: {
            name: character.name,
            role: character.role,
            profile: { ...profile },
          },
          chapter,
          notesText: context.notesText,
          ragEvidenceText: ragEvidence.promptBlock,
        },
        options: {
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
          maxTokens: context.maxTokens,
        },
      });
      await budgetGuard.onSectionFinished(result.meta.tokenUsage);
      await prisma.bookAnalysisCharacterAppearanceSnapshot.upsert({
        where: {
          characterId_chapterIndex: {
            characterId,
            chapterIndex: chapter.chapterIndex,
          },
        },
        create: {
          appearanceId: appearanceRow.id,
          characterId,
          chapterIndex: chapter.chapterIndex,
          chapterTitle: chapter.title,
          appearanceJson: JSON.stringify(result.output.appearance ?? {}),
          evidenceJson: JSON.stringify([
            ...(Array.isArray(result.output.evidence) ? result.output.evidence : []),
            ...ragEvidence.evidence,
          ]),
          summaryCaption: result.output.summaryCaption?.trim() || null,
          contextSceneRefsJson: JSON.stringify(result.output.contextSceneRefs ?? []),
        },
        update: {
          chapterTitle: chapter.title,
          appearanceJson: JSON.stringify(result.output.appearance ?? {}),
          evidenceJson: JSON.stringify([
            ...(Array.isArray(result.output.evidence) ? result.output.evidence : []),
            ...ragEvidence.evidence,
          ]),
          summaryCaption: result.output.summaryCaption?.trim() || null,
          contextSceneRefsJson: JSON.stringify(result.output.contextSceneRefs ?? []),
        },
      });
    }

    await this.consolidateAppearance(context, characterId, profile, chapters.length, budgetGuard);
    const row = await this.getAppearance(analysisId, characterId);
    if (!row) {
      throw new AppError("Book analysis character appearance not found after scan.", 500);
    }
    return row;
  }

  private async consolidateAppearance(
    context: AppearanceContext,
    characterId: string,
    profile: CharacterProfile,
    totalChapterCount: number,
    budgetGuard: BookAnalysisBudgetGuard,
  ): Promise<void> {
    const snapshots = await prisma.bookAnalysisCharacterAppearanceSnapshot.findMany({
      where: { characterId },
      orderBy: [{ chapterIndex: "asc" }],
    });
    const character = await prisma.bookAnalysisCharacter.findUnique({
      where: { id: characterId },
    });
    if (!character) {
      throw new AppError("Book analysis character not found.", 404);
    }
    const snapshotsText = snapshots.map((snapshot) => [
      `第 ${snapshot.chapterIndex + 1} 章 ${snapshot.chapterTitle ?? ""}`,
      snapshot.summaryCaption ? `摘要：${snapshot.summaryCaption}` : "",
      snapshot.appearanceJson ? `结构：${snapshot.appearanceJson}` : "",
    ].filter(Boolean).join("\n")).join("\n\n");
    const result = await this.promptRunner({
      asset: bookAnalysisCharacterAppearanceConsolidatePrompt,
      promptInput: {
        character: {
          name: character.name,
          role: character.role,
          profile: { ...profile },
        },
        snapshotsText: snapshotsText || "暂无章节快照。",
      },
      options: {
        provider: context.provider,
        model: context.model,
        temperature: context.temperature,
        maxTokens: context.maxTokens,
      },
    });
    await budgetGuard.onSectionFinished(result.meta.tokenUsage);
    const lastIndexedChapterIndex = snapshots.length > 0
      ? Math.max(...snapshots.map((snapshot) => snapshot.chapterIndex))
      : null;
    await prisma.bookAnalysisCharacterAppearance.update({
      where: { characterId },
      data: {
        coveragePercent: totalChapterCount === 0 ? 0 : Math.min(100, Math.round(snapshots.length / totalChapterCount * 100)),
        consolidatedAppearanceJson: JSON.stringify(result.output.consolidatedAppearance ?? {}),
        variantPolicyJson: JSON.stringify(result.output.variantPolicy ?? {}),
        lastIndexedChapterIndex,
      },
    });
  }

  private async buildContext(analysisId: string): Promise<AppearanceContext> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: { documentVersion: true },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot scan character appearance.", 400);
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
    return {
      documentId: analysis.documentId,
      documentVersionId: analysis.documentVersionId,
      documentContent: analysis.documentVersion.content,
      provider,
      model,
      temperature,
      maxTokens,
      notesText: renderNotesForPrompt(notesResult.notes, "character_system"),
      sourceStartChapterIndex: analysis.sourceStartChapterIndex,
      sourceEndChapterIndex: analysis.sourceEndChapterIndex,
    };
  }

  private async buildChapterSlices(context: AppearanceContext): Promise<ChapterSlice[]> {
    const { chapters } = await this.chapterService.ensureChaptersForVersion(
      context.documentVersionId,
      context.documentId,
    );
    return chapters
      .filter((chapter) =>
        (context.sourceStartChapterIndex == null || chapter.chapterIndex >= context.sourceStartChapterIndex)
        && (context.sourceEndChapterIndex == null || chapter.chapterIndex <= context.sourceEndChapterIndex),
      )
      .map((chapter) => ({
        chapterIndex: chapter.chapterIndex,
        title: chapter.title,
        content: context.documentContent.slice(chapter.startOffset, chapter.endOffset).slice(0, 24_000),
      }));
  }

  private pickChaptersToReachTarget(
    chapters: ChapterSlice[],
    existingChapterIndexes: Set<number>,
    targetCount: number,
  ): ChapterSlice[] {
    if (targetCount <= existingChapterIndexes.size) {
      return [];
    }
    if (targetCount >= chapters.length) {
      return chapters.filter((chapter) => !existingChapterIndexes.has(chapter.chapterIndex));
    }
    const desired = new Set<number>();
    const denominator = Math.max(1, targetCount - 1);
    for (let index = 0; index < targetCount; index += 1) {
      const selected = chapters[Math.round(index * (chapters.length - 1) / denominator)];
      if (selected) {
        desired.add(selected.chapterIndex);
      }
    }
    return chapters.filter((chapter) =>
      desired.has(chapter.chapterIndex) && !existingChapterIndexes.has(chapter.chapterIndex),
    );
  }

  private async countSnapshots(characterId: string): Promise<number> {
    return prisma.bookAnalysisCharacterAppearanceSnapshot.count({ where: { characterId } });
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

export const bookAnalysisCharacterAppearanceService = new BookAnalysisCharacterAppearanceService();

