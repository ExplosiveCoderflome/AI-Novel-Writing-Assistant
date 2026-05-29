import { NovelCoreService } from "./NovelCoreService";

/**
 * @deprecated Use `createNovelApplicationServices()` and inject the storyline
 * capability instead of extending this compatibility wrapper.
 */
export class NovelArtifactService {
  protected readonly core = new NovelCoreService();

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
}
