import type { CharacterCastOption } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { CharacterPreparationService } from "../novel/characterPrep/CharacterPreparationService";
import { generateAutoCharacterCastDraft, persistCharacterCastOptionsDraft } from "../novel/characterPrep/characterCastGeneration";
import type { CharacterDynamicsService } from "../novel/dynamics/CharacterDynamicsService";
import type { NovelContextService } from "../novel/NovelContextService";
import type { StoryMacroPlanService } from "../novel/storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../novel/volume/NovelVolumeService";
import type { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import type { BookContractService } from "../novel/BookContractService";
import { runDirectorCharacterSetupPhase, runDirectorStructuredOutlinePhase, runDirectorVolumeStrategyPhase } from "./pipelinePhases";
import { runDirectorStoryMacroPhase } from "./storyMacroPhase";

export interface DirectorPhaseExecutionDeps {
  workflowService: NovelWorkflowService;
  novelContextService: NovelContextService;
  characterDynamicsService: CharacterDynamicsService;
  characterPreparationService: CharacterPreparationService;
  volumeService: NovelVolumeService;
  storyMacroService: StoryMacroPlanService;
  bookContractService: BookContractService;
}

export interface DirectorPhaseExecutionCallbacks {
  buildDirectorSeedPayload: (request: DirectorConfirmRequest, novelId: string | null, extra?: Record<string, unknown>) => Record<string, unknown>;
  markDirectorTaskRunning: (
    taskId: string,
    stage: "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
    itemKey: string,
    itemLabel: string,
    progress: number,
    options?: {
      chapterId?: string | null;
      volumeId?: string | null;
    },
  ) => Promise<void>;
}

export async function findReusableDirectorCharacterCastOption(
  deps: DirectorPhaseExecutionDeps,
  targetNovelId: string,
): Promise<CharacterCastOption | null> {
  const [existingOptions, existingCharacters] = await Promise.all([
    deps.characterPreparationService.listCharacterCastOptions(targetNovelId),
    deps.novelContextService.listCharacters(targetNovelId).catch(() => []),
  ]);
  const appliedOption = existingOptions.find((option) => option.status === "applied") ?? null;
  if (appliedOption) {
    return existingCharacters.length > 0
      ? appliedOption
      : { ...appliedOption, status: "draft" };
  }
  return existingOptions[0] ?? null;
}

export function buildDirectorCharacterPreparationService(deps: DirectorPhaseExecutionDeps) {
  return {
    generateAutoCharacterCastOption: async (targetNovelId: string, options: {
      provider?: DirectorConfirmRequest["provider"];
      model?: string;
      temperature?: number;
      storyInput?: string;
    }) => {
      const reusableOption = await findReusableDirectorCharacterCastOption(deps, targetNovelId);
      if (reusableOption) {
        return reusableOption;
      }
      const generated = await generateAutoCharacterCastDraft(targetNovelId, options);
      await persistCharacterCastOptionsDraft(targetNovelId, generated.storyInput, {
        options: [generated.parsed.option],
      });
      const [persistedOption] = await deps.characterPreparationService.listCharacterCastOptions(targetNovelId);
      if (!persistedOption) {
        throw new Error("Auto director character cast option was not persisted.");
      }
      return persistedOption;
    },
    assessCharacterCastOptions: (...args: Parameters<CharacterPreparationService["assessCharacterCastOptions"]>) => (
      deps.characterPreparationService.assessCharacterCastOptions(...args)
    ),
    applyCharacterCastOption: (...args: Parameters<CharacterPreparationService["applyCharacterCastOption"]>) => (
      deps.characterPreparationService.applyCharacterCastOption(...args)
    ),
    findReusableCharacterCastOption: (targetNovelId: string) => findReusableDirectorCharacterCastOption(deps, targetNovelId),
  };
}

export async function runStoryMacroPhase(
  deps: DirectorPhaseExecutionDeps,
  callbacks: DirectorPhaseExecutionCallbacks,
  taskId: string,
  novelId: string,
  input: DirectorConfirmRequest,
): Promise<void> {
  await runDirectorStoryMacroPhase({
    taskId,
    novelId,
    request: input,
    dependencies: {
      storyMacroService: deps.storyMacroService,
      bookContractService: deps.bookContractService,
    },
    callbacks: {
      markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, _options) => (
        callbacks.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress)
      ),
    },
  });
}

export async function runCharacterSetupPhase(
  deps: DirectorPhaseExecutionDeps,
  callbacks: DirectorPhaseExecutionCallbacks,
  taskId: string,
  novelId: string,
  input: DirectorConfirmRequest,
): Promise<boolean> {
  return runDirectorCharacterSetupPhase({
    taskId,
    novelId,
    request: input,
    dependencies: {
      workflowService: deps.workflowService,
      novelContextService: deps.novelContextService,
      characterDynamicsService: deps.characterDynamicsService,
      characterPreparationService: buildDirectorCharacterPreparationService(deps),
      volumeService: deps.volumeService,
    },
    callbacks: {
      buildDirectorSeedPayload: (request, takeoverNovelId, extra) => callbacks.buildDirectorSeedPayload(request, takeoverNovelId, extra),
      markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
        callbacks.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, options)
      ),
    },
  });
}

export async function runVolumeStrategyPhase(
  deps: DirectorPhaseExecutionDeps,
  callbacks: DirectorPhaseExecutionCallbacks,
  taskId: string,
  novelId: string,
  input: DirectorConfirmRequest,
) {
  return runDirectorVolumeStrategyPhase({
    taskId,
    novelId,
    request: input,
    dependencies: {
      workflowService: deps.workflowService,
      novelContextService: deps.novelContextService,
      characterDynamicsService: deps.characterDynamicsService,
      characterPreparationService: buildDirectorCharacterPreparationService(deps),
      volumeService: deps.volumeService,
    },
    callbacks: {
      buildDirectorSeedPayload: (request, takeoverNovelId, extra) => callbacks.buildDirectorSeedPayload(request, takeoverNovelId, extra),
      markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
        callbacks.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, options)
      ),
    },
  });
}

export async function runStructuredOutlinePhase(
  deps: DirectorPhaseExecutionDeps,
  callbacks: DirectorPhaseExecutionCallbacks,
  taskId: string,
  novelId: string,
  input: DirectorConfirmRequest,
  baseWorkspace: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>,
) {
  await runDirectorStructuredOutlinePhase({
    taskId,
    novelId,
    request: input,
    baseWorkspace,
    dependencies: {
      workflowService: deps.workflowService,
      novelContextService: deps.novelContextService,
      characterDynamicsService: deps.characterDynamicsService,
      characterPreparationService: buildDirectorCharacterPreparationService(deps),
      volumeService: deps.volumeService,
    },
    callbacks: {
      buildDirectorSeedPayload: (request, takeoverNovelId, extra) => callbacks.buildDirectorSeedPayload(request, takeoverNovelId, extra),
      markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
        callbacks.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, options)
      ),
    },
  });
}
