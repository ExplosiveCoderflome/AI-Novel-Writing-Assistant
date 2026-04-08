import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  ChapterGenerationState,
  PipelineJobStatus,
  PipelineRunMode,
} from "@ai-novel/shared/types/novel";
import type {
  DirectorAutoExecutionPlan,
  DirectorAutoExecutionState,
} from "@ai-novel/shared/types/novelDirector";
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

export function normalizeDirectorAutoExecutionPlan(
  plan: DirectorAutoExecutionPlan | null | undefined,
): DirectorAutoExecutionPlan {
  if (plan?.mode === "chapter_range") {
    const startOrder = Math.max(1, Math.round(plan.startOrder ?? 1));
    const endOrder = Math.max(startOrder, Math.round(plan.endOrder ?? startOrder));
    return {
      mode: "chapter_range",
      startOrder,
      endOrder,
    };
  }
  if (plan?.mode === "volume") {
    return {
      mode: "volume",
      volumeOrder: Math.max(1, Math.round(plan.volumeOrder ?? 1)),
    };
  }
  return {
    mode: "front10",
  };
}

export function buildDirectorAutoExecutionScopeLabel(
  plan: DirectorAutoExecutionPlan | null | undefined,
  fallbackTotalChapterCount?: number | null,
  fallbackVolumeTitle?: string | null,
): string {
  const normalized = normalizeDirectorAutoExecutionPlan(plan);
  if (normalized.mode === "chapter_range") {
    if ((normalized.startOrder ?? 1) === (normalized.endOrder ?? 1)) {
      return `第 ${normalized.startOrder} 章`;
    }
    return `第 ${normalized.startOrder}-${normalized.endOrder} 章`;
  }
  if (normalized.mode === "volume") {
    const volumeLabel = fallbackVolumeTitle?.trim() ? ` · ${fallbackVolumeTitle.trim()}` : "";
    return `第 ${normalized.volumeOrder} 卷${volumeLabel}`;
  }
  return `前 ${Math.max(1, fallbackTotalChapterCount ?? 10)} 章`;
}

export function buildDirectorAutoExecutionScopeLabelFromState(
  state: DirectorAutoExecutionState | null | undefined,
  fallbackTotalChapterCount?: number | null,
): string {
  if (state?.scopeLabel?.trim()) {
    return state.scopeLabel.trim();
  }
  return buildDirectorAutoExecutionScopeLabel(state, fallbackTotalChapterCount ?? state?.totalChapterCount ?? null, state?.volumeTitle);
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
  plan?: DirectorAutoExecutionPlan | null;
  scopeLabel?: string | null;
  volumeTitle?: string | null;
  preparedVolumeIds?: string[];
  pipelineJobId?: string | null;
  pipelineStatus?: PipelineJobStatus | null;
}): DirectorAutoExecutionState {
  const plan = normalizeDirectorAutoExecutionPlan(input.plan);
  const selected = input.chapters
    .filter((chapter) => chapter.order >= input.range.startOrder && chapter.order <= input.range.endOrder)
    .sort((left, right) => left.order - right.order);
  const completed = selected.filter((chapter) => isDirectorAutoExecutionChapterCompleted(chapter.generationState));
  const remaining = selected.filter((chapter) => !isDirectorAutoExecutionChapterCompleted(chapter.generationState));
  const totalChapterCount = selected.length > 0 ? selected.length : input.range.totalChapterCount;
  return {
    enabled: true,
    mode: plan.mode,
    scopeLabel: input.scopeLabel?.trim() || buildDirectorAutoExecutionScopeLabel(plan, totalChapterCount, input.volumeTitle),
    volumeOrder: plan.mode === "volume" ? plan.volumeOrder : undefined,
    volumeTitle: input.volumeTitle ?? null,
    preparedVolumeIds: input.preparedVolumeIds ?? [],
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
  return `${buildDirectorAutoExecutionScopeLabelFromState(state)}自动执行已暂停`;
}

export function buildDirectorAutoExecutionPausedSummary(input: {
  scopeLabel: string;
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
  return `${input.scopeLabel}已进入自动执行，但当前批量任务未完全完成：${input.failureMessage} ${remainingSummary}${nextSummary}。`;
}

export function buildDirectorAutoExecutionCompletedLabel(scopeLabel: string): string {
  return `${scopeLabel}自动执行完成`;
}

export function buildDirectorAutoExecutionCompletedSummary(input: {
  title: string;
  scopeLabel: string;
}): string {
  return `《${input.title.trim() || "当前项目"}》已自动完成${input.scopeLabel}的章节执行与质量修复。`;
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
  state?: DirectorAutoExecutionState | null,
): {
  stage: "chapter_execution" | "quality_repair";
  itemKey: "chapter_execution" | "quality_repair";
  itemLabel: string;
  progress: number;
} {
  const chapterLabel = job.currentItemLabel?.trim()
    ? ` · ${job.currentItemLabel.trim()}`
    : "";
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(state, range.totalChapterCount);
  if (job.currentStage === "reviewing") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: `正在自动审校${scopeLabel}${chapterLabel}`,
      progress: Number((0.965 + ((job.progress ?? 0) * 0.02)).toFixed(4)),
    };
  }
  if (job.currentStage === "repairing") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: `正在自动修复${scopeLabel}${chapterLabel}`,
      progress: Number((0.975 + ((job.progress ?? 0) * 0.015)).toFixed(4)),
    };
  }
  return {
    stage: "chapter_execution",
    itemKey: "chapter_execution",
    itemLabel: `正在自动执行${scopeLabel}${chapterLabel}`,
    progress: Number((0.93 + ((job.progress ?? 0) * 0.035)).toFixed(4)),
  };
}
