import type { CharacterCastOption, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import {
  normalizeDirectorAutoApprovalConfig,
  shouldAutoApproveDirectorCheckpoint,
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
import { runDirectorStoryMacroPhase } from "./novelDirectorStoryMacroPhase";
import type { NovelDirectorRuntimeOrchestrator } from "./novelDirectorRuntimeOrchestrator";
import { getDirectorPlanningStepModule } from "./workflowStepRuntime/directorWorkflowStepModules";

export interface DirectorPipelineRunInput {
  taskId: string;
  novelId: string;
  input: DirectorConfirmRequest;
  startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
  scope?: string | null;
  batchAlreadyStartedCount?: number;
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

    if (safeStartPhase === "story_macro") {
      const module = getDirectorPlanningStepModule("story_macro");
      await this.deps.runtimeOrchestrator.runStepModule({
        module,
        taskId: input.taskId,
        novelId: input.novelId,
        targetId: input.novelId,
        runner: () => this.runStoryMacroPhase(input.taskId, input.novelId, input.input),
      });
    }

    if (safeStartPhase === "story_macro" || safeStartPhase === "character_setup") {
      const module = getDirectorPlanningStepModule("character_setup");
      const paused = await this.deps.runtimeOrchestrator.runStepModule({
        module,
        taskId: input.taskId,
        novelId: input.novelId,
        targetId: input.novelId,
        runner: () => this.runCharacterSetupPhase(input.taskId, input.novelId, input.input),
      });
      if (paused) {
        return;
      }
    }

    if (
      safeStartPhase === "story_macro"
      || safeStartPhase === "character_setup"
      || safeStartPhase === "volume_strategy"
    ) {
      await this.runVolumeAndOutline(input);
      return;
    }

    await this.runOutlineFromCurrentWorkspace(input);
  }

  private async runVolumeAndOutline(input: DirectorPipelineRunInput): Promise<void> {
    const volumeStrategyModule = getDirectorPlanningStepModule("volume_strategy");
    const volumeWorkspace = await this.deps.runtimeOrchestrator.runStepModule({
      module: volumeStrategyModule,
      taskId: input.taskId,
      novelId: input.novelId,
      targetId: input.novelId,
      runner: () => this.runVolumeStrategyPhase(input.taskId, input.novelId, input.input),
    }) ?? await this.loadVolumeWorkspaceForOutline(input.novelId);
    if (!volumeWorkspace) {
      return;
    }
    await this.assertOutlineStartAllowed(input, volumeWorkspace);
    await this.runStructuredOutlineNode(input, volumeWorkspace);
    await this.maybeRunAutoApprovedChapters(input);
  }

  private async runOutlineFromCurrentWorkspace(input: DirectorPipelineRunInput): Promise<void> {
    const currentWorkspace = await this.deps.volumeService.getVolumes(input.novelId);
    await this.assertOutlineStartAllowed(input, currentWorkspace);
    await this.runStructuredOutlineNode(input, currentWorkspace);
    await this.maybeRunAutoApprovedChapters(input);
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

  private async runStructuredOutlineNode(
    input: DirectorPipelineRunInput,
    workspace: VolumePlanDocument,
  ): Promise<void> {
    const module = getDirectorPlanningStepModule("structured_outline");
    await this.deps.runtimeOrchestrator.runStepModule({
      module,
      taskId: input.taskId,
      novelId: input.novelId,
      targetId: input.novelId,
      runner: () => this.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, workspace),
    });
  }

  private async loadVolumeWorkspaceForOutline(novelId: string): Promise<VolumePlanDocument | null> {
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
    await this.deps.runtimeOrchestrator.runChapterExecutionNode({
      taskId: input.taskId,
      novelId: input.novelId,
      request: input.input,
      resumeCheckpointType: "front10_ready",
    });
  }

  private async resolveSafePipelineStartPhase(input: {
    novelId: string;
    requestedPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
  }): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> {
    const [workspace, storyMacroPlan, bookContract, characters] = await Promise.all([
      this.deps.volumeService.getVolumes(input.novelId).catch(() => null),
      this.deps.storyMacroService.getPlan(input.novelId).catch(() => null),
      this.deps.bookContractService.getByNovelId(input.novelId).catch(() => null),
      this.deps.novelContextService.listCharacters(input.novelId).catch(() => []),
    ]);
    return resolveSafeDirectorPipelineStartPhase({
      requestedPhase: input.requestedPhase,
      hasStoryMacroPlan: Boolean(storyMacroPlan),
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
    return checkpointType === "front10_ready" && normalizeDirectorRunMode(input.runMode) === "auto_to_execution";
  }

  private async runStoryMacroPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await runDirectorStoryMacroPhase({
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

  private async runStructuredOutlinePhase(
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
}
