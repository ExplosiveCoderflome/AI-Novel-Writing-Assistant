import type { StepContext, StepHandler } from "../../application";

export interface VolumeStrategyStepInput<Provider extends string> {
  provider?: Provider;
  model?: string;
  temperature?: number;
  estimatedChapterCount: number;
  skeletonVolumeCount?: number;
}

interface VolumeStrategyGenerationOptions<Provider extends string, Document> extends VolumeStrategyStepInput<Provider> {
  scope: "strategy" | "strategy_critique" | "skeleton";
  taskId: string;
  entrypoint: "director_next";
  persistIntermediateDocuments: false;
  respectExistingVolumeCount?: false;
  draftWorkspace?: Document;
}

export interface VolumeStrategyStepDependencies<Provider extends string, Document extends {volumes: readonly unknown[]}> {
  inputProvider: (context: StepContext) => Promise<VolumeStrategyStepInput<Provider>>;
  volumeService: {
    generateVolumes(novelId: string, options: VolumeStrategyGenerationOptions<Provider, Document>): Promise<Document>;
    updateVolumes(novelId: string, input: Document & {syncToChapterExecution: false}): Promise<Document>;
  };
  contentHash: (content: unknown) => string;
}

export function createVolumeStrategyStepHandler<Provider extends string, Document extends {volumes: readonly unknown[]}>(dependencies: VolumeStrategyStepDependencies<Provider, Document>): StepHandler {
  return async context => {
    const input = await dependencies.inputProvider(context);
    if (!Number.isInteger(input.estimatedChapterCount) || input.estimatedChapterCount < 1) {
      throw new Error("分卷策略需要有效的目标章节数。");
    }
    const novelId = context.contract.novelId;
    const options = {
      provider: input.provider, model: input.model, temperature: input.temperature,
      estimatedChapterCount: input.estimatedChapterCount,
      taskId: context.runId, entrypoint: "director_next" as const,
      persistIntermediateDocuments: false as const,
    };
    const strategy = await dependencies.volumeService.generateVolumes(novelId, {
      ...options, scope: "strategy", respectExistingVolumeCount: false,
    });
    const reviewed = await dependencies.volumeService.generateVolumes(novelId, {
      ...options, scope: "strategy_critique", draftWorkspace: strategy,
    });
    const skeleton = await dependencies.volumeService.generateVolumes(novelId, {
      ...options, scope: "skeleton", draftWorkspace: reviewed,
      ...(input.skeletonVolumeCount === undefined ? {} : {skeletonVolumeCount: input.skeletonVolumeCount}),
    });
    const saved = await dependencies.volumeService.updateVolumes(novelId, {
      ...skeleton, syncToChapterExecution: false,
    });
    if (!saved.volumes.length) throw new Error("分卷策略未保存可用的卷骨架。");
    return {
      artifact: {
        scope: context.contract.scope,
        status: "draft",
        protectedUserContent: false,
        contentRef: `volume_strategy:${novelId}`,
        contentHash: dependencies.contentHash(saved),
      },
    };
  };
}
