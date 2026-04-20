import { NovelArtifactService } from "./NovelArtifactService";
import { NovelCoreService } from "./NovelCoreService";
import {
  buildManualChapterControlPolicy,
  registerChapterExecutionStageRunner,
} from "./production/ChapterExecutionStageRunner";
import { novelProductionOrchestrator } from "./production/NovelProductionOrchestrator";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";

export class NovelGenerationService extends NovelArtifactService {
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  constructor() {
    super();
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
  }

  createOutlineStream(...args: Parameters<NovelCoreService["createOutlineStream"]>) {
    return this.core.createOutlineStream(...args);
  }

  async createStructuredOutlineStream(...args: Parameters<NovelCoreService["createStructuredOutlineStream"]>) {
    const [novelId] = args;
    await this.core.createNovelSnapshot(novelId, "manual", `before-structured-outline-${Date.now()}`);
    return this.core.createStructuredOutlineStream(...args);
  }

  async createChapterStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_execution",
      policy: buildManualChapterControlPolicy(),
      trigger: "manual_generate_chapter",
      payload: {
        mode: "single_chapter_stream",
        chapterId,
        options,
        includeRuntimePackage: true,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter execution did not return a stream payload.");
    }
    return result.payload as Awaited<ReturnType<ChapterRuntimeCoordinator["createChapterStream"]>>;
  }

  createChapterRuntimeStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    return this.createChapterStream(...args);
  }

  generateTitles(...args: Parameters<NovelCoreService["generateTitles"]>) {
    return this.core.generateTitles(...args);
  }

  createBibleStream(...args: Parameters<NovelCoreService["createBibleStream"]>) {
    return this.core.createBibleStream(...args);
  }

  createBeatStream(...args: Parameters<NovelCoreService["createBeatStream"]>) {
    return this.core.createBeatStream(...args);
  }

  generateChapterHook(...args: Parameters<NovelCoreService["generateChapterHook"]>) {
    return this.core.generateChapterHook(...args);
  }
}
