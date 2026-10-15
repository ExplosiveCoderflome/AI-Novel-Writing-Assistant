import { serializeCommercialTagsJson } from "@ai-novel/shared/types/novelFraming";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { NovelWorkflowService } from "./workflow/NovelWorkflowService";
import { NovelContinuationService } from "./NovelContinuationService";
import { NovelVolumeService } from "./volume/NovelVolumeService";
import { STORY_WORLD_SLICE_SCHEMA_VERSION } from "./storyWorldSlice/storyWorldSlicePersistence";
import { ManualChapterService } from "./chapterEditor";
import { listNovels } from "./catalog";
import {
  ChapterInput,
  CreateNovelInput,
  normalizeNovelOutput,
  normalizeOptionalTextForCreate,
  normalizeOptionalTextForUpdate,
  PaginationInput,
  parseContinuationBookAnalysisSections,
  serializeContinuationBookAnalysisSections,
  UpdateNovelInput,
} from "./novelCoreShared";
import { queueRagDelete, queueRagUpsert } from "./novelCoreSupport";
import { novelEventBus } from "../../events/publisher";

export class NovelCoreCrudService {
  private readonly novelContinuationService = new NovelContinuationService();
  private readonly workflowService = new NovelWorkflowService();
  private readonly volumeService = new NovelVolumeService();
  private readonly manualChapters = new ManualChapterService(this.volumeService);

  private validateStoryModeSelection(primaryStoryModeId?: string | null, secondaryStoryModeId?: string | null): void {
    if (primaryStoryModeId && secondaryStoryModeId && primaryStoryModeId === secondaryStoryModeId) {
      throw new AppError("主流派模式和副流派模式不能选择同一项。", 400);
    }
  }

  private async validateReferenceBookAnalysis(analysisId: string | null | undefined): Promise<void> {
    if (!analysisId) {
      return;
    }
    const analysis = await prisma.bookAnalysis.findFirst({
      where: { id: analysisId, status: "succeeded" },
      select: { id: true },
    });
    if (!analysis) {
      throw new AppError("参考拆书不存在或尚未完成。", 400);
    }
  }

  listNovels(input: PaginationInput) {
    return listNovels(input);
  }

  async createNovel(input: CreateNovelInput) {
    const writingMode = input.writingMode ?? "original";
    const sourceNovelId = input.sourceNovelId ?? null;
    const sourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId ?? null;
    const continuationBookAnalysisId = input.continuationBookAnalysisId ?? null;
    const normalizedContinuationBookAnalysisId =
      writingMode === "continuation" && (sourceNovelId || sourceKnowledgeDocumentId) ? continuationBookAnalysisId : null;
    const continuationBookAnalysisSections = serializeContinuationBookAnalysisSections(
      input.continuationBookAnalysisSections,
    );
    const referenceBookAnalysisId = writingMode === "original" ? (input.referenceBookAnalysisId ?? null) : null;
    const referenceBookAnalysisSections = serializeContinuationBookAnalysisSections(
      input.referenceBookAnalysisSections,
    );
    const commercialTagsJson = serializeCommercialTagsJson(input.commercialTags);
    this.validateStoryModeSelection(input.primaryStoryModeId, input.secondaryStoryModeId);

    await this.novelContinuationService.validateWritingModeConfig({
      writingMode,
      sourceNovelId,
      sourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
    });
    await this.validateReferenceBookAnalysis(referenceBookAnalysisId);

    const created = await prisma.novel.create({
      data: {
        id: input.id,
        title: input.title,
        directorVersion: input.directorVersion,
        description: input.description,
        targetAudience: normalizeOptionalTextForCreate(input.targetAudience),
        bookSellingPoint: normalizeOptionalTextForCreate(input.bookSellingPoint),
        competingFeel: normalizeOptionalTextForCreate(input.competingFeel),
        first30ChapterPromise: normalizeOptionalTextForCreate(input.first30ChapterPromise),
        commercialTagsJson,
        genreId: input.genreId,
        primaryStoryModeId: input.primaryStoryModeId ?? null,
        secondaryStoryModeId: input.secondaryStoryModeId ?? null,
        worldId: input.worldId,
        writingMode,
        projectMode: input.projectMode,
        creationExperience: input.creationExperience ?? "professional",
        narrativeForm: input.narrativeForm ?? "long_novel",
        targetWordCount: input.targetWordCount,
        derivedFromNovelId: input.derivedFromNovelId,
        narrativePov: input.narrativePov,
        pacePreference: input.pacePreference,
        styleTone: input.styleTone,
        emotionIntensity: input.emotionIntensity,
        aiFreedom: input.aiFreedom,
        postGenerationStyleReviewEnabled: input.postGenerationStyleReviewEnabled,
        defaultChapterLength: input.defaultChapterLength,
        estimatedChapterCount: input.estimatedChapterCount,
        projectStatus: input.projectStatus,
        storylineStatus: input.storylineStatus,
        outlineStatus: input.outlineStatus,
        resourceReadyScore: input.resourceReadyScore,
        sourceNovelId: writingMode === "continuation" ? sourceNovelId : null,
        sourceKnowledgeDocumentId: writingMode === "continuation" ? sourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
        continuationBookAnalysisSections:
          writingMode === "continuation"
          && (sourceNovelId || sourceKnowledgeDocumentId)
          && normalizedContinuationBookAnalysisId
            ? continuationBookAnalysisSections
            : null,
        referenceBookAnalysisId,
        referenceBookAnalysisSections: referenceBookAnalysisId ? referenceBookAnalysisSections : null,
        creativeCarryoverContractJson: input.creativeCarryoverContractJson ?? null,
        creativeCarryoverContractSchemaVersion: input.creativeCarryoverContractSchemaVersion ?? null,
      },
    });

    queueRagUpsert("novel", created.id);
    if (created.worldId) {
      queueRagUpsert("world", created.worldId);
    }
    return normalizeNovelOutput(created);
  }

  async getNovelById(id: string) {
    const row = await prisma.novel.findUnique({
      where: { id },
      include: {
        genre: true,
        primaryStoryMode: true,
        secondaryStoryMode: true,
        world: true,
        bible: true,
        bookContract: true,
        chapters: { orderBy: { order: "asc" }, include: { chapterSummary: true } },
        characters: { orderBy: { createdAt: "asc" } },
        plotBeats: { orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!row) {
      return null;
    }
    return normalizeNovelOutput(row);
  }

  async updateNovel(id: string, input: UpdateNovelInput) {
    const existing = await prisma.novel.findUnique({
      where: { id },
      select: {
        id: true,
        worldId: true,
        writingMode: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
        referenceBookAnalysisId: true,
        referenceBookAnalysisSections: true,
        primaryStoryModeId: true,
        secondaryStoryModeId: true,
      },
    });
    if (!existing) {
      throw new Error("小说不存在");
    }

    const nextWritingMode = input.writingMode ?? (existing.writingMode === "continuation" ? "continuation" : "original");
    const nextSourceNovelId = input.sourceNovelId !== undefined ? input.sourceNovelId : existing.sourceNovelId;
    const nextSourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId !== undefined
      ? input.sourceKnowledgeDocumentId
      : existing.sourceKnowledgeDocumentId;
    const nextContinuationBookAnalysisId = input.continuationBookAnalysisId !== undefined
      ? input.continuationBookAnalysisId
      : existing.continuationBookAnalysisId;
    const nextContinuationBookAnalysisSections = input.continuationBookAnalysisSections !== undefined
      ? input.continuationBookAnalysisSections
      : parseContinuationBookAnalysisSections(existing.continuationBookAnalysisSections);
    const nextReferenceBookAnalysisId = input.referenceBookAnalysisId !== undefined
      ? input.referenceBookAnalysisId
      : existing.referenceBookAnalysisId;
    const nextReferenceBookAnalysisSections = input.referenceBookAnalysisSections !== undefined
      ? input.referenceBookAnalysisSections
      : parseContinuationBookAnalysisSections(existing.referenceBookAnalysisSections);
    const nextPrimaryStoryModeId = input.primaryStoryModeId !== undefined
      ? input.primaryStoryModeId
      : existing.primaryStoryModeId;
    const nextSecondaryStoryModeId = input.secondaryStoryModeId !== undefined
      ? input.secondaryStoryModeId
      : existing.secondaryStoryModeId;
    const normalizedNextContinuationBookAnalysisId =
      nextWritingMode === "continuation" && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
        ? nextContinuationBookAnalysisId
        : null;
    const normalizedNextReferenceBookAnalysisId = nextWritingMode === "original"
      ? nextReferenceBookAnalysisId
      : null;
    this.validateStoryModeSelection(nextPrimaryStoryModeId, nextSecondaryStoryModeId);

    await this.novelContinuationService.validateWritingModeConfig({
      novelId: id,
      writingMode: nextWritingMode,
      sourceNovelId: nextSourceNovelId,
      sourceKnowledgeDocumentId: nextSourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
    });
    await this.validateReferenceBookAnalysis(normalizedNextReferenceBookAnalysisId);

    const {
      continuationBookAnalysisSections: _ignoreSectionPatch,
      referenceBookAnalysisSections: _ignoreReferenceSectionPatch,
      targetAudience: _ignoreTargetAudience,
      bookSellingPoint: _ignoreBookSellingPoint,
      competingFeel: _ignoreCompetingFeel,
      first30ChapterPromise: _ignoreFirst30ChapterPromise,
      commercialTags: _ignoreCommercialTags,
      ...restInput
    } = input;

    const serializedContinuationSections = serializeContinuationBookAnalysisSections(nextContinuationBookAnalysisSections);
    const serializedReferenceSections = serializeContinuationBookAnalysisSections(nextReferenceBookAnalysisSections);
    const commercialTagsJson = input.commercialTags !== undefined
      ? serializeCommercialTagsJson(input.commercialTags)
      : undefined;
    const nextWorldId = input.worldId !== undefined ? input.worldId : existing.worldId;
    const shouldResetWorldSlice = nextWorldId !== existing.worldId;

    const updated = await prisma.novel.update({
      where: { id },
      data: {
        ...restInput,
        sourceNovelId: nextWritingMode === "continuation" ? nextSourceNovelId : null,
        sourceKnowledgeDocumentId: nextWritingMode === "continuation" ? nextSourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
        primaryStoryModeId: nextPrimaryStoryModeId ?? null,
        secondaryStoryModeId: nextSecondaryStoryModeId ?? null,
        targetAudience: normalizeOptionalTextForUpdate(input.targetAudience),
        bookSellingPoint: normalizeOptionalTextForUpdate(input.bookSellingPoint),
        competingFeel: normalizeOptionalTextForUpdate(input.competingFeel),
        first30ChapterPromise: normalizeOptionalTextForUpdate(input.first30ChapterPromise),
        commercialTagsJson,
        continuationBookAnalysisSections:
          nextWritingMode === "continuation"
          && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
          && normalizedNextContinuationBookAnalysisId
            ? serializedContinuationSections
            : null,
        referenceBookAnalysisId: normalizedNextReferenceBookAnalysisId,
        referenceBookAnalysisSections: normalizedNextReferenceBookAnalysisId ? serializedReferenceSections : null,
        ...(shouldResetWorldSlice
          ? {
            storyWorldSliceJson: null,
            storyWorldSliceOverridesJson: null,
            storyWorldSliceSchemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
          }
          : {}),
      },
      include: {
        primaryStoryMode: true,
        secondaryStoryMode: true,
      },
    });

    queueRagUpsert("novel", id);
    if (updated.worldId) {
      queueRagUpsert("world", updated.worldId);
    }
    void novelEventBus.emit({
      type: "novel:updated",
      payload: { novelId: id, fields: Object.keys(input) },
    }).catch(() => {});
    return normalizeNovelOutput(updated);
  }

  async deleteNovel(id: string) {
    await prisma.$transaction(async (transaction) => {
      const [failedWorkflowTasks, failedAgentRuns, failedPipelineJobs, failedImageTasks] = await Promise.all([
        transaction.novelWorkflowTask.findMany({
          where: { novelId: id, status: "failed" },
          select: { id: true },
        }),
        transaction.agentRun.findMany({
          where: { novelId: id, status: "failed" },
          select: { id: true },
        }),
        transaction.generationJob.findMany({
          where: { novelId: id, status: "failed" },
          select: { id: true },
        }),
        transaction.imageGenerationTask.findMany({
          where: { novelId: id, status: "failed" },
          select: { id: true },
        }),
      ]);
      const failedWorkflowTaskIds = failedWorkflowTasks.map((task) => task.id);
      const failedAgentRunIds = failedAgentRuns.map((task) => task.id);
      const failedPipelineJobIds = failedPipelineJobs.map((task) => task.id);
      const failedImageTaskIds = failedImageTasks.map((task) => task.id);

      if (
        failedWorkflowTaskIds.length > 0
        || failedAgentRunIds.length > 0
        || failedPipelineJobIds.length > 0
        || failedImageTaskIds.length > 0
      ) {
        await transaction.taskCenterArchive.deleteMany({
          where: {
            OR: [
              { taskKind: "novel_workflow", taskId: { in: failedWorkflowTaskIds } },
              { taskKind: "agent_run", taskId: { in: failedAgentRunIds } },
              { taskKind: "novel_pipeline", taskId: { in: failedPipelineJobIds } },
              { taskKind: "image_generation", taskId: { in: failedImageTaskIds } },
            ],
          },
        });
      }
      if (failedWorkflowTaskIds.length > 0) {
        await transaction.novelWorkflowTask.deleteMany({
          where: { id: { in: failedWorkflowTaskIds } },
        });
      }
      if (failedAgentRunIds.length > 0) {
        await transaction.agentRun.deleteMany({
          where: { id: { in: failedAgentRunIds } },
        });
      }

      await transaction.novel.delete({ where: { id } });
    });
    queueRagDelete("novel", id);
    queueRagDelete("bible", id);
  }

  async listChapters(novelId: string) {
    return prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      include: { chapterSummary: true },
    });
  }

  createChapter(novelId: string, input: ChapterInput) {
    return this.manualChapters.createChapter(novelId, input);
  }

  updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    return this.manualChapters.updateChapter(novelId, chapterId, input);
  }

  deleteChapter(novelId: string, chapterId: string) {
    return this.manualChapters.deleteChapter(novelId, chapterId);
  }
}
