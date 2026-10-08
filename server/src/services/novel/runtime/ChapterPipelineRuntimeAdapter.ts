import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import {
  runPipelineChapterWithRuntime,
  resumeFinalizedPipelineChapter,
  type PipelineRuntimeHooks,
  type PipelineRuntimeInput,
  type PipelineRuntimeResult,
} from "./chapterRuntimePipeline";
import {
  isChapterEmptyContentError,
} from "./chapterEmptyContentError";
import type { ChapterContentFinalizationService } from "./ChapterContentFinalizationService";
import type { ChapterStreamGenerationOrchestrator } from "./ChapterStreamGenerationOrchestrator";
import type { ChapterLifecycleService } from "./lifecycle";
import { chapterGenerationFeed } from "../production/observation";
import { ChapterPipelineFinalizationStore, ChapterArtifactSyncBoundaryError } from "./artifactSync";

export interface ChapterPipelineRuntimeAdapterDeps {
  finalizationStore?: Pick<ChapterPipelineFinalizationStore, "load" | "save">;
  streamOrchestrator: Pick<
    ChapterStreamGenerationOrchestrator,
    "prepareRuntimeChapter" | "generateDraftFromWriter" | "markChapterStatus"
  >;
  artifactSyncService: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts" | "syncChapterArtifacts">;
  contentFinalizationService: Pick<
    ChapterContentFinalizationService,
    "finalizeChapterContent" | "commitFinalizedChapterContent"
  >;
  lifecycleService: Pick<ChapterLifecycleService, "markGenerationState">;
  ensureNovelCharacters: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
}

export class ChapterPipelineRuntimeAdapter {
  private readonly deps: ChapterPipelineRuntimeAdapterDeps;
  private readonly finalizationStore: Pick<ChapterPipelineFinalizationStore, "load" | "save">;

  constructor(deps: ChapterPipelineRuntimeAdapterDeps) {
    this.deps = deps;
    this.finalizationStore = deps.finalizationStore ?? new ChapterPipelineFinalizationStore();
  }

  async runPipelineChapter(
    novelId: string,
    chapterId: string,
    options: PipelineRuntimeInput = {},
    hooks: PipelineRuntimeHooks = {},
  ): Promise<PipelineRuntimeResult> {
    const scope = options.finalizedResultScope;
    if (options.artifactSyncPolicy === "director_v2") {
      if (!scope) throw new ChapterArtifactSyncBoundaryError({status: "failed", contentHash: "", completedArtifacts: [], reason: "缺少本次创作的资源回填恢复位置。"});
      await hooks.onCheckCancelled?.();
      const saved = await this.finalizationStore.load(novelId, chapterId, scope);
      if (saved) return resumeFinalizedPipelineChapter({
        syncFinalChapterArtifacts: (n, c, content, syncOptions) => this.deps.artifactSyncService.syncChapterArtifacts(n, c, content, {
          ...syncOptions, scheduleBackgroundSync: true, awaitArtifactDelta: true, skipLegacySummaryAndFacts: true,
          provider: options.provider, model: options.model, temperature: options.temperature,
        }),
        markChapterGenerationState: (c, state) => this.markChapterGenerationState(c, state),
      }, novelId, chapterId, saved, options, hooks);
    }
    const { request, assembled } = await this.deps.streamOrchestrator.prepareRuntimeChapter(novelId, chapterId, options);
    await this.deps.streamOrchestrator.markChapterStatus(chapterId, "generating");
    let preview: ReturnType<typeof chapterGenerationFeed.begin> | undefined;
    try {
      const result = await runPipelineChapterWithRuntime(
        {
          persistFinalizedChapterResult: options.artifactSyncPolicy === "director_v2"
            ? (n, c, content, result) => this.finalizationStore.save(n, c, scope!, content, result)
            : undefined,
          validateRequest: () => request,
          ensureNovelCharacters: this.deps.ensureNovelCharacters,
          assemble: async () => assembled,
          generateDraftFromWriter: async (input) => {
            preview = chapterGenerationFeed.begin({novelId, chapterId,
              chapterOrder: assembled.chapter.order, chapterTitle: assembled.chapter.title});
            const generated = await this.deps.streamOrchestrator.generateDraftFromWriter({...input,
              onDraftProgress: (content, state) => chapterGenerationFeed.update(preview!, state, content)});
            chapterGenerationFeed.update(preview, "checking", generated.content);
            return generated;
          },
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
                contentProvenance: syncOptions?.contentProvenance,
                artifactSyncPolicy: syncOptions?.artifactSyncPolicy,
                awaitArtifactDelta: true,
                skipLegacySummaryAndFacts: true,
                provider: request.provider,
                model: request.model,
                temperature: request.temperature,
              },
            ),
          finalizeChapterContent: async (input) => {
            const finalized = await this.deps.contentFinalizationService.finalizeChapterContent({
              ...input,
              deferArtifactBackgroundSync: true,
              scheduleDeferredArtifactBackgroundSync: false,
              deferTerminalCommit: true,
              assertExecutionOwnership: hooks.onCheckCancelled,
            });
            return {
              finalContent: finalized.finalContent,
              runtimePackage: finalized.runtimePackage,
              needsRepair: finalized.needsRepair,
              acceptanceResult: finalized.acceptanceResult,
              acceptancePersistenceDeferred: finalized.acceptancePersistenceDeferred,
            };
          },
          commitFinalizedChapterContent: async (input) => {
            await this.deps.contentFinalizationService.commitFinalizedChapterContent({
              novelId: input.novelId,
              chapterId: input.chapterId,
              request: input.request,
              contextPackage: input.contextPackage,
              runId: null,
              startMs: null,
              deferArtifactBackgroundSync: true,
              scheduleDeferredArtifactBackgroundSync: false,
              evaluation: {
                ...input.evaluation,
              },
              assertExecutionOwnership: hooks.onCheckCancelled,
            });
            if (preview) chapterGenerationFeed.update(preview, "saved", input.evaluation.finalContent);
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
      // The no-review path saves its draft without a terminal evaluation commit.
      if (preview && chapterGenerationFeed.read(novelId)?.state !== "saved") chapterGenerationFeed.update(preview, "saved");
      return result;
    } catch (error) {
      if (preview) chapterGenerationFeed.update(preview, "interrupted");
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
    await this.deps.lifecycleService.markGenerationState(chapterId, generationState);
  }
}
