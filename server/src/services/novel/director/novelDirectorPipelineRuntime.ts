import type { CharacterCastOption, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import {
  isDirectorAutoExecutionRunMode,
  isFullBookAutopilotRunMode,
} from "@ai-novel/shared/types/novelDirector";
import {
  normalizeDirectorAutoApprovalConfig,
  shouldAutoApproveDirectorApprovalPoint,
  shouldAutoApproveDirectorCheckpoint,
  type DirectorAutoApprovalPointCode,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { BookContractService } from "../BookContractService";
import type { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import { generateAutoCharacterCastDraft, persistCharacterCastOptionsDraft } from "../characterPrep/characterCastGeneration";
import type { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import type { NovelContextService } from "../NovelContextService";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import { recordAutoDirectorAutoApprovalFromTask } from "../../task/autoDirectorFollowUps/autoDirectorAutoApprovalAudit";
import { normalizeDirectorMemoryScope } from "./runtime/autoDirectorMemorySafety";
import {
  buildWorkflowSeedPayload,
  normalizeDirectorRunMode,
} from "./runtime/novelDirectorHelpers";
import {
  type DirectorCharacterSetupPhaseResult,
  runDirectorCharacterSetupPhase,
  runDirectorStructuredOutlinePhase,
  runDirectorVolumeStrategyPhase,
} from "./phases/novelDirectorPipelinePhases";
import { resolveSafeDirectorPipelineStartPhase } from "./recovery/novelDirectorRecovery";
import {
  runDirectorBookContractPhase,
  runDirectorStoryMacroAssetPhase,
} from "./phases/novelDirectorStoryMacroPhase";
import type { NovelDirectorRuntimeOrchestrator } from "./runtime/novelDirectorRuntimeOrchestrator";
import {
  getDirectorPlanningStepModule,
  getDirectorExecutionContractSyncStepModule,
  getDirectorStructuredOutlineStepModules,
} from "./workflowStepRuntime/directorWorkflowStepModules";
import {
  inspectWorkflowStepFacts,
  isExecutableWorkflowStepModule,
  type WorkflowStepModuleDescriptor,
} from "./workflowStepRuntime/WorkflowStepModule";
import type { DirectorPipelinePhase } from "./recovery/novelDirectorRecovery";
import { WorldContextGateway } from "../worldContext/WorldContextGateway";

export interface DirectorPipelineRunInput {
  taskId: string;
  novelId: string;
  input: DirectorConfirmRequest;
  startPhase: Exclude<DirectorPipelinePhase, "book_contract">;
  scope?: string | null;
  batchAlreadyStartedCount?: number;
  approveCurrentGate?: boolean;
  approveAutoExecutionScope?: boolean;
}

function isDirectorCharacterSetupPauseResult(value: unknown): value is Extract<
  DirectorCharacterSetupPhaseResult,
  { status: "waiting_review" | "applied_waiting_review" }
> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const status = (value as { status?: unknown }).status;
  return status === "waiting_review" || status === "applied_waiting_review";
}

export class NovelDirectorPipelineRuntime {
  constructor(private readonly deps: {
    workflowService: NovelWorkflowService;
    novelContextService: NovelContextService;
    characterDynamicsService: CharacterDynamicsService;
    characterPreparationService: CharacterPreparationService;
    storyMacroService: StoryMacroPlanService;
    bookContractService: BookContractService;
    volumeService: NovelVolumeService;
    runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => ReturnType<typeof buildWorkflowSeedPayload>;
    assertHighMemoryStartAllowed: (input: {
      taskId: string;
      novelId: string;
      stage: "structured_outline";
      itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
      volumeId?: string | null;
      chapterId?: string | null;
      scope?: string | null;
      batchAlreadyStartedCount?: number;
    }) => Promise<void>;
  }) {}

  async runPipeline(input: DirectorPipelineRunInput): Promise<void> {
    const safeStartPhase = await this.resolveSafePipelineStartPhase({
      novelId: input.novelId,
      requestedPhase: input.startPhase,
      request: input.input,
    });
    const sequence: DirectorPipelinePhase[] = [
      "story_macro",
      "book_contract",
      "world_setup",
      "character_setup",
      "volume_strategy",
      "structured_outline",
    ];
    const startIndex = Math.max(0, sequence.indexOf(safeStartPhase));
    const approval = this.resolveRuntimeApproval(input);
    const bookContractApproval = approval;
    for (const phase of sequence.slice(startIndex)) {
      if (phase === "story_macro") {
        const storyMacroModule = getDirectorPlanningStepModule("story_macro");
        if (!(await this.isModuleFactCompleted(storyMacroModule, input))) {
          await this.deps.runtimeOrchestrator.runStepModule({
            module: storyMacroModule,
            taskId: input.taskId,
            novelId: input.novelId,
            targetId: input.novelId,
            approveCurrentGate: approval.approveCurrentGate,
            approveAutoExecutionScope: approval.approveAutoExecutionScope,
          });
        }
        continue;
      }

      if (phase === "book_contract") {
        const bookContractModule = getDirectorPlanningStepModule("book_contract");
        if (!(await this.isModuleFactCompleted(bookContractModule, input))) {
          await this.deps.runtimeOrchestrator.runStepModule({
            module: bookContractModule,
            taskId: input.taskId,
            novelId: input.novelId,
            targetId: input.novelId,
            approveCurrentGate: bookContractApproval.approveCurrentGate,
            approveAutoExecutionScope: bookContractApproval.approveAutoExecutionScope,
          });
        }
        continue;
      }

      if (phase === "world_setup") {
        const module = getDirectorPlanningStepModule("world_setup");
        if (!(await this.isModuleFactCompleted(module, input))) {
          await this.deps.runtimeOrchestrator.runStepModule({
            module,
            taskId: input.taskId,
            novelId: input.novelId,
            targetId: input.novelId,
            approveCurrentGate: approval.approveCurrentGate,
            approveAutoExecutionScope: approval.approveAutoExecutionScope,
          });
        }
        continue;
      }

      if (phase === "character_setup") {
        const module = getDirectorPlanningStepModule("character_setup");
        if (await this.isModuleFactCompleted(module, input)) {
          continue;
        }
        const result = await this.deps.runtimeOrchestrator.runStepModule({
          module,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: approval.approveCurrentGate,
          approveAutoExecutionScope: approval.approveAutoExecutionScope,
        });
        if (isDirectorCharacterSetupPauseResult(result)) {
          return;
        }
        continue;
      }

      if (phase === "volume_strategy") {
        const module = getDirectorPlanningStepModule("volume_strategy");
        if (await this.isModuleFactCompleted(module, input)) {
          continue;
        }
        const volumeApproval = this.resolveRuntimeApproval(input, "volume_strategy_ready");
        const paused = await this.deps.runtimeOrchestrator.runStepModule({
          module,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: volumeApproval.approveCurrentGate,
          approveAutoExecutionScope: volumeApproval.approveAutoExecutionScope,
        });
        if (paused === null) {
          return;
        }
        continue;
      }

      const currentWorkspace = await this.loadVolumeWorkspaceForOutline(input.novelId);
      if (!currentWorkspace) {
        return;
      }
      await this.runStructuredOutlineNode(input, currentWorkspace);
      const executionContractSyncModule = getDirectorExecutionContractSyncStepModule();
      const structuredApproval = this.resolveRuntimeApproval(input, "structured_outline_ready");
      if (!(await this.isModuleFactCompleted(executionContractSyncModule, input))) {
        await this.deps.runtimeOrchestrator.runStepModule({
          module: executionContractSyncModule,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: structuredApproval.approveCurrentGate,
          approveAutoExecutionScope: structuredApproval.approveAutoExecutionScope,
        });
      }
      await this.maybeRunAutoApprovedChapters(input);
      return;
    }
  }

  async runStructuredOutlineNode(
    input: DirectorPipelineRunInput,
    workspace: VolumePlanDocument,
  ): Promise<void> {
    await this.assertOutlineStartAllowed(input, workspace);
    const approval = this.resolveRuntimeApproval(input, "structured_outline_ready");
    for (const module of getDirectorStructuredOutlineStepModules()) {
      if (module.id === "chapter.execution_contract.sync") {
        continue;
      }
      await this.deps.runtimeOrchestrator.runStepModule({
        module,
        taskId: input.taskId,
        novelId: input.novelId,
        targetId: input.novelId,
        approveCurrentGate: approval.approveCurrentGate,
        approveAutoExecutionScope: approval.approveAutoExecutionScope,
      });
    }
  }

  private async isModuleFactCompleted(
    module: WorkflowStepModuleDescriptor,
    input: Pick<DirectorPipelineRunInput, "taskId" | "novelId">,
  ): Promise<boolean> {
    if (!isExecutableWorkflowStepModule(module)) {
      return false;
    }
    const facts = await inspectWorkflowStepFacts(module, {
      taskId: input.taskId,
      novelId: input.novelId,
    });
    return facts.completed;
  }

  private async assertOutlineStartAllowed(
    input: DirectorPipelineRunInput,
    workspace: VolumePlanDocument,
  ): Promise<void> {
    await this.deps.assertHighMemoryStartAllowed({
      taskId: input.taskId,
      novelId: input.novelId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      volumeId: workspace.volumes[0]?.id,
      scope: normalizeDirectorMemoryScope({
        volumeId: workspace.volumes[0]?.id,
        fallback: input.scope ?? "book",
      }),
      batchAlreadyStartedCount: input.batchAlreadyStartedCount,
    });
  }

  async loadVolumeWorkspaceForOutline(novelId: string): Promise<VolumePlanDocument | null> {
    const workspace = await this.deps.volumeService.getVolumes(novelId).catch(() => null);
    if (!workspace?.volumes.length || !workspace.strategyPlan) {
      return null;
    }
    return workspace;
  }

  private async maybeRunAutoApprovedChapters(input: DirectorPipelineRunInput): Promise<void> {
    const shouldAutoApproveCheckpoint = this.shouldAutoApproveCheckpoint(input.input, "chapter_batch_ready");
    if (!input.approveAutoExecutionScope && !shouldAutoApproveCheckpoint) {
      return;
    }
    if (shouldAutoApproveCheckpoint) {
      await recordAutoDirectorAutoApprovalFromTask({
        taskId: input.taskId,
        checkpointType: "chapter_batch_ready",
      });
    }
    const approval = this.resolveRuntimeApproval(input, "structured_outline_ready");
    await this.deps.runtimeOrchestrator.runChapterExecutionNode({
      taskId: input.taskId,
      novelId: input.novelId,
      request: input.input,
      resumeCheckpointType: "chapter_batch_ready",
      approveCurrentGate: approval.approveCurrentGate,
      approveAutoExecutionScope: approval.approveAutoExecutionScope,
    });
  }

  private async resolveSafePipelineStartPhase(input: {
    novelId: string;
    requestedPhase: Exclude<DirectorPipelinePhase, "book_contract">;
    request: DirectorConfirmRequest;
  }): Promise<DirectorPipelinePhase> {
    const [workspace, storyMacroPlan, bookContract, characters, hasActiveWorld] = await Promise.all([
      this.deps.volumeService.getVolumes(input.novelId).catch(() => null),
      this.deps.storyMacroService.getPlan(input.novelId).catch(() => null),
      this.deps.bookContractService.getByNovelId(input.novelId).catch(() => null),
      this.deps.novelContextService.listCharacters(input.novelId).catch(() => []),
      new WorldContextGateway().hasActiveWorld(input.novelId).catch(() => false),
    ]);
    return resolveSafeDirectorPipelineStartPhase({
      requestedPhase: input.requestedPhase,
      hasStoryMacroPlan: Boolean(
        storyMacroPlan
        && typeof storyMacroPlan.storyInput === "string"
        && storyMacroPlan.storyInput.trim()
        && storyMacroPlan.decomposition,
      ),
      hasBookContract: Boolean(bookContract),
      hasWorldSetupPrepared: input.request.worldSetupMode === "skip" || hasActiveWorld,
      hasCharacters: characters.length > 0,
      hasVolumeWorkspace: Boolean(workspace?.volumes.length),
      hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
    });
  }

  private shouldAutoApproveCheckpoint(
    input: DirectorConfirmRequest,
    checkpointType: "chapter_batch_ready" | "replan_required",
  ): boolean {
    if (Object.prototype.hasOwnProperty.call(input, "autoApproval")) {
      return shouldAutoApproveDirectorCheckpoint(
        normalizeDirectorAutoApprovalConfig(input.autoApproval),
        checkpointType,
      );
    }
    return checkpointType === "chapter_batch_ready" && isDirectorAutoExecutionRunMode(normalizeDirectorRunMode(input.runMode));
  }

  private resolveRuntimeApproval(
    input: DirectorPipelineRunInput,
    approvalPointCode?: DirectorAutoApprovalPointCode,
  ): {
    approveCurrentGate: boolean;
    approveAutoExecutionScope: boolean;
  } {
    const runMode = normalizeDirectorRunMode(input.input.runMode);
    const isFullBookAutopilot = isFullBookAutopilotRunMode(runMode);
    const isAuthorizedAutoToExecutionGate = runMode === "auto_to_execution"
      && Boolean(approvalPointCode)
      && shouldAutoApproveDirectorApprovalPoint(
        normalizeDirectorAutoApprovalConfig(input.input.autoApproval),
        approvalPointCode as DirectorAutoApprovalPointCode,
      );
    return {
      approveCurrentGate: Boolean(input.approveCurrentGate || isFullBookAutopilot || isAuthorizedAutoToExecutionGate),
      approveAutoExecutionScope: Boolean(input.approveAutoExecutionScope || isFullBookAutopilot || isAuthorizedAutoToExecutionGate),
    };
  }

  async executeStoryMacroStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    return runDirectorStoryMacroAssetPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        storyMacroService: this.deps.storyMacroService,
      },
      callbacks: {
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  async executeBookContractStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await runDirectorBookContractPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        storyMacroService: this.deps.storyMacroService,
        bookContractService: this.deps.bookContractService,
      },
      callbacks: {
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  async executeCharacterSetupStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<DirectorCharacterSetupPhaseResult> {
    return this.runCharacterSetupPhase(taskId, novelId, input);
  }

  async executeVolumeStrategyStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<VolumePlanDocument | null> {
    return this.runVolumeStrategyPhase(taskId, novelId, input);
  }

  private async findReusableDirectorCharacterCastOption(targetNovelId: string): Promise<CharacterCastOption | null> {
    const [existingOptions, existingCharacters]: [CharacterCastOption[], Awaited<ReturnType<NovelContextService["listCharacters"]>>] = await Promise.all([
      this.deps.characterPreparationService.listCharacterCastOptions(targetNovelId),
      this.deps.novelContextService.listCharacters(targetNovelId).catch(() => []),
    ]);
    const appliedOption = existingOptions.find((option) => option.status === "applied") ?? null;
    if (appliedOption) {
      return existingCharacters.length > 0
        ? appliedOption
        : { ...appliedOption, status: "draft" };
    }
    return existingOptions[0] ?? null;
  }

  private buildDirectorCharacterPreparationService() {
    return {
      generateAutoCharacterCastOption: async (targetNovelId: string, options: {
        provider?: DirectorConfirmRequest["provider"];
        model?: string;
        temperature?: number;
        storyInput?: string;
      }) => {
        const reusableOption = await this.findReusableDirectorCharacterCastOption(targetNovelId);
        if (reusableOption) {
          return reusableOption;
        }
        const generated = await generateAutoCharacterCastDraft(targetNovelId, options);
        await persistCharacterCastOptionsDraft(targetNovelId, generated.storyInput, {
          options: [generated.parsed.option],
        });
        const [persistedOption] = await this.deps.characterPreparationService.listCharacterCastOptions(targetNovelId);
        if (!persistedOption) {
          throw new Error("Auto director character cast option was not persisted.");
        }
        return persistedOption;
      },
      assessCharacterCastOptions: (...args: Parameters<CharacterPreparationService["assessCharacterCastOptions"]>) => (
        this.deps.characterPreparationService.assessCharacterCastOptions(...args)
      ),
      applyCharacterCastOption: (...args: Parameters<CharacterPreparationService["applyCharacterCastOption"]>) => (
        this.deps.characterPreparationService.applyCharacterCastOption(...args)
      ),
      findReusableCharacterCastOption: (targetNovelId: string) => this.findReusableDirectorCharacterCastOption(targetNovelId),
    };
  }

  private async runCharacterSetupPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<DirectorCharacterSetupPhaseResult> {
    return runDirectorCharacterSetupPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        workflowService: this.deps.workflowService,
        novelContextService: this.deps.novelContextService,
        characterDynamicsService: this.deps.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.deps.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.deps.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  private async runVolumeStrategyPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<VolumePlanDocument | null> {
    return runDirectorVolumeStrategyPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        workflowService: this.deps.workflowService,
        novelContextService: this.deps.novelContextService,
        characterDynamicsService: this.deps.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.deps.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.deps.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  async executeStructuredOutlineStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: VolumePlanDocument,
  ): Promise<void> {
    await runDirectorStructuredOutlinePhase({
      taskId,
      novelId,
      request: input,
      baseWorkspace,
      dependencies: {
        workflowService: this.deps.workflowService,
        novelContextService: this.deps.novelContextService,
        characterDynamicsService: this.deps.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.deps.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.deps.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  private async runStoryMacroPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    return this.executeStoryMacroStep(taskId, novelId, input);
  }

  private async runBookContractPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await this.executeBookContractStep(taskId, novelId, input);
  }

  private async runStructuredOutlinePhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: VolumePlanDocument,
  ): Promise<void> {
    await this.executeStructuredOutlineStep(taskId, novelId, input, baseWorkspace);
  }
}
