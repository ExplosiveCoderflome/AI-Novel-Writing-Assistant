import { NovelCoreService } from "./NovelCoreService";
import { NovelReviewService } from "./NovelReviewService";
import { buildPipelineExecutionControlPolicy } from "./production/ChapterExecutionStageRunner";
import { novelProductionOrchestrator } from "./production/NovelProductionOrchestrator";

export class NovelPipelineService extends NovelReviewService {
  async startPipelineJob(...args: Parameters<NovelCoreService["startPipelineJob"]>) {
    const [novelId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_execution",
      policy: options.controlPolicy ?? buildPipelineExecutionControlPolicy(),
      trigger: "start_pipeline_job",
      payload: {
        mode: "pipeline_job",
        options,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter execution did not return a pipeline job payload.");
    }
    return result.payload as Awaited<ReturnType<NovelCoreService["startPipelineJob"]>>;
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
