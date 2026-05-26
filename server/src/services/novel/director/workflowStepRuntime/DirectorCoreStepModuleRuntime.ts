import type { DirectorChapterExecutionProgressSummary, DirectorArtifactRef, DirectorArtifactType } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorAutoExecutionState, DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { BookContractService } from "../../BookContractService";
import { CharacterPreparationService } from "../../characterPrep/CharacterPreparationService";
import { CharacterDynamicsService } from "../../dynamics/CharacterDynamicsService";
import { NovelContextService } from "../../NovelContextService";
import type { NovelApplicationServices } from "../../application/NovelApplicationContracts";
import { getSharedNovelServices } from "../../application/sharedNovelServices";
import type { RepairOptions } from "../../novelCoreShared";
import type { ChapterRuntimeRequestInput } from "../../runtime/chapterRuntimeSchema";
import { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import { NovelVolumeService } from "../../volume/NovelVolumeService";
import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import { buildDirectorWorkflowSeedPayload } from "../runtime/novelDirectorHelpers";
import { NovelDirectorAutoExecutionRuntime } from "../automation/novelDirectorAutoExecutionRuntime";
import { NovelDirectorPipelineRuntime } from "../novelDirectorPipelineRuntime";
import { NovelDirectorRuntimeOrchestrator } from "../runtime/novelDirectorRuntimeOrchestrator";
import { DirectorRuntimeService } from "../runtime/DirectorRuntimeService";
import { ChapterExecutionProgressInspector } from "../runtime/ChapterExecutionProgressInspector";
import { normalizeDirectorAutoExecutionPlan } from "../automation/novelDirectorAutoExecution";
import { assertHighMemoryDirectorStartAllowed } from "../runtime/autoDirectorMemorySafety";
import {
  resolveStructuredOutlineRecoveryCursor,
  type StructuredOutlineRecoveryCursor,
} from "../recovery/novelDirectorStructuredOutlineRecovery";

export interface DirectorCoreStepModuleRuntimeDeps {
  workflowService: NovelWorkflowService;
  novelContextService: NovelContextService;
  characterDynamicsService: CharacterDynamicsService;
  characterPreparationService: CharacterPreparationService;
  storyMacroService: StoryMacroPlanService;
  bookContractService: BookContractService;
  volumeService: NovelVolumeService;
  novelService: Pick<NovelApplicationServices,
    | "createChapterRuntimeStream"
    | "createChapterStream"
    | "createRepairStream"
  >;
  directorRuntime: DirectorRuntimeService;
  chapterProgressInspector: ChapterExecutionProgressInspector;
  autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
  runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
  pipelineRuntime: NovelDirectorPipelineRuntime;
}

export function buildDefaultDirectorCoreStepModuleRuntimeDeps(): DirectorCoreStepModuleRuntimeDeps {
  const workflowService = new NovelWorkflowService();
  const novelContextService = new NovelContextService();
  const characterDynamicsService = new CharacterDynamicsService();
  const characterPreparationService = new CharacterPreparationService();
  const storyMacroService = new StoryMacroPlanService();
  const bookContractService = new BookContractService();
  const volumeService = new NovelVolumeService();
  const novelService = getSharedNovelServices();
  const directorRuntime = new DirectorRuntimeService();
  const chapterProgressInspector = new ChapterExecutionProgressInspector();
  const autoExecutionRuntime = new NovelDirectorAutoExecutionRuntime({
    novelContextService,
    novelService,
    volumeWorkspaceService: volumeService,
    workflowService,
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string,
      extra?: Record<string, unknown>,
    ) => buildDirectorWorkflowSeedPayload(input, novelId, extra),
  });
  const runtimeOrchestrator = new NovelDirectorRuntimeOrchestrator({
    directorRuntime,
    workflowService,
    autoExecutionRuntime,
  });
  const pipelineRuntime = new NovelDirectorPipelineRuntime({
    workflowService,
    novelContextService,
    characterDynamicsService,
    characterPreparationService,
    storyMacroService,
    bookContractService,
    volumeService,
    runtimeOrchestrator,
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => buildDirectorWorkflowSeedPayload(input, novelId, extra),
    assertHighMemoryStartAllowed: (input: {
      taskId: string;
      novelId: string;
      stage: "structured_outline";
      itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
      volumeId?: string | null;
      chapterId?: string | null;
      scope?: string | null;
      batchAlreadyStartedCount?: number;
    }) => assertHighMemoryDirectorStartAllowed(workflowService, input),
  });

  return {
    workflowService,
    novelContextService,
    characterDynamicsService,
    characterPreparationService,
    storyMacroService,
    bookContractService,
    volumeService,
    novelService,
    directorRuntime,
    chapterProgressInspector,
    autoExecutionRuntime,
    runtimeOrchestrator,
    pipelineRuntime,
  };
}

export class DirectorCoreStepModuleRuntime {
  private readonly workflowService: NovelWorkflowService;
  private readonly novelContextService: NovelContextService;
  private readonly characterDynamicsService: CharacterDynamicsService;
  private readonly characterPreparationService: CharacterPreparationService;
  private readonly storyMacroService: StoryMacroPlanService;
  private readonly bookContractService: BookContractService;
  private readonly volumeService: NovelVolumeService;
  private readonly novelService: Pick<NovelApplicationServices,
    | "createChapterRuntimeStream"
    | "createChapterStream"
    | "createRepairStream"
  >;
  private readonly directorRuntime: DirectorRuntimeService;
  private readonly chapterProgressInspector: ChapterExecutionProgressInspector;
  private readonly autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
  private readonly runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
  private readonly pipelineRuntime: NovelDirectorPipelineRuntime;

  constructor(deps: DirectorCoreStepModuleRuntimeDeps = buildDefaultDirectorCoreStepModuleRuntimeDeps()) {
    this.workflowService = deps.workflowService;
    this.novelContextService = deps.novelContextService;
    this.characterDynamicsService = deps.characterDynamicsService;
    this.characterPreparationService = deps.characterPreparationService;
    this.storyMacroService = deps.storyMacroService;
    this.bookContractService = deps.bookContractService;
    this.volumeService = deps.volumeService;
    this.novelService = deps.novelService;
    this.directorRuntime = deps.directorRuntime;
    this.chapterProgressInspector = deps.chapterProgressInspector;
    this.autoExecutionRuntime = deps.autoExecutionRuntime;
    this.runtimeOrchestrator = deps.runtimeOrchestrator;
    this.pipelineRuntime = deps.pipelineRuntime;
  }

  getDirectorRuntime(): DirectorRuntimeService {
    return this.directorRuntime;
  }

  async getStoryMacroPlan(novelId: string) {
    return this.storyMacroService.getPlan(novelId).catch(() => null);
  }

  async getBookContract(novelId: string) {
    return this.bookContractService.getByNovelId(novelId).catch(() => null);
  }

  async getCharacters(novelId: string) {
    return this.novelContextService.listCharacters(novelId).catch(() => []);
  }

  async getVolumeWorkspace(novelId: string): Promise<VolumePlanDocument | null> {
    return this.pipelineRuntime.loadVolumeWorkspaceForOutline(novelId);
  }

  async getStructuredOutlineRecoveryCursor(
    novelId: string,
    request?: DirectorConfirmRequest | null,
  ): Promise<StructuredOutlineRecoveryCursor | null> {
    const workspace = await this.getVolumeWorkspace(novelId);
    if (!workspace) {
      return null;
    }
    return resolveStructuredOutlineRecoveryCursor({
      workspace,
      plan: request ? normalizeDirectorAutoExecutionPlan(request.autoExecutionPlan) : undefined,
    });
  }

  async inspectChapterExecutionProgress(novelId: string): Promise<DirectorChapterExecutionProgressSummary | null> {
    return this.chapterProgressInspector.inspectNovel(novelId).catch(() => null);
  }

  async getExecutionChapters(novelId: string) {
    return this.novelContextService.listChapters(novelId).catch(() => []);
  }

  async collectWrittenArtifacts(
    novelId: string,
    taskId: string,
    writeTypes: string[],
  ): Promise<DirectorArtifactRef[]> {
    const analysis = await this.directorRuntime.analyzeWorkspace({
      novelId,
      workflowTaskId: taskId,
      includeAiInterpretation: false,
    }).catch(() => null);
    if (!analysis) {
      return [];
    }
    const allowedTypes = new Set(writeTypes as DirectorArtifactType[]);
    return analysis.inventory.artifacts.filter((artifact) => allowedTypes.has(artifact.artifactType));
  }

  async executeStoryMacroStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
  }) {
    return this.pipelineRuntime.executeStoryMacroStep(input.taskId, input.novelId, input.request);
  }

  async executeBookContractStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
  }): Promise<void> {
    await this.pipelineRuntime.executeBookContractStep(input.taskId, input.novelId, input.request);
  }

  async executeCharacterSetupStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
  }): Promise<boolean> {
    return this.pipelineRuntime.executeCharacterSetupStep(input.taskId, input.novelId, input.request);
  }

  async executeVolumeStrategyStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
  }): Promise<VolumePlanDocument | null> {
    return this.pipelineRuntime.executeVolumeStrategyStep(input.taskId, input.novelId, input.request);
  }

  async executeStructuredOutlineStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    baseWorkspace: VolumePlanDocument;
  }): Promise<void> {
    await this.pipelineRuntime.executeStructuredOutlineStep(
      input.taskId,
      input.novelId,
      input.request,
      input.baseWorkspace,
    );
  }

  async executeStructuredOutlineFactStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
  }): Promise<void> {
    const baseWorkspace = await this.getVolumeWorkspace(input.novelId);
    if (!baseWorkspace) {
      throw new Error("Structured outline requires an existing volume strategy workspace.");
    }
    await this.executeStructuredOutlineStep({
      ...input,
      baseWorkspace,
    });
  }

  async executeChapterExecutionContractSyncStep(input: {
    novelId: string;
  }): Promise<void> {
    const workspace = await this.getVolumeWorkspace(input.novelId);
    if (!workspace) {
      throw new Error("Chapter execution contract sync requires a prepared volume workspace.");
    }
    await this.volumeService.syncVolumeChaptersWithOptions(
      input.novelId,
      {
        volumes: workspace.volumes,
        preserveContent: true,
        applyDeletes: false,
      },
      {
        emitEvent: false,
        syncPayoffLedger: true,
      },
    );
  }

  async executeChapterDraftStep(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
    resumeCheckpointType?: "chapter_batch_ready" | "chapter_batch_ready" | "replan_required" | null;
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
  }): Promise<void> {
    await this.autoExecutionRuntime.runFromReady({
      taskId: input.taskId,
      novelId: input.novelId,
      request: input.request,
      existingPipelineJobId: input.existingPipelineJobId,
      existingState: input.existingState,
      resumeCheckpointType: input.resumeCheckpointType,
      previousFailureMessage: input.previousFailureMessage,
      allowSkipReviewBlockedChapter: input.allowSkipReviewBlockedChapter,
    });
  }

  async executeManualChapterDraftStep(input: {
    novelId: string;
    chapterId: string;
    options?: ChapterRuntimeRequestInput;
    useRuntimeStream?: boolean;
  }) {
    if (input.useRuntimeStream) {
      return this.novelService.createChapterRuntimeStream(
        input.novelId,
        input.chapterId,
        input.options ?? {},
      );
    }
    return this.novelService.createChapterStream(
      input.novelId,
      input.chapterId,
      input.options ?? {},
    );
  }

  async executeManualChapterRepairStep(input: {
    novelId: string;
    chapterId: string;
    options?: RepairOptions;
  }) {
    return this.novelService.createRepairStream(
      input.novelId,
      input.chapterId,
      input.options ?? {},
    );
  }
}

