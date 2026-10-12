import type { StepContext, StepHandler } from "../../application";

interface ChapterListWorkspace {
  novelId: string;
  volumes: readonly {id: string; status: string; chapters: readonly unknown[]}[];
  beatSheets: readonly {volumeId: string; beats: readonly unknown[]}[];
}
export interface VolumeChapterListStepInput<Provider extends string, Document extends ChapterListWorkspace> {
  workspace: Document;
  targetVolumeId: string;
  provider?: Provider;
  model?: string;
  temperature?: number;
  guidance?: string;
}
export interface VolumeChapterListStepDependencies<Provider extends string, Document extends ChapterListWorkspace> {
  inputProvider: (context: StepContext) => Promise<VolumeChapterListStepInput<Provider, Document>>;
  volumeService: {
    generateVolumes(novelId: string, options: {
      scope: "chapter_list"; generationMode: "full_volume"; targetVolumeId: string; draftWorkspace: Document;
      provider?: Provider; model?: string; temperature?: number; guidance?: string;
      taskId: string; entrypoint: "director_next"; persistIntermediateDocuments: false;
    }): Promise<Document>;
    updateVolumesWithOptions(novelId: string, document: Document, options: {
      emitEvent: false; syncPayoffLedger: false; syncToChapterExecution: false;
      memoryTelemetry: {taskId: string; stage: "structured_outline"; itemKey: "chapter_list"; scope: "chapter_list"; entrypoint: "director_next"; volumeId: string};
    }): Promise<Document>;
  };
  contentHash: (content: unknown) => string;
}

/** Saved service status describes completeness; it is not a story-quality decision. */
export function isSavedVolumeChapterListComplete(volume: {status: string; chapters: readonly unknown[]}): boolean {
  const status = volume.status.trim();
  return volume.chapters.length > 0 && status !== "chapter_list_partial" && !status.startsWith("chapter_list_partial:");
}

function requireCompleteList(document: ChapterListWorkspace, novelId: string, volumeId: string) {
  if (document.novelId !== novelId) throw new Error("拆章工作区不属于当前小说。");
  const volume = document.volumes.find(row => row.id === volumeId);
  if (!volume || volume.chapters.length === 0) throw new Error("目标卷没有可用的章节列表。");
  if (!isSavedVolumeChapterListComplete(volume)) {
    throw new Error("目标卷章节列表尚未完整保存，不能登记为完成产物。");
  }
  return volume.chapters;
}

export function createVolumeChapterListStepHandler<Provider extends string, Document extends ChapterListWorkspace>(dependencies: VolumeChapterListStepDependencies<Provider, Document>): StepHandler {
  return async context => {
    const input = await dependencies.inputProvider(context);
    const novelId = context.contract.novelId;
    if (input.workspace.novelId !== novelId) throw new Error("拆章工作区不属于当前小说。");
    if (!input.workspace.volumes.some(volume => volume.id === input.targetVolumeId)) throw new Error("缺少待拆章的目标卷。");
    if (!input.workspace.beatSheets.some(sheet => sheet.volumeId === input.targetVolumeId && sheet.beats.length > 0)) {
      throw new Error("目标卷缺少节奏板，不能生成章节列表。");
    }
    const generated = await dependencies.volumeService.generateVolumes(novelId, {
      scope: "chapter_list", generationMode: "full_volume", targetVolumeId: input.targetVolumeId,
      draftWorkspace: input.workspace, provider: input.provider, model: input.model,
      temperature: input.temperature, guidance: input.guidance,
      taskId: context.runId, entrypoint: "director_next", persistIntermediateDocuments: false,
    });
    requireCompleteList(generated, novelId, input.targetVolumeId);
    const saved = await dependencies.volumeService.updateVolumesWithOptions(novelId, generated, {
      emitEvent: false, syncPayoffLedger: false, syncToChapterExecution: false,
      memoryTelemetry: {
        taskId: context.runId, stage: "structured_outline", itemKey: "chapter_list", scope: "chapter_list",
        entrypoint: "director_next", volumeId: input.targetVolumeId,
      },
    });
    const chapters = requireCompleteList(saved, novelId, input.targetVolumeId);
    return {artifact: {
      scope: context.contract.scope, status: "draft", protectedUserContent: false,
      contentRef: `volume_chapter_list:${novelId}:${input.targetVolumeId}`,
      contentHash: dependencies.contentHash(chapters),
    }};
  };
}
