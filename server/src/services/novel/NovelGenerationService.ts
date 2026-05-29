import { NovelCoreService } from "./NovelCoreService";
import {
  buildManualChapterControlPolicy,
  registerChapterExecutionStageRunner,
} from "./production/ChapterExecutionStageRunner";
import { novelProductionOrchestrator } from "./production/NovelProductionOrchestrator";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";

/**
 * @deprecated Use `createNovelApplicationServices()` and inject only the
 * generation capability required by the caller.
 */
export class NovelGenerationService {
  protected readonly core = new NovelCoreService();
  protected readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  constructor() {
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
  }

  listStorylineVersions(...args: Parameters<NovelCoreService["listStorylineVersions"]>) {
    return this.core.listStorylineVersions(...args);
  }

  createStorylineDraft(...args: Parameters<NovelCoreService["createStorylineDraft"]>) {
    return this.core.createStorylineDraft(...args);
  }

  activateStorylineVersion(...args: Parameters<NovelCoreService["activateStorylineVersion"]>) {
    return this.core.activateStorylineVersion(...args);
  }

  freezeStorylineVersion(...args: Parameters<NovelCoreService["freezeStorylineVersion"]>) {
    return this.core.freezeStorylineVersion(...args);
  }

  getStorylineDiff(...args: Parameters<NovelCoreService["getStorylineDiff"]>) {
    return this.core.getStorylineDiff(...args);
  }

  analyzeStorylineImpact(...args: Parameters<NovelCoreService["analyzeStorylineImpact"]>) {
    return this.core.analyzeStorylineImpact(...args);
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
