import type { CharacterCastOption } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import type { NovelContextService } from "../NovelContextService";
import type { NovelVolumeService } from "../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import type { DirectorProgressItemKey } from "./novelDirectorProgress";

export type DirectorMutatingStage =
  | "auto_director"
  | "story_macro"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline";

export interface DirectorProgressLocationOptions {
  chapterId?: string | null;
  volumeId?: string | null;
}

export type DirectorMarkTaskRunningCallback = (
  taskId: string,
  stage: DirectorMutatingStage,
  itemKey: DirectorProgressItemKey,
  itemLabel: string,
  progress: number,
  options?: DirectorProgressLocationOptions,
) => Promise<void>;

export interface DirectorPhaseDependencies {
  workflowService: NovelWorkflowService;
  novelContextService: NovelContextService;
  characterDynamicsService: {
    rebuildDynamics: (novelId: string, options?: { sourceType?: string }) => Promise<unknown>;
  };
  characterPreparationService: {
    generateAutoCharacterCastOption: (novelId: string, input: {
      provider?: DirectorConfirmRequest["provider"];
      model?: string;
      temperature?: number;
      storyInput?: string;
    }) => Promise<CharacterCastOption>;
    assessCharacterCastOptions: (
      castOptions: CharacterCastOption[],
      storyInput: string,
    ) => ReturnType<CharacterPreparationService["assessCharacterCastOptions"]>;
    applyCharacterCastOption: (
      novelId: string,
      optionId: string,
    ) => ReturnType<CharacterPreparationService["applyCharacterCastOption"]>;
  };
  volumeService: NovelVolumeService;
}

export interface DirectorPhaseCallbacks {
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string | null,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  markDirectorTaskRunning: DirectorMarkTaskRunningCallback;
}
