import { NovelCoreService } from "./NovelCoreService";
import { NovelGenerationService } from "./NovelGenerationService";

export class NovelReviewService extends NovelGenerationService {
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
