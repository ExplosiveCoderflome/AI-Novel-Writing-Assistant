import type { NovelControlPolicy } from "@ai-novel/shared/types/canonicalState";

export type NovelProductionStage =
  | "project_framing"
  | "story_macro"
  | "book_contract"
  | "character_prep"
  | "volume_planning"
  | "chapter_preparation"
  | "chapter_execution"
  | "quality_repair";

export interface RunNovelStageInput {
  novelId: string;
  stage: NovelProductionStage;
  policy: NovelControlPolicy;
  trigger?: string | null;
  payload?: Record<string, unknown>;
}

export interface NovelStageRunResult {
  stage: NovelProductionStage;
  status: "completed" | "checkpoint";
  summary: string;
  nextStage?: NovelProductionStage | null;
  payload?: unknown;
}

export interface NovelProductionStageRunner {
  run(input: RunNovelStageInput): Promise<NovelStageRunResult>;
}

export interface NovelProductionOrchestratorDeps {
  runners?: Partial<Record<NovelProductionStage, NovelProductionStageRunner>>;
}

function defaultNextStage(stage: NovelProductionStage): NovelProductionStage | null {
  switch (stage) {
    case "project_framing":
      return "story_macro";
    case "story_macro":
      return "book_contract";
    case "book_contract":
      return "character_prep";
    case "character_prep":
      return "volume_planning";
    case "volume_planning":
      return "chapter_preparation";
    case "chapter_preparation":
      return "chapter_execution";
    case "chapter_execution":
      return "quality_repair";
    case "quality_repair":
      return null;
    default:
      return null;
  }
}

export class NovelProductionOrchestrator {
  private readonly runners: Partial<Record<NovelProductionStage, NovelProductionStageRunner>>;

  constructor(deps: NovelProductionOrchestratorDeps = {}) {
    this.runners = deps.runners ?? {};
  }

  register(stage: NovelProductionStage, runner: NovelProductionStageRunner): void {
    this.runners[stage] = runner;
  }

  async runStage(input: RunNovelStageInput): Promise<NovelStageRunResult> {
    const runner = this.runners[input.stage];
    if (!runner) {
      return {
        stage: input.stage,
        status: input.policy.advanceMode === "manual" ? "checkpoint" : "completed",
        summary: `Stage ${input.stage} is registered in the unified orchestrator contract but not wired yet.`,
        nextStage: defaultNextStage(input.stage),
      };
    }
    return runner.run(input);
  }
}

export const novelProductionOrchestrator = new NovelProductionOrchestrator();
