import { NovelCoreService } from "./NovelCoreService";
import {
  buildPipelineExecutionControlPolicy,
  registerChapterExecutionStageRunner,
} from "./production/ChapterExecutionStageRunner";
import { novelProductionOrchestrator } from "./production/NovelProductionOrchestrator";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";

/**
 * @deprecated Use `createNovelApplicationServices()` and inject only the
 * pipeline capability required by the caller.
 */
export class NovelPipelineService {
  protected readonly core = new NovelCoreService();
  protected readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  constructor() {
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
  }

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
