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
  await callbacks.markDirectorTaskRunning(
    taskId,
    "story_macro",
    "story_macro",
    "正在生成故事宏观规划",
    DIRECTOR_PROGRESS.storyMacro,
  );
  const storyMacroPlan = await dependencies.storyMacroService.decompose(novelId, storyInput, request);
  await callbacks.markDirectorTaskRunning(
    taskId,
    "story_macro",
    "constraint_engine",
    "正在构建约束引擎",
    DIRECTOR_PROGRESS.constraintEngine,
  );
  const hydratedStoryMacroPlan = await ensureDirectorConstraintEngine(
    dependencies.storyMacroService,
    novelId,
    storyMacroPlan,
  );
  const bookContractDraft = await generateDirectorBookContract({
    request,
    novelId,
    storyMacroService: dependencies.storyMacroService,
    storyMacroPlan: hydratedStoryMacroPlan,
  });
  await dependencies.bookContractService.upsert(novelId, bookContractDraft);
}
