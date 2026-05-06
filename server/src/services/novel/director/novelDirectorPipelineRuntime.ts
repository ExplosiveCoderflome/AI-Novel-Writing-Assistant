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
import { normalizeDirectorMemoryScope } from "./autoDirectorMemorySafety";
import {
  buildWorkflowSeedPayload,
  normalizeDirectorRunMode,
} from "./novelDirectorHelpers";
import {
  runDirectorCharacterSetupPhase,
  runDirectorStructuredOutlinePhase,
  runDirectorVolumeStrategyPhase,
} from "./novelDirectorPipelinePhases";
import { resolveSafeDirectorPipelineStartPhase } from "./novelDirectorRecovery";
import {
  runDirectorBookContractPhase,
  runDirectorStoryMacroAssetPhase,
} from "./novelDirectorStoryMacroPhase";
import type { NovelDirectorRuntimeOrchestrator } from "./novelDirectorRuntimeOrchestrator";
import {
  getDirectorPlanningStepModule,
  getDirectorStructuredOutlineStepModules,
} from "./workflowStepRuntime/directorWorkflowStepModules";
import {
  inspectWorkflowStepFacts,
  isExecutableWorkflowStepModule,
  type WorkflowStepModuleDescriptor,
} from "./workflowStepRuntime/WorkflowStepModule";
import type { DirectorPipelinePhase } from "./novelDirectorRecovery";

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
    });
    const sequence: DirectorPipelinePhase[] = [
      "story_macro",
      "book_contract",
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

      if (phase === "character_setup") {
        const module = getDirectorPlanningStepModule("character_setup");
        if (await this.isModuleFactCompleted(module, input)) {
          continue;
        }
        const paused = await this.deps.runtimeOrchestrator.runStepModule({
          module,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: approval.approveCurrentGate,
          approveAutoExecutionScope: approval.approveAutoExecutionScope,
        });
        if (paused) {
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

      await this.runStructuredOutlineFactModules(input);
      await this.maybeRunAutoApprovedChapters(input);
      return;
    }
  }

  private async isModuleFactCompleted(
    module: WorkflowStepModuleDescriptor,
    input: Pick<DirectorPipelineRunInput, "taskId" | "novelId">,
  ): Promise<boolean> {
    if (isExecutableWorkflowStepModule(module)) {
      const facts = await inspectWorkflowStepFacts(module, {
        taskId: input.taskId,
        novelId: input.novelId,
      });
      return facts.completed;
    }
    return false;
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

  private async runStructuredOutlineFactModules(
    input: DirectorPipelineRunInput,
  ): Promise<void> {
    const currentWorkspace = await this.loadVolumeWorkspaceForOutline(input.novelId);
    if (!currentWorkspace) {
      return;
    }
    await this.assertOutlineStartAllowed(input, currentWorkspace);
    const modules = getDirectorStructuredOutlineStepModules();
    const approval = this.resolveRuntimeApproval(input, "structured_outline_ready");
    for (const module of modules) {
      if (await this.isModuleFactCompleted(module, input)) {
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

  async loadVolumeWorkspaceForOutline(novelId: string): Promise<VolumePlanDocument | null> {
    const workspace = await this.deps.volumeService.getVolumes(novelId).catch(() => null);
    if (!workspace?.volumes.length || !workspace.strategyPlan) {
      return null;
    }
    return workspace;
  }

  private async maybeRunAutoApprovedChapters(input: DirectorPipelineRunInput): Promise<void> {
    if (!this.shouldAutoApproveCheckpoint(input.input, "front10_ready")) {
      return;
    }
    await recordAutoDirectorAutoApprovalFromTask({
      taskId: input.taskId,
      checkpointType: "front10_ready",
    });
    const approval = this.resolveRuntimeApproval(input, "structured_outline_ready");
    await this.deps.runtimeOrchestrator.runChapterExecutionNode({
      taskId: input.taskId,
      novelId: input.novelId,
      request: input.input,
      resumeCheckpointType: "front10_ready",
      approveCurrentGate: approval.approveCurrentGate,
      approveAutoExecutionScope: approval.approveAutoExecutionScope,
    });
  }

  private async resolveSafePipelineStartPhase(input: {
    novelId: string;
    requestedPhase: Exclude<DirectorPipelinePhase, "book_contract">;
  }): Promise<DirectorPipelinePhase> {
    const [workspace, storyMacroPlan, bookContract, characters] = await Promise.all([
      this.deps.volumeService.getVolumes(input.novelId).catch(() => null),
      this.deps.storyMacroService.getPlan(input.novelId).catch(() => null),
      this.deps.bookContractService.getByNovelId(input.novelId).catch(() => null),
      this.deps.novelContextService.listCharacters(input.novelId).catch(() => []),
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
      hasCharacters: characters.length > 0,
      hasVolumeWorkspace: Boolean(workspace?.volumes.length),
      hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
    });
  }

  private shouldAutoApproveCheckpoint(
    input: DirectorConfirmRequest,
    checkpointType: "front10_ready" | "chapter_batch_ready" | "replan_required",
  ): boolean {
    if (Object.prototype.hasOwnProperty.call(input, "autoApproval")) {
      return shouldAutoApproveDirectorCheckpoint(
        normalizeDirectorAutoApprovalConfig(input.autoApproval),
        checkpointType,
      );
    }
    return checkpointType === "front10_ready" && isDirectorAutoExecutionRunMode(normalizeDirectorRunMode(input.runMode));
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
  ): Promise<boolean> {
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
  ): Promise<boolean> {
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
