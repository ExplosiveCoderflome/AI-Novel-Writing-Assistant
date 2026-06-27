import { randomUUID } from "node:crypto";
import type {
  BookAnalysisCharacterAppearance,
  BookAnalysisCharacterAppearanceScanInput,
  BookAnalysisCharacterAppearanceScanJob,
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
import { runWithConcurrency } from "../infrastructure/bookAnalysis.concurrent";
import {
  getBookAnalysisAppearanceChapterConcurrency,
  getBookAnalysisAppearanceScanConcurrency,
} from "../shared/bookAnalysis.config";
import type { SourceNote } from "../shared/bookAnalysis.types";
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

type AppearancePromptRunner = typeof runStructuredPrompt;

interface AppearanceContext {
  documentId: string;
  documentVersionId: string;
  documentContent: string;
  provider: LLMProvider;
  model?: string;
  temperature: number;
  maxTokens?: number;
  notes: SourceNote[];
  sourceStartChapterIndex?: number | null;
  sourceEndChapterIndex?: number | null;
}

interface ChapterSlice {
  chapterIndex: number;
  title: string;
  content: string;
}

type AppearanceScanJobRow = Omit<BookAnalysisCharacterAppearanceScanJob, "createdAt" | "startedAt" | "finishedAt" | "updatedAt"> & {
  createdAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  updatedAt: Date;
};

function serializeScanJob(job: AppearanceScanJobRow): BookAnalysisCharacterAppearanceScanJob {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : "Unknown appearance scan error.";
}

export class BookAnalysisCharacterAppearanceService {
  private readonly scanJobs = new Map<string, AppearanceScanJobRow>();
  private readonly scanQueue: string[] = [];
  private readonly activeScanKeys = new Set<string>();
  private activeScanCount = 0;

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

  async enqueueAppearanceScan(
    analysisId: string,
    characterId: string,
    input: BookAnalysisCharacterAppearanceScanInput,
  ): Promise<BookAnalysisCharacterAppearanceScanJob> {
    const targetPercent = Math.max(0, Math.min(100, Math.round(input.targetPercent)));
    await this.assertAnalysisWritable(analysisId);
    await this.assertCharacterExists(analysisId, characterId);
    const activeJob = this.findActiveScanJob(analysisId, characterId);
    if (activeJob) {
      return serializeScanJob(activeJob);
    }

    const now = new Date();
    const job: AppearanceScanJobRow = {
      jobId: randomUUID(),
      analysisId,
      characterId,
      targetPercent,
      status: "queued",
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    };
    this.scanJobs.set(job.jobId, job);
    this.scanQueue.push(job.jobId);
    this.scheduleScanJobs();
    return serializeScanJob(job);
  }

  getAppearanceScanJob(jobId: string): BookAnalysisCharacterAppearanceScanJob | null {
    const job = this.scanJobs.get(jobId);
    return job ? serializeScanJob(job) : null;
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

    const characterNotesText = this.pickCharacterNotesText(context.notes, character.name);

    await runWithConcurrency(chaptersToScan, getBookAnalysisAppearanceChapterConcurrency(), async (chapter) => {
      const current = await prisma.bookAnalysisCharacterAppearanceSnapshot.findUnique({
        where: {
          characterId_chapterIndex: {
            characterId,
            chapterIndex: chapter.chapterIndex,
          },
        },
      });
      if (current?.manuallyEdited) {
        return;
      }
      const result = await this.promptRunner({
        asset: bookAnalysisCharacterAppearanceSnapshotPrompt,
        promptInput: {
          character: {
            name: character.name,
            role: character.role,
            profile: { ...profile },
          },
          chapter,
          notesText: characterNotesText,
        },
        options: {
          provider: context.provider,
          model: context.model,
          temperature: context.temperature,
          maxTokens: context.maxTokens,
        },
      });
      await budgetGuard.onSectionFinished(result.meta.tokenUsage);
      const snapshotEvidence = this.normalizeSnapshotEvidence(result.output.evidence, chapter.chapterIndex);
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
          evidenceJson: JSON.stringify(snapshotEvidence),
          summaryCaption: result.output.summaryCaption?.trim() || null,
          contextSceneRefsJson: JSON.stringify(result.output.contextSceneRefs ?? []),
        },
        update: {
          chapterTitle: chapter.title,
          appearanceJson: JSON.stringify(result.output.appearance ?? {}),
          evidenceJson: JSON.stringify(snapshotEvidence),
          summaryCaption: result.output.summaryCaption?.trim() || null,
          contextSceneRefsJson: JSON.stringify(result.output.contextSceneRefs ?? []),
        },
      });
    });

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

  private pickCharacterNotesText(notes: SourceNote[], characterName: string): string {
    const trimmedName = characterName.trim();
    if (!trimmedName) {
      return "";
    }
    const relevant = notes.filter((note) =>
      Array.isArray(note.characters)
      && note.characters.some((item) => typeof item === "string" && item.includes(trimmedName)),
    );
    if (relevant.length === 0) {
      return "";
    }
    return renderNotesForPrompt(relevant, "character_system");
  }

  private normalizeSnapshotEvidence(value: unknown, chapterIndex: number): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => {
        const { sourceType: _sourceType, chunkId: _chunkId, noteSegmentId: _noteSegmentId, dimension: _dimension, ...rest } = item;
        return {
          ...rest,
          chapterIndex: typeof rest.chapterIndex === "number" ? rest.chapterIndex : chapterIndex,
        };
      });
  }

  private findActiveScanJob(analysisId: string, characterId: string): AppearanceScanJobRow | null {
    for (const job of this.scanJobs.values()) {
      if (
        job.analysisId === analysisId
        && job.characterId === characterId
        && (job.status === "queued" || job.status === "running")
      ) {
        return job;
      }
    }
    return null;
  }

  private scheduleScanJobs(): void {
    while (this.activeScanCount < getBookAnalysisAppearanceScanConcurrency()) {
      const jobId = this.scanQueue.shift();
      if (!jobId) {
        return;
      }
      const job = this.scanJobs.get(jobId);
      if (!job || job.status !== "queued") {
        continue;
      }
      const scanKey = `${job.analysisId}:${job.characterId}`;
      if (this.activeScanKeys.has(scanKey)) {
        this.scanQueue.push(jobId);
        return;
      }
      this.activeScanCount += 1;
      this.activeScanKeys.add(scanKey);
      void this.runScanJob(job, scanKey).finally(() => {
        this.activeScanCount = Math.max(0, this.activeScanCount - 1);
        this.activeScanKeys.delete(scanKey);
        this.scheduleScanJobs();
      });
    }
  }

  private async runScanJob(job: AppearanceScanJobRow, scanKey: string): Promise<void> {
    const startedAt = new Date();
    Object.assign(job, {
      status: "running" as const,
      startedAt,
      updatedAt: startedAt,
      error: null,
    });
    try {
      await this.scanAppearance(job.analysisId, job.characterId, { targetPercent: job.targetPercent });
      const finishedAt = new Date();
      Object.assign(job, {
        status: "succeeded" as const,
        finishedAt,
        updatedAt: finishedAt,
        error: null,
      });
    } catch (error) {
      const finishedAt = new Date();
      Object.assign(job, {
        status: "failed" as const,
        finishedAt,
        updatedAt: finishedAt,
        error: normalizeErrorMessage(error),
      });
      console.error("[book-analysis.character.appearance] scan job failed", {
        jobId: job.jobId,
        scanKey,
        error,
      });
    }
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
      notes: notesResult.notes,
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

