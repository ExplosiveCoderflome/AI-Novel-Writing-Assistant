import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { PipelineRunMode } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";

export interface DirectorAutoExecutionRange {
  startOrder: number;
  endOrder: number;
  totalChapterCount: number;
  firstChapterId: string | null;
}

interface ChapterRef {
  id: string;
  order: number;
}

export function resolveDirectorAutoExecutionRange(
  chapters: ChapterRef[],
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

export function buildDirectorAutoExecutionPipelineOptions(input: {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
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
  stage: NovelWorkflowStage;
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
