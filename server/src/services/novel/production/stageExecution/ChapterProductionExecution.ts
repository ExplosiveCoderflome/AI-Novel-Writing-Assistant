import type { NovelProductionStage } from "../NovelProductionOrchestrator";

/**
 * A stable hand-off record for work that has been accepted by a production
 * stage but has not yet reached its chapter completion boundary. It deliberately
 * does not claim a content hash before the writer has saved the retained draft.
 */
export interface ChapterProductionExecution {
  contractVersion: 1;
  stage: Extract<NovelProductionStage, "chapter_execution" | "quality_repair">;
  mode: "chapter_stream" | "repair_stream" | "pipeline_job";
  lifecycle: "awaiting_stream_completion" | "queued" | "running";
  target: {
    novelId: string;
    chapterId?: string;
    pipelineJobId?: string;
    startOrder?: number;
    endOrder?: number;
  };
  artifactVersion: {
    kind: "retained_chapter_content" | "pipeline_job";
    contentHash: string | null;
    state: "not_persisted" | "owned_by_pipeline_job";
  };
  recovery: {
    action: "complete_stream_from_source_page" | "resume_pipeline_job";
    targetId: string;
  };
  budgetOwner: {
    kind: "chapter_runtime" | "pipeline_job";
    id: string | null;
  };
}

export function createChapterStreamExecution(input: {
  stage: "chapter_execution" | "quality_repair";
  novelId: string;
  chapterId: string;
}): ChapterProductionExecution {
  return {
    contractVersion: 1,
    stage: input.stage,
    mode: input.stage === "quality_repair" ? "repair_stream" : "chapter_stream",
    lifecycle: "awaiting_stream_completion",
    target: {
      novelId: input.novelId,
      chapterId: input.chapterId,
    },
    artifactVersion: {
      kind: "retained_chapter_content",
      contentHash: null,
      state: "not_persisted",
    },
    recovery: {
      action: "complete_stream_from_source_page",
      targetId: input.chapterId,
    },
    budgetOwner: {
      kind: "chapter_runtime",
      id: null,
    },
  };
}

export function createPipelineExecution(input: {
  novelId: string;
  pipelineJobId: string;
  startOrder: number;
  endOrder: number;
  lifecycle: "queued" | "running";
}): ChapterProductionExecution {
  return {
    contractVersion: 1,
    stage: "chapter_execution",
    mode: "pipeline_job",
    lifecycle: input.lifecycle,
    target: {
      novelId: input.novelId,
      pipelineJobId: input.pipelineJobId,
      startOrder: input.startOrder,
      endOrder: input.endOrder,
    },
    artifactVersion: {
      kind: "pipeline_job",
      contentHash: null,
      state: "owned_by_pipeline_job",
    },
    recovery: {
      action: "resume_pipeline_job",
      targetId: input.pipelineJobId,
    },
    budgetOwner: {
      kind: "pipeline_job",
      id: input.pipelineJobId,
    },
  };
}
