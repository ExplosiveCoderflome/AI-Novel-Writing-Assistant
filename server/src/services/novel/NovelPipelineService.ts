import { NovelCoreService } from "./NovelCoreService";
import { NovelReviewService } from "./NovelReviewService";

export class NovelPipelineService extends NovelReviewService {
  async startPipelineJob(...args: Parameters<NovelCoreService["startPipelineJob"]>) {
    const [novelId, options] = args;
    const existing = await this.core.findActivePipelineJobForRange(
      novelId,
      options.startOrder,
      options.endOrder,
    );
    if (existing) {
      await this.core.resumePipelineJob(existing.id);
      return existing;
    }
    await this.core.createNovelSnapshot(novelId, "before_pipeline", `before-pipeline-${Date.now()}`);
    return this.core.startPipelineJob(...args);
  }

  getPipelineJob(...args: Parameters<NovelCoreService["getPipelineJob"]>) {
    return this.core.getPipelineJob(...args);
  }

  getPipelineJobById(...args: Parameters<NovelCoreService["getPipelineJobById"]>) {
    return this.core.getPipelineJobById(...args);
  }

  findActivePipelineJobForRange(...args: Parameters<NovelCoreService["findActivePipelineJobForRange"]>) {
    return this.core.findActivePipelineJobForRange(...args);
  }

  resumePipelineJob(...args: Parameters<NovelCoreService["resumePipelineJob"]>) {
    return this.core.resumePipelineJob(...args);
  }

  retryPipelineJob(...args: Parameters<NovelCoreService["retryPipelineJob"]>) {
    return this.core.retryPipelineJob(...args);
  }

  cancelPipelineJob(...args: Parameters<NovelCoreService["cancelPipelineJob"]>) {
    return this.core.cancelPipelineJob(...args);
  }
}
