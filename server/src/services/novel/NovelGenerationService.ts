import { NovelArtifactService } from "./NovelArtifactService";
import { NovelCoreService } from "./NovelCoreService";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";

export class NovelGenerationService extends NovelArtifactService {
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  createOutlineStream(...args: Parameters<NovelCoreService["createOutlineStream"]>) {
    return this.core.createOutlineStream(...args);
  }

  async createStructuredOutlineStream(...args: Parameters<NovelCoreService["createStructuredOutlineStream"]>) {
    const [novelId] = args;
    await this.core.createNovelSnapshot(novelId, "manual", `before-structured-outline-${Date.now()}`);
    return this.core.createStructuredOutlineStream(...args);
  }

  createChapterStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    const [novelId, chapterId, options] = args;
    return this.chapterRuntimeCoordinator.createChapterStream(novelId, chapterId, options, {
      includeRuntimePackage: true,
    });
  }

  createChapterRuntimeStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    const [novelId, chapterId, options] = args;
    return this.chapterRuntimeCoordinator.createChapterStream(novelId, chapterId, options, {
      includeRuntimePackage: true,
    });
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
