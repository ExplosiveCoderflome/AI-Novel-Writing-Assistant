import type { DirectorChapterExecutionProgressSummary, DirectorArtifactRef, DirectorArtifactType } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorAutoExecutionState, DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { BookContractService } from "../../BookContractService";
import type { CharacterPreparationService } from "../../characterPrep/CharacterPreparationService";
import type { CharacterDynamicsService } from "../../dynamics/CharacterDynamicsService";
import type { NovelContextService } from "../../NovelContextService";
import type { NovelService } from "../../NovelService";
import type { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import { buildDirectorWorkflowSeedPayload } from "../novelDirectorHelpers";
import type { NovelDirectorAutoExecutionRuntime } from "../novelDirectorAutoExecutionRuntime";
import type { NovelDirectorPipelineRuntime } from "../novelDirectorPipelineRuntime";
import type { NovelDirectorRuntimeOrchestrator } from "../novelDirectorRuntimeOrchestrator";
import type { DirectorRuntimeService } from "../runtime/DirectorRuntimeService";
import type { ChapterExecutionProgressInspector } from "../runtime/ChapterExecutionProgressInspector";
import { normalizeDirectorAutoExecutionPlan } from "../novelDirectorAutoExecution";
import {
  resolveStructuredOutlineRecoveryCursor,
  type StructuredOutlineRecoveryCursor,
} from "../novelDirectorStructuredOutlineRecovery";

export class DirectorCoreStepModuleRuntime {
  private readonly workflowService: NovelWorkflowService;
  private readonly novelContextService: NovelContextService;
  private readonly characterDynamicsService: CharacterDynamicsService;
  private readonly characterPreparationService: CharacterPreparationService;
  private readonly storyMacroService: StoryMacroPlanService;
  private readonly bookContractService: BookContractService;
  private readonly volumeService: NovelVolumeService;
  private readonly novelService: NovelService;
  private readonly directorRuntime: DirectorRuntimeService;
  private readonly chapterProgressInspector: ChapterExecutionProgressInspector;
  private readonly autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
  private readonly runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
  private readonly pipelineRuntime: NovelDirectorPipelineRuntime;

  constructor() {
    const { NovelWorkflowService } = require("../../workflow/NovelWorkflowService");
    const { NovelContextService } = require("../../NovelContextService");
    const { CharacterDynamicsService } = require("../../dynamics/CharacterDynamicsService");
    const { CharacterPreparationService } = require("../../characterPrep/CharacterPreparationService");
    const { StoryMacroPlanService } = require("../../storyMacro/StoryMacroPlanService");
    const { BookContractService } = require("../../BookContractService");
    const { NovelVolumeService } = require("../../volume/NovelVolumeService");
    const { NovelService } = require("../../NovelService");
    const { DirectorRuntimeService } = require("../runtime/DirectorRuntimeService");
    const { ChapterExecutionProgressInspector } = require("../runtime/ChapterExecutionProgressInspector");
    const { NovelDirectorAutoExecutionRuntime } = require("../novelDirectorAutoExecutionRuntime");
    const { NovelDirectorRuntimeOrchestrator } = require("../novelDirectorRuntimeOrchestrator");
    const { NovelDirectorPipelineRuntime } = require("../novelDirectorPipelineRuntime");
    const { assertHighMemoryDirectorStartAllowed } = require("../autoDirectorMemorySafety");

    this.workflowService = new NovelWorkflowService();
    this.novelContextService = new NovelContextService();
    this.characterDynamicsService = new CharacterDynamicsService();
    this.characterPreparationService = new CharacterPreparationService();
    this.storyMacroService = new StoryMacroPlanService();
    this.bookContractService = new BookContractService();
    this.volumeService = new NovelVolumeService();
    this.novelService = new NovelService();
    this.directorRuntime = new DirectorRuntimeService();
    this.chapterProgressInspector = new ChapterExecutionProgressInspector();
    this.autoExecutionRuntime = new NovelDirectorAutoExecutionRuntime({
      novelContextService: this.novelContextService,
      novelService: this.novelService,
      volumeWorkspaceService: this.volumeService,
      workflowService: this.workflowService,
      buildDirectorSeedPayload: (
        input: DirectorConfirmRequest,
        novelId: string,
        extra?: Record<string, unknown>,
      ) => buildDirectorWorkflowSeedPayload(input, novelId, extra),
    });
    this.runtimeOrchestrator = new NovelDirectorRuntimeOrchestrator({
      directorRuntime: this.directorRuntime,
      workflowService: this.workflowService,
      autoExecutionRuntime: this.autoExecutionRuntime,
    });
    this.pipelineRuntime = new NovelDirectorPipelineRuntime({
      workflowService: this.workflowService,
      novelContextService: this.novelContextService,
      characterDynamicsService: this.characterDynamicsService,
      characterPreparationService: this.characterPreparationService,
      storyMacroService: this.storyMacroService,
      bookContractService: this.bookContractService,
      volumeService: this.volumeService,
      runtimeOrchestrator: this.runtimeOrchestrator,
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
      }) => assertHighMemoryDirectorStartAllowed(this.workflowService, input),
    });
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
}

