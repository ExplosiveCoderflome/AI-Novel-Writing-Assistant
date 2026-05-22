import type { LLMGenerateOptions } from "../novelCoreShared";
import type { NovelCoreService } from "../NovelCoreService";
import {
  novelProductionOrchestrator,
  type NovelProductionStageRunner,
  type RunNovelStageInput,
  type NovelStageRunResult,
} from "./NovelProductionOrchestrator";

interface ReplanNovelInput extends LLMGenerateOptions {
  chapterId?: string;
  triggerType?: string;
  sourceIssueIds?: string[];
  windowSize?: number;
  reason: string;
}

interface QualityRepairPayload {
  mode: "replan_novel";
  input: ReplanNovelInput;
}

export interface QualityRepairStageRunnerDeps {
  getCore: () => Pick<NovelCoreService, "replanNovel">;
}

function isQualityRepairPayload(value: unknown): value is QualityRepairPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const mode = (value as { mode?: unknown }).mode;
  const input = (value as { input?: unknown }).input;
  return mode === "replan_novel"
    && Boolean(input)
    && typeof input === "object"
    && typeof (input as { reason?: unknown }).reason === "string";
}

export class QualityRepairStageRunner implements NovelProductionStageRunner {
  constructor(private readonly deps: QualityRepairStageRunnerDeps) {}

  async run(input: RunNovelStageInput): Promise<NovelStageRunResult> {
    if (!isQualityRepairPayload(input.payload)) {
      return {
        stage: "quality_repair",
        status: "checkpoint",
        summary: "Quality repair stage was triggered without a valid repair payload.",
      };
    }

    const result = await this.deps.getCore().replanNovel(input.novelId, input.payload.input);
    return {
      stage: "quality_repair",
      status: "completed",
      summary: `Novel replan for ${input.novelId} has been generated through the unified production orchestrator.`,
      nextStage: "chapter_preparation",
      payload: result,
    };
  }
}

export function registerQualityRepairStageRunner(deps: QualityRepairStageRunnerDeps): void {
  novelProductionOrchestrator.register("quality_repair", new QualityRepairStageRunner(deps));
}
