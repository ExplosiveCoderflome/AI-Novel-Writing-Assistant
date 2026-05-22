import type { LLMGenerateOptions, RepairOptions } from "../novelCoreShared";
import type { NovelCoreService } from "../NovelCoreService";
import type { ChapterRuntimeCoordinator } from "../runtime/ChapterRuntimeCoordinator";
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

interface RepairChapterStreamPayload {
  mode: "repair_chapter_stream";
  chapterId: string;
  options?: RepairOptions;
}

type QualityRepairStagePayload = QualityRepairPayload | RepairChapterStreamPayload;

export interface QualityRepairStageRunnerDeps {
  getCore: () => Pick<NovelCoreService, "replanNovel">;
  getCoordinator: () => Pick<ChapterRuntimeCoordinator, "createRepairStream">;
}

function isReplanNovelPayload(value: unknown): value is QualityRepairPayload {
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

function isRepairChapterStreamPayload(value: unknown): value is RepairChapterStreamPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const mode = (value as { mode?: unknown }).mode;
  const chapterId = (value as { chapterId?: unknown }).chapterId;
  return mode === "repair_chapter_stream" && typeof chapterId === "string" && chapterId.trim().length > 0;
}

function isQualityRepairPayload(value: unknown): value is QualityRepairStagePayload {
  return isReplanNovelPayload(value) || isRepairChapterStreamPayload(value);
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

    if (input.payload.mode === "repair_chapter_stream") {
      const streamResult = await this.deps.getCoordinator().createRepairStream(
        input.novelId,
        input.payload.chapterId,
        input.payload.options ?? {},
      );
      return {
        stage: "quality_repair",
        status: input.policy.advanceMode === "manual" ? "checkpoint" : "completed",
        summary: `Chapter ${input.payload.chapterId} repair has been delegated to the unified production orchestrator.`,
        payload: streamResult,
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
