import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildDirectorBookContractContextBlocks,
  directorBookContractPrompt,
} from "../../../prompting/prompts/novel/directorPlanning.prompts";
import { BookContractService } from "../BookContractService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  buildStoryInput,
  normalizeBookContract,
  toBookSpec,
} from "./novelDirectorHelpers";
import { runDirectorTrackedStep } from "./directorProgressTracker";
import {
  DIRECTOR_PROGRESS,
  type DirectorProgressItemKey,
} from "./novelDirectorProgress";

type DirectorStoryMacroStage = "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";

interface DirectorStoryMacroDependencies {
  storyMacroService: StoryMacroPlanService;
  bookContractService: BookContractService;
}

interface DirectorStoryMacroCallbacks {
  markDirectorTaskRunning: (
    taskId: string,
    stage: DirectorStoryMacroStage,
    itemKey: DirectorProgressItemKey,
    itemLabel: string,
    progress: number,
  ) => Promise<void>;
}

async function ensureDirectorConstraintEngine(
  storyMacroService: StoryMacroPlanService,
  novelId: string,
  plan: StoryMacroPlan,
): Promise<StoryMacroPlan> {
  if (plan.constraintEngine) {
    return plan;
  }

  try {
    return await storyMacroService.buildConstraintEngine(novelId);
  } catch {
    return plan;
  }
}

async function generateDirectorBookContract(input: {
  request: DirectorConfirmRequest;
  novelId: string;
  storyMacroService: StoryMacroPlanService;
  storyMacroPlan: StoryMacroPlan | null;
}): Promise<BookContractDraft> {
  const { request, storyMacroPlan } = input;
  const bookSpec = toBookSpec(request.candidate, request.idea, request.estimatedChapterCount);
  const storyInput = buildStoryInput(request, bookSpec);
  const requestedTemperature = request.temperature ?? 0.4;
  const temperature = Math.min(requestedTemperature, 0.4);
  const parsed = await runStructuredPrompt({
    asset: directorBookContractPrompt,
    promptInput: {
      idea: storyInput,
      context: request,
      candidate: request.candidate,
      storyMacroPlan,
      targetChapterCount: request.estimatedChapterCount ?? bookSpec.targetChapterCount,
    },
    contextBlocks: buildDirectorBookContractContextBlocks({
      idea: storyInput,
      context: request,
      candidate: request.candidate,
      storyMacroPlan,
      targetChapterCount: request.estimatedChapterCount ?? bookSpec.targetChapterCount,
    }),
    options: {
      provider: request.provider,
      model: request.model,
      temperature,
    },
  });
  return normalizeBookContract(parsed.output);
}

export async function runDirectorStoryMacroPhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  dependencies: DirectorStoryMacroDependencies;
  callbacks: DirectorStoryMacroCallbacks;
}): Promise<void> {
  const { taskId, novelId, request, dependencies, callbacks } = input;
  const bookSpec = toBookSpec(request.candidate, request.idea, request.estimatedChapterCount);
  const storyInput = buildStoryInput(request, bookSpec);
  const storyMacroPlan = await runDirectorTrackedStep({
    taskId,
    stage: "story_macro",
    itemKey: "story_macro",
    itemLabel: "正在生成故事宏观规划",
    progress: DIRECTOR_PROGRESS.storyMacro,
    callbacks,
    run: async () => dependencies.storyMacroService.decompose(novelId, storyInput, request),
  });
  const hydratedStoryMacroPlan = await runDirectorTrackedStep({
    taskId,
    stage: "story_macro",
    itemKey: "constraint_engine",
    itemLabel: "正在构建约束引擎",
    progress: DIRECTOR_PROGRESS.constraintEngine,
    callbacks,
    run: async () => ensureDirectorConstraintEngine(
      dependencies.storyMacroService,
      novelId,
      storyMacroPlan,
    ),
  });
  const bookContractDraft = await runDirectorTrackedStep({
    taskId,
    stage: "story_macro",
    itemKey: "book_contract",
    itemLabel: "正在生成 Book Contract",
    progress: DIRECTOR_PROGRESS.bookContract,
    callbacks,
    run: async () => generateDirectorBookContract({
      request,
      novelId,
      storyMacroService: dependencies.storyMacroService,
      storyMacroPlan: hydratedStoryMacroPlan,
    }),
  });
  await dependencies.bookContractService.upsert(novelId, bookContractDraft);
}
