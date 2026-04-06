import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  ChapterGenerationState,
  PipelineJobStatus,
  PipelineRunMode,
} from "@ai-novel/shared/types/novel";
import type { DirectorAutoExecutionState } from "@ai-novel/shared/types/novelDirector";
export interface DirectorAutoExecutionRange {
  startOrder: number;
  endOrder: number;
  totalChapterCount: number;
  firstChapterId: string | null;
}

export interface DirectorAutoExecutionChapterRef {
  id: string;
  order: number;
  generationState?: ChapterGenerationState | null;
}

export function resolveDirectorAutoExecutionRange(
  chapters: DirectorAutoExecutionChapterRef[],
  preferredChapterCount = 10,
): DirectorAutoExecutionRange | null {
  const selected = chapters
    .slice()
    .sort((left, right) => left.order - right.order)
    .slice(0, preferredChapterCount);
  if (selected.length === 0) {
    return null;
  }
  return {
    startOrder: selected[0].order,
    endOrder: selected[selected.length - 1].order,
    totalChapterCount: selected.length,
    firstChapterId: selected[0].id,
  };
}

export function resolveDirectorAutoExecutionRangeFromState(
  state: DirectorAutoExecutionState | null | undefined,
): DirectorAutoExecutionRange | null {
  if (
    !state?.enabled
    || typeof state.startOrder !== "number"
    || typeof state.endOrder !== "number"
  ) {
    return null;
  }
  return {
    startOrder: state.startOrder,
    endOrder: state.endOrder,
    totalChapterCount: Math.max(1, state.totalChapterCount ?? (state.endOrder - state.startOrder + 1)),
    firstChapterId: state.firstChapterId ?? null,
  };
}

function isDirectorAutoExecutionChapterCompleted(generationState?: ChapterGenerationState | null): boolean {
  return generationState === "approved" || generationState === "published";
}

export function buildDirectorAutoExecutionState(input: {
  range: DirectorAutoExecutionRange;
  chapters: DirectorAutoExecutionChapterRef[];
  pipelineJobId?: string | null;
  pipelineStatus?: PipelineJobStatus | null;
}): DirectorAutoExecutionState {
  const selected = input.chapters
    .filter((chapter) => chapter.order >= input.range.startOrder && chapter.order <= input.range.endOrder)
    .sort((left, right) => left.order - right.order);
  const completed = selected.filter((chapter) => isDirectorAutoExecutionChapterCompleted(chapter.generationState));
  const remaining = selected.filter((chapter) => !isDirectorAutoExecutionChapterCompleted(chapter.generationState));
  const totalChapterCount = selected.length > 0 ? selected.length : input.range.totalChapterCount;
  return {
    enabled: true,
    firstChapterId: selected[0]?.id ?? input.range.firstChapterId,
    startOrder: input.range.startOrder,
    endOrder: input.range.endOrder,
    totalChapterCount,
    completedChapterCount: completed.length,
    remainingChapterCount: remaining.length,
    remainingChapterIds: remaining.map((chapter) => chapter.id),
    remainingChapterOrders: remaining.map((chapter) => chapter.order),
    nextChapterId: remaining[0]?.id ?? null,
    nextChapterOrder: remaining[0]?.order ?? null,
    pipelineJobId: input.pipelineJobId ?? null,
    pipelineStatus: input.pipelineStatus ?? null,
  };
}

export function buildDirectorAutoExecutionPausedLabel(state: DirectorAutoExecutionState): string {
  return `前 ${state.totalChapterCount ?? 10} 章自动执行已暂停`;
}

export function buildDirectorAutoExecutionPausedSummary(input: {
  totalChapterCount: number;
  remainingChapterCount: number;
  nextChapterOrder?: number | null;
  failureMessage: string;
}): string {
  const remainingSummary = input.remainingChapterCount > 0
    ? `当前仍有 ${input.remainingChapterCount} 章待继续`
    : "当前批次已无待继续章节";
  const nextSummary = typeof input.nextChapterOrder === "number"
    ? `，建议从第 ${input.nextChapterOrder} 章继续`
    : "";
  return `前 ${input.totalChapterCount} 章已进入自动执行，但当前批量任务未完全完成：${input.failureMessage} ${remainingSummary}${nextSummary}。`;
}

export function buildDirectorAutoExecutionCompletedLabel(totalChapterCount: number): string {
  return `前 ${totalChapterCount} 章自动执行完成`;
}

export function buildDirectorAutoExecutionCompletedSummary(input: {
  title: string;
  totalChapterCount: number;
}): string {
  return `《${input.title.trim() || "当前项目"}》已自动完成前 ${input.totalChapterCount} 章章节执行与质量修复。`;
}

export function buildDirectorAutoExecutionPipelineOptions(input: {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  workflowTaskId?: string;
  startOrder: number;
  endOrder: number;
  runMode?: PipelineRunMode;
}) {
  return {
    startOrder: input.startOrder,
    endOrder: input.endOrder,
    maxRetries: 2,
    runMode: input.runMode ?? "fast",
    autoReview: true,
    autoRepair: true,
    skipCompleted: true,
    qualityThreshold: 75,
    repairMode: "light_repair" as const,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    workflowTaskId: input.workflowTaskId,
  };
}

export function resolveDirectorAutoExecutionWorkflowState(
  job: {
    progress: number;
    currentStage?: string | null;
    currentItemLabel?: string | null;
  },
  range: DirectorAutoExecutionRange,
): {
  stage: "chapter_execution" | "quality_repair";
  itemKey: "chapter_execution" | "quality_repair";
  itemLabel: string;
  progress: number;
} {
  const chapterLabel = job.currentItemLabel?.trim()
    ? ` · ${job.currentItemLabel.trim()}`
    : "";
  if (job.currentStage === "reviewing") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: `正在自动审校前 ${range.totalChapterCount} 章${chapterLabel}`,
      progress: Number((0.965 + ((job.progress ?? 0) * 0.02)).toFixed(4)),
    };
  }
  if (job.currentStage === "repairing") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: `正在自动修复前 ${range.totalChapterCount} 章${chapterLabel}`,
      progress: Number((0.975 + ((job.progress ?? 0) * 0.015)).toFixed(4)),
    };
  }
  return {
    stage: "chapter_execution",
    itemKey: "chapter_execution",
    itemLabel: `正在自动执行前 ${range.totalChapterCount} 章${chapterLabel}`,
    progress: Number((0.93 + ((job.progress ?? 0) * 0.035)).toFixed(4)),
  };
}
