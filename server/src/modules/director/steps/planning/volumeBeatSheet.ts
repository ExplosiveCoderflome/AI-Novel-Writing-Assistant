import type { StepContext, StepHandler } from "../../application";

interface BeatSheetWorkspace {
  novelId: string;
  volumes: readonly {id: string}[];
  beatSheets: readonly {volumeId: string; beats: readonly unknown[]}[];
}

export interface VolumeBeatSheetStepInput<Provider extends string, Document extends BeatSheetWorkspace> {
  workspace: Document;
  targetVolumeId: string;
  provider?: Provider;
  model?: string;
  temperature?: number;
  guidance?: string;
  reuseSaved?: boolean;
}

export interface VolumeBeatSheetStepDependencies<Provider extends string, Document extends BeatSheetWorkspace> {
  inputProvider: (context: StepContext) => Promise<VolumeBeatSheetStepInput<Provider, Document>>;
  volumeService: {
    generateVolumes(novelId: string, options: {
      scope: "beat_sheet"; targetVolumeId: string; draftWorkspace: Document;
      provider?: Provider; model?: string; temperature?: number; guidance?: string;
      taskId: string; entrypoint: "director_next"; persistIntermediateDocuments: false;
    }): Promise<Document>;
    updateVolumesWithOptions(novelId: string, document: Document, options: {
      emitEvent: false; syncPayoffLedger: false; syncToChapterExecution: false;
      memoryTelemetry: {taskId: string; stage: "structured_outline"; itemKey: "beat_sheet"; scope: "beat_sheet"; entrypoint: "director_next"; volumeId: string};
    }): Promise<Document>;
  };
  contentHash: (content: unknown) => string;
}

function requireTargetSheet<Document extends BeatSheetWorkspace>(document: Document, novelId: string, volumeId: string) {
  if (document.novelId !== novelId) throw new Error("节奏板工作区不属于当前小说。");
  const sheet = document.beatSheets.find(sheet => sheet.volumeId === volumeId && sheet.beats.length > 0);
  if (!document.volumes.some(volume => volume.id === volumeId) || !sheet) {
    throw new Error("目标卷节奏板没有可用的节奏段，不能完成本次规划。");
  }
  return sheet;
}

export function createVolumeBeatSheetStepHandler<Provider extends string, Document extends BeatSheetWorkspace>(dependencies: VolumeBeatSheetStepDependencies<Provider, Document>): StepHandler {
  return async context => {
    const input = await dependencies.inputProvider(context);
    const novelId = context.contract.novelId;
    if (input.workspace.novelId !== novelId) throw new Error("节奏板工作区不属于当前小说。");
    if (!input.workspace.volumes.some(volume => volume.id === input.targetVolumeId)) {
      throw new Error("缺少待生成节奏板的目标卷。");
    }
    if (input.reuseSaved) {
      const sheet = requireTargetSheet(input.workspace, novelId, input.targetVolumeId);
      return {artifact: {scope: context.contract.scope, status: "draft", protectedUserContent: false,
        contentRef: 'volume_beat_sheet:'+novelId+':'+input.targetVolumeId,
        contentHash: dependencies.contentHash(sheet)}};
    }
    const generated = await dependencies.volumeService.generateVolumes(novelId, {
      scope: "beat_sheet",
      targetVolumeId: input.targetVolumeId,
      draftWorkspace: input.workspace,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      guidance: input.guidance,
      taskId: context.runId,
      entrypoint: "director_next",
      persistIntermediateDocuments: false,
    });
    requireTargetSheet(generated, novelId, input.targetVolumeId);
    const saved = await dependencies.volumeService.updateVolumesWithOptions(novelId, generated, {
      emitEvent: false,
      syncPayoffLedger: false,
      syncToChapterExecution: false,
      memoryTelemetry: {
        taskId: context.runId, stage: "structured_outline", itemKey: "beat_sheet",
        scope: "beat_sheet", entrypoint: "director_next", volumeId: input.targetVolumeId,
      },
    });
    const sheet = requireTargetSheet(saved, novelId, input.targetVolumeId);
    return {
      artifact: {
        scope: context.contract.scope,
        status: "draft",
        protectedUserContent: false,
        contentRef: `volume_beat_sheet:${novelId}:${input.targetVolumeId}`,
        contentHash: dependencies.contentHash(sheet),
      },
    };
  };
}
