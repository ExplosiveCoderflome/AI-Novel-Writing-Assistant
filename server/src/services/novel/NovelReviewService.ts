import { NovelCoreService } from "./NovelCoreService";

/**
 * @deprecated Use `createNovelApplicationServices()` and inject only the review
 * capability required by the caller.
 */
export class NovelReviewService {
  protected readonly core = new NovelCoreService();

  reviewChapter(...args: Parameters<NovelCoreService["reviewChapter"]>) {
    return this.core.reviewChapter(...args);
  }

  createRepairStream(...args: Parameters<NovelCoreService["createRepairStream"]>) {
    return this.core.createRepairStream(...args);
  }

  getQualityReport(...args: Parameters<NovelCoreService["getQualityReport"]>) {
    return this.core.getQualityReport(...args);
  }
}
