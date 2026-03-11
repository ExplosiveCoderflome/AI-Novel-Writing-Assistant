import { NovelArtifactService } from "./NovelArtifactService";
import { NovelCoreService } from "./NovelCoreService";

export class NovelGenerationService extends NovelArtifactService {
  createOutlineStream(...args: Parameters<NovelCoreService["createOutlineStream"]>) {
    return this.core.createOutlineStream(...args);
  }

  createStructuredOutlineStream(...args: Parameters<NovelCoreService["createStructuredOutlineStream"]>) {
    return this.core.createStructuredOutlineStream(...args);
  }

  createChapterStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    return this.core.createChapterStream(...args);
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
