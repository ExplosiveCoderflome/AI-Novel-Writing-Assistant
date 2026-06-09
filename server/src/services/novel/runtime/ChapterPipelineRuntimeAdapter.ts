import { prisma } from "../../../db/prisma";
import { mergeChapterPatchForGenerationStateBump } from "../chapterLifecycleState";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import {
  runPipelineChapterWithRuntime,
  type PipelineRuntimeHooks,
  type PipelineRuntimeInput,
  type PipelineRuntimeResult,
} from "./chapterRuntimePipeline";
import {
  isChapterEmptyContentError,
} from "./chapterEmptyContentError";
import type { ChapterContentFinalizationService } from "./ChapterContentFinalizationService";
import type { ChapterStreamGenerationOrchestrator } from "./ChapterStreamGenerationOrchestrator";

export interface ChapterPipelineRuntimeAdapterDeps {
  streamOrchestrator: Pick<
    ChapterStreamGenerationOrchestrator,
    "prepareRuntimeChapter" | "generateDraftFromWriter" | "markChapterStatus"
  >;
  artifactSyncService: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts" | "syncChapterArtifacts">;
  contentFinalizationService: Pick<ChapterContentFinalizationService, "finalizeChapterContent">;
  ensureNovelCharacters: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
}

export class ChapterPipelineRuntimeAdapter {
  private readonly deps: ChapterPipelineRuntimeAdapterDeps;

  constructor(deps: ChapterPipelineRuntimeAdapterDeps) {
    this.deps = deps;
  }

  async runPipelineChapter(
    novelId: string,
    chapterId: string,
    options: PipelineRuntimeInput = {},
    hooks: PipelineRuntimeHooks = {},
  ): Promise<PipelineRuntimeResult> {
    const { request, assembled } = await this.deps.streamOrchestrator.prepareRuntimeChapter(novelId, chapterId, options);
    await this.deps.streamOrchestrator.markChapterStatus(chapterId, "generating");
    try {
      return await runPipelineChapterWithRuntime(
        {
          validateRequest: () => request,
          ensureNovelCharacters: this.deps.ensureNovelCharacters,
          assemble: async () => assembled,
          generateDraftFromWriter: (input) => this.deps.streamOrchestrator.generateDraftFromWriter(input),
          saveDraftAndArtifacts: (targetNovelId, targetChapterId, content, generationState, saveOptions) =>
            this.deps.artifactSyncService.saveDraftAndArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              generationState,
              saveOptions,
            ),
          syncFinalChapterArtifacts: (targetNovelId, targetChapterId, content, syncOptions) =>
            this.deps.artifactSyncService.syncChapterArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              {
                scheduleBackgroundSync: true,
                artifactSyncMode: syncOptions?.artifactSyncMode ?? options.artifactSyncMode,
              },
            ),
          finalizeChapterContent: async (input) => {
            const finalized = await this.deps.contentFinalizationService.finalizeChapterContent({
              ...input,
              deferArtifactBackgroundSync: true,
              scheduleDeferredArtifactBackgroundSync: false,
            });
            return {
              finalContent: finalized.finalContent,
              runtimePackage: finalized.runtimePackage,
            };
          },
          markChapterGenerationState: (targetChapterId, generationState) =>
            this.markChapterGenerationState(targetChapterId, generationState),
          markChapterNeedsRepair: (targetChapterId) =>
            this.deps.streamOrchestrator.markChapterStatus(targetChapterId, "needs_repair"),
        },
        novelId,
        chapterId,
        options,
        hooks,
      );
    } catch (error) {
      if (isChapterEmptyContentError(error)) {
        await this.deps.streamOrchestrator.markChapterStatus(chapterId, "pending_generation");
      }
      throw error;
    }
  }

  private async markChapterGenerationState(
    chapterId: string,
    generationState: "reviewed" | "approved",
  ): Promise<void> {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: mergeChapterPatchForGenerationStateBump({}, generationState),
    });
  }
}
