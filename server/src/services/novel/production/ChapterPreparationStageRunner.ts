import type { LLMGenerateOptions } from "../novelCoreShared";
import type { NovelCoreService } from "../NovelCoreService";
import {
  novelProductionOrchestrator,
  type NovelProductionStageRunner,
  type RunNovelStageInput,
  type NovelStageRunResult,
} from "./NovelProductionOrchestrator";

interface ChapterPreparationPayload {
  mode: "generate_chapter_plan";
  chapterId: string;
  options?: LLMGenerateOptions;
}

export interface ChapterPreparationStageRunnerDeps {
  getCore: () => Pick<NovelCoreService, "generateChapterPlan">;
}

function isChapterPreparationPayload(value: unknown): value is ChapterPreparationPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (value as { mode?: unknown }).mode === "generate_chapter_plan"
    && typeof (value as { chapterId?: unknown }).chapterId === "string";
}

export class ChapterPreparationStageRunner implements NovelProductionStageRunner {
  constructor(private readonly deps: ChapterPreparationStageRunnerDeps) {}

  async run(input: RunNovelStageInput): Promise<NovelStageRunResult> {
    if (!isChapterPreparationPayload(input.payload)) {
      return {
        stage: "chapter_preparation",
        status: "checkpoint",
        summary: "Chapter preparation stage was triggered without a valid chapter plan payload.",
      };
    }

    const plan = await this.deps.getCore().generateChapterPlan(
      input.novelId,
      input.payload.chapterId,
      input.payload.options ?? {},
    );

    return {
      stage: "chapter_preparation",
      status: "completed",
      summary: `Chapter plan for ${input.payload.chapterId} has been generated through the unified production orchestrator.`,
      nextStage: "chapter_execution",
      payload: plan,
    };
  }
}

export function registerChapterPreparationStageRunner(deps: ChapterPreparationStageRunnerDeps): void {
  novelProductionOrchestrator.register("chapter_preparation", new ChapterPreparationStageRunner(deps));
}
