import type { NovelControlPolicy } from "@ai-novel/shared/types/canonicalState";
import type { ChapterRuntimeRequestInput } from "../runtime/chapterRuntimeSchema";
import { ChapterRuntimeCoordinator } from "../runtime/ChapterRuntimeCoordinator";
import type { PipelineRunOptions } from "../novelCoreShared";
import type { NovelCoreService } from "../NovelCoreService";
import {
  novelProductionOrchestrator,
  type NovelProductionStageRunner,
  type RunNovelStageInput,
  type NovelStageRunResult,
} from "./NovelProductionOrchestrator";

interface ChapterExecutionSingleChapterPayload {
  mode: "single_chapter_stream";
  chapterId: string;
  options?: ChapterRuntimeRequestInput;
  includeRuntimePackage?: boolean;
}

interface ChapterExecutionPipelinePayload {
  mode: "pipeline_job";
  options: PipelineRunOptions;
}

type ChapterExecutionStagePayload =
  | ChapterExecutionSingleChapterPayload
  | ChapterExecutionPipelinePayload;

export interface ChapterExecutionStageRunnerDeps {
  getCore: () => Pick<
    NovelCoreService,
    "findActivePipelineJobForRange" | "resumePipelineJob" | "createNovelSnapshot" | "startPipelineJob"
  >;
  getCoordinator: () => Pick<ChapterRuntimeCoordinator, "createChapterStream">;
}

export function buildManualProductionControlPolicy(): NovelControlPolicy {
  return {
    kickoffMode: "manual_start",
    advanceMode: "manual",
    reviewCheckpoints: [],
  };
}

export function buildManualChapterControlPolicy(): NovelControlPolicy {
  return buildManualProductionControlPolicy();
}

export function buildPipelineExecutionControlPolicy(kickoffMode: NovelControlPolicy["kickoffMode"] = "manual_start"): NovelControlPolicy {
  return {
    kickoffMode,
    advanceMode: "auto_to_execution",
    reviewCheckpoints: ["chapter_batch"],
  };
}

function isChapterExecutionStagePayload(value: unknown): value is ChapterExecutionStagePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const mode = (value as { mode?: unknown }).mode;
  return mode === "single_chapter_stream" || mode === "pipeline_job";
}

export class ChapterExecutionStageRunner implements NovelProductionStageRunner {
  constructor(private readonly deps: ChapterExecutionStageRunnerDeps) {}

  async run(input: RunNovelStageInput): Promise<NovelStageRunResult> {
    if (!isChapterExecutionStagePayload(input.payload)) {
      return {
        stage: "chapter_execution",
        status: "checkpoint",
        summary: "Chapter execution stage was triggered without a valid execution payload.",
      };
    }

    if (input.payload.mode === "single_chapter_stream") {
      const streamResult = await this.deps.getCoordinator().createChapterStream(
        input.novelId,
        input.payload.chapterId,
        input.payload.options ?? {},
        { includeRuntimePackage: input.payload.includeRuntimePackage ?? true },
      );
      return {
        stage: "chapter_execution",
        status: input.policy.advanceMode === "manual" ? "checkpoint" : "completed",
        summary: `Chapter ${input.payload.chapterId} execution has been delegated to the unified production orchestrator.`,
        payload: streamResult,
        nextStage: "quality_repair",
      };
    }

    const core = this.deps.getCore();
    const existing = await core.findActivePipelineJobForRange(
      input.novelId,
      input.payload.options.startOrder,
      input.payload.options.endOrder,
    );
    if (existing) {
      await core.resumePipelineJob(existing.id);
      return {
        stage: "chapter_execution",
        status: "completed",
        summary: `Reused active pipeline job ${existing.id} through the unified production orchestrator.`,
        payload: existing,
        nextStage: "quality_repair",
      };
    }

    await core.createNovelSnapshot(input.novelId, "before_pipeline", `before-pipeline-${Date.now()}`);
    const job = await core.startPipelineJob(input.novelId, input.payload.options);
    return {
      stage: "chapter_execution",
      status: "completed",
      summary: `Started pipeline job ${job.id} through the unified production orchestrator.`,
      payload: job,
      nextStage: "quality_repair",
    };
  }
}

export function registerChapterExecutionStageRunner(deps: ChapterExecutionStageRunnerDeps): void {
  novelProductionOrchestrator.register("chapter_execution", new ChapterExecutionStageRunner(deps));
}
