import { NovelCoreService } from "./NovelCoreService";
import { NovelReviewService } from "./NovelReviewService";

export class NovelPipelineService extends NovelReviewService {
  startPipelineJob(...args: Parameters<NovelCoreService["startPipelineJob"]>) {
    return this.core.startPipelineJob(...args);
  }

  getPipelineJob(...args: Parameters<NovelCoreService["getPipelineJob"]>) {
    return this.core.getPipelineJob(...args);
  }

  getPipelineJobById(...args: Parameters<NovelCoreService["getPipelineJobById"]>) {
    return this.core.getPipelineJobById(...args);
  }

  retryPipelineJob(...args: Parameters<NovelCoreService["retryPipelineJob"]>) {
    return this.core.retryPipelineJob(...args);
  }

  cancelPipelineJob(...args: Parameters<NovelCoreService["cancelPipelineJob"]>) {
    return this.core.cancelPipelineJob(...args);
  }
}
