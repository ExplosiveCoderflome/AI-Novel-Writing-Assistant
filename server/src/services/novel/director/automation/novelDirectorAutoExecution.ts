import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { NovelControlPolicy } from "@ai-novel/shared/types/canonicalState";
import type {
  ArtifactSyncMode,
  ChapterGenerationState,
  PipelineJobStatus,
  PipelineRunMode,
} from "@ai-novel/shared/types/novel";
import type {
  DirectorAutoExecutionPlan,
  DirectorAutoExecutionState,
} from "@ai-novel/shared/types/novelDirector";
import { parseChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import { resolveDirectorQualityLoopBudgetNextAction } from "../runtime/DirectorQualityLoopBudgetLedgerService";
import {
  buildPipelineBackgroundActivityLabels,
  parsePipelinePayload,
} from "../../pipelineJobState";
import { buildPipelineExecutionControlPolicy } from "../../production/ChapterExecutionStageRunner";
import {
  buildSkippableAutoExecutionReviewCheckpointSummary,
  isSkippableAutoExecutionReviewFailure,
} from "./novelDirectorAutoExecutionFailure";
export interface DirectorAutoExecutionRange {
  startOrder: number;
  endOrder: number;
  totalChapterCount: number;
  firstChapterId: string | null;
}

export interface DirectorAutoExecutionChapterRange {
  startOrder: number;
  endOrder: number;
}

export type DirectorAutoExecutionRepairMode = "light_repair" | "heavy_repair";

export const DIRECTOR_DEFAULT_RANGE_START_ORDER = 1;
export const DIRECTOR_DEFAULT_RANGE_END_ORDER = 10;

export interface DirectorAutoExecutionChapterRef {
  id: string;
  order: number;
  content?: string | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  targetWordCount?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  expectation?: string | null;
  generationState?: ChapterGenerationState | null;
  chapterStatus?: "unplanned" | "pending_generation" | "generating" | "pending_review" | "needs_repair" | "completed" | null;
}

export function normalizeDirectorAutoExecutionPlan(
  plan: DirectorAutoExecutionPlan | null | undefined,
): DirectorAutoExecutionPlan {
  const autoReview = plan?.autoReview ?? true;
  const autoRepair = autoReview ? (plan?.autoRepair ?? true) : false;
  const artifactSyncMode = plan?.artifactSyncMode ?? "adaptive";
  const rawMode = typeof (plan as { mode?: unknown } | null | undefined)?.mode === "string"
    ? (plan as { mode?: string }).mode
    : null;
  if (plan?.mode === "chapter_range") {
    const startOrder = Math.max(1, Math.round(plan.startOrder ?? 1));
    const endOrder = Math.max(startOrder, Math.round(plan.endOrder ?? startOrder));
    return {
      mode: "chapter_range",
      startOrder,
      endOrder,
      autoReview,
      autoRepair,
      artifactSyncMode,
    };
  }
  if (plan?.mode === "volume") {
    return {
      mode: "volume",
      volumeOrder: Math.max(1, Math.round(plan.volumeOrder ?? 1)),
      autoReview,
      autoRepair,
      artifactSyncMode,
    };
  }
  if (plan?.mode === "book") {
    return {
      mode: "book",
      autoReview,
      autoRepair,
      artifactSyncMode,
    };
  }
  const fallbackStartOrder = Math.max(
    DIRECTOR_DEFAULT_RANGE_START_ORDER,
    Math.round(plan?.startOrder ?? DIRECTOR_DEFAULT_RANGE_START_ORDER),
  );
  const fallbackEndOrder = Math.max(
    fallbackStartOrder,
    Math.round(plan?.endOrder ?? (rawMode ? fallbackStartOrder : DIRECTOR_DEFAULT_RANGE_END_ORDER)),
  );
  return {
    mode: "chapter_range",
    startOrder: fallbackStartOrder,
    endOrder: fallbackEndOrder,
    autoReview,
    autoRepair,
    artifactSyncMode,
  };
}

export function resolveDirectorAutoExecutionPlanChapterRange(
  plan: DirectorAutoExecutionPlan | null | undefined,
): DirectorAutoExecutionChapterRange | null {
  const normalized = normalizeDirectorAutoExecutionPlan(plan);
  if (normalized.mode === "volume" || normalized.mode === "book") {
    return null;
  }
  const startOrder = Math.max(
    DIRECTOR_DEFAULT_RANGE_START_ORDER,
    Math.round(normalized.startOrder ?? DIRECTOR_DEFAULT_RANGE_START_ORDER),
  );
  const endOrder = Math.max(
    startOrder,
    Math.round(normalized.endOrder ?? DIRECTOR_DEFAULT_RANGE_END_ORDER),
  );
  return {
    startOrder,
    endOrder,
  };
}

export function countDirectorAutoExecutionChapterRange(range: DirectorAutoExecutionChapterRange): number {
  return Math.max(1, range.endOrder - range.startOrder + 1);
}

export function buildDirectorAutoExecutionScopeLabel(
  plan: DirectorAutoExecutionPlan | null | undefined,
  fallbackTotalChapterCount?: number | null,
  fallbackVolumeTitle?: string | null,
): string {
  const normalized = normalizeDirectorAutoExecutionPlan(plan);
  if (normalized.mode === "book") {
    return "全书";
  }
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
  return `第 1-${Math.max(1, normalized.endOrder ?? fallbackTotalChapterCount ?? 10)} 章`;
}

export function resolveDirectorAutoExecutionBookRange(
  chapters: DirectorAutoExecutionChapterRef[],
): DirectorAutoExecutionRange | null {
  const selected = chapters
    .slice()
    .filter((chapter) => chapter.order >= DIRECTOR_DEFAULT_RANGE_START_ORDER)
    .sort((left, right) => left.order - right.order);
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
  const normalizedPreferredChapterCount = Math.max(1, Math.round(preferredChapterCount));
  const startOrder = DIRECTOR_DEFAULT_RANGE_START_ORDER;
  const endOrder = Math.max(startOrder, normalizedPreferredChapterCount);
  const selected = chapters
    .slice()
    .filter((chapter) => chapter.order >= startOrder && chapter.order <= endOrder)
    .sort((left, right) => left.order - right.order)
    .slice(0, normalizedPreferredChapterCount);
  if (selected.length === 0) {
    return null;
  }
  return {
    startOrder,
    endOrder,
    totalChapterCount: normalizedPreferredChapterCount,
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

function hasDirectorAutoExecutionChapterContent(chapter: DirectorAutoExecutionChapterRef): boolean {
  if (!Object.prototype.hasOwnProperty.call(chapter, "content")) {
    return true;
  }
  return typeof chapter.content === "string" && chapter.content.trim().length > 0;
}

function isDirectorAutoExecutionChapterCompleted(chapter: DirectorAutoExecutionChapterRef): boolean {
  if (!hasDirectorAutoExecutionChapterContent(chapter)) {
    return false;
  }
  return chapter.generationState === "approved"
    || chapter.generationState === "published"
    || chapter.chapterStatus === "completed";
}

export function isDirectorAutoExecutionChapterProcessed(chapter: DirectorAutoExecutionChapterRef): boolean {
  if (!hasDirectorAutoExecutionChapterContent(chapter)) {
    return false;
  }
  if (isDirectorAutoExecutionChapterCompleted(chapter)) {
    return true;
  }
  if (chapter.chapterStatus === "needs_repair") {
    return false;
  }
  if (chapter.chapterStatus === "pending_review") {
    return true;
  }
  return chapter.generationState === "reviewed" || chapter.generationState === "repaired";
}

export function canPreserveDirectorAutoExecutionSkippedChapter(chapter: DirectorAutoExecutionChapterRef): boolean {
  if (isDirectorAutoExecutionChapterProcessed(chapter)) {
    return true;
  }
  if (!hasDirectorAutoExecutionChapterContent(chapter)) {
    return false;
  }
  return chapter.chapterStatus === "needs_repair"
    && (chapter.generationState === "reviewed" || chapter.generationState === "repaired");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ));
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return Array.from(new Set(
    values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  )).sort((left, right) => left - right);
}

export function buildDirectorAutoExecutionDeferredQualityState(input: {
  state: DirectorAutoExecutionState;
  reason: string;
  source: NonNullable<DirectorAutoExecutionState["qualityDebtSummaries"]>[number]["source"];
  deferredAt?: string | Date;
}): DirectorAutoExecutionState {
  const chapterId = input.state.nextChapterId?.trim() || null;
  const chapterOrder = typeof input.state.nextChapterOrder === "number"
    ? input.state.nextChapterOrder
    : null;
  const deferredAt = input.deferredAt instanceof Date
    ? input.deferredAt.toISOString()
    : input.deferredAt ?? new Date().toISOString();
  const summaries = [
    ...(input.state.qualityDebtSummaries ?? []),
    {
      chapterId,
      chapterOrder,
      reason: input.reason.trim() || "自动成书已暂存本章质量问题，继续推进后续章节。",
      source: input.source,
      deferredAt,
    },
  ].slice(-40);
  return {
    ...input.state,
    skippedChapterIds: uniqueStrings([
      ...(input.state.skippedChapterIds ?? []),
      ...(chapterId ? [chapterId] : []),
    ]),
    skippedChapterOrders: uniqueNumbers([
      ...(input.state.skippedChapterOrders ?? []),
      ...(chapterOrder != null ? [chapterOrder] : []),
    ]),
    qualityDebtChapterIds: uniqueStrings([
      ...(input.state.qualityDebtChapterIds ?? []),
      ...(chapterId ? [chapterId] : []),
    ]),
    qualityDebtChapterOrders: uniqueNumbers([
      ...(input.state.qualityDebtChapterOrders ?? []),
      ...(chapterOrder != null ? [chapterOrder] : []),
    ]),
    qualityDebtSummaries: summaries,
    pipelineJobId: null,
    pipelineStatus: null,
  };
}

export function hasDirectorAutoExecutionChapterContract(chapter: DirectorAutoExecutionChapterRef): boolean {
  if (typeof chapter.conflictLevel !== "number" || typeof chapter.revealLevel !== "number" || typeof chapter.targetWordCount !== "number") {
    return false;
  }
  if (!chapter.mustAvoid?.trim() || !chapter.taskSheet?.trim()) {
    return false;
  }
  return Boolean(parseChapterScenePlan(chapter.sceneCards, {
    targetWordCount: chapter.targetWordCount,
  }));
}

export function hasDirectorSyncedChapterExecutionContext(chapter: DirectorAutoExecutionChapterRef): boolean {
  return typeof chapter.conflictLevel === "number"
    || typeof chapter.revealLevel === "number"
    || typeof chapter.targetWordCount === "number"
    || Boolean(chapter.mustAvoid?.trim())
    || Boolean(chapter.taskSheet?.trim())
    || Boolean(chapter.sceneCards?.trim())
    || Boolean(chapter.expectation?.trim());
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
  const skippedChapterIds = new Set((input.plan as DirectorAutoExecutionState | null | undefined)?.skippedChapterIds ?? []);
  const skippedChapterOrders = new Set((input.plan as DirectorAutoExecutionState | null | undefined)?.skippedChapterOrders ?? []);
  const qualityDebtChapterIds = new Set((input.plan as DirectorAutoExecutionState | null | undefined)?.qualityDebtChapterIds ?? []);
  const qualityDebtChapterOrders = new Set((input.plan as DirectorAutoExecutionState | null | undefined)?.qualityDebtChapterOrders ?? []);
  const selected = input.chapters
    .filter((chapter) => chapter.order >= input.range.startOrder && chapter.order <= input.range.endOrder)
    .sort((left, right) => left.order - right.order);
  const skipped = selected.filter((chapter) => {
    const isSkippedChapter = skippedChapterIds.has(chapter.id) || skippedChapterOrders.has(chapter.order);
    if (!isSkippedChapter) {
      return false;
    }
    const isQualityDebtChapter = qualityDebtChapterIds.has(chapter.id) || qualityDebtChapterOrders.has(chapter.order);
    return canPreserveDirectorAutoExecutionSkippedChapter(chapter)
      || (isQualityDebtChapter && hasDirectorAutoExecutionChapterContract(chapter));
  });
  const preservedSkippedChapterIds = new Set(skipped.map((chapter) => chapter.id));
  const preservedSkippedChapterOrders = new Set(skipped.map((chapter) => chapter.order));
  const actionable = selected.filter((chapter) => (
    !preservedSkippedChapterIds.has(chapter.id)
    && !preservedSkippedChapterOrders.has(chapter.order)
  ));
  const completed = actionable.filter((chapter) => isDirectorAutoExecutionChapterProcessed(chapter));
  const remaining = actionable.filter((chapter) => !isDirectorAutoExecutionChapterProcessed(chapter));
  const totalChapterCount = Math.max(input.range.totalChapterCount, selected.length);
  const preservedQualityDebt = skipped.filter((chapter) => (
    qualityDebtChapterIds.has(chapter.id) || qualityDebtChapterOrders.has(chapter.order)
  ));
  const preservedQualityDebtIds = new Set(preservedQualityDebt.map((chapter) => chapter.id));
  const preservedQualityDebtOrders = new Set(preservedQualityDebt.map((chapter) => chapter.order));
  const qualityDebtSummaries = ((input.plan as DirectorAutoExecutionState | null | undefined)?.qualityDebtSummaries ?? [])
    .filter((item) => (
      (item.chapterId ? preservedQualityDebtIds.has(item.chapterId) : false)
      || (typeof item.chapterOrder === "number" ? preservedQualityDebtOrders.has(item.chapterOrder) : false)
    ))
    .slice(-40);
  return {
    enabled: true,
    mode: plan.mode,
    autoReview: plan.autoReview ?? true,
    autoRepair: plan.autoReview === false ? false : (plan.autoRepair ?? true),
    artifactSyncMode: plan.artifactSyncMode ?? "adaptive",
    scopeLabel: input.scopeLabel?.trim() || buildDirectorAutoExecutionScopeLabel(plan, totalChapterCount, input.volumeTitle),
    volumeOrder: plan.mode === "volume" ? plan.volumeOrder : undefined,
    volumeTitle: input.volumeTitle ?? null,
    preparedVolumeIds: input.preparedVolumeIds ?? [],
    skippedChapterIds: skipped.map((chapter) => chapter.id),
    skippedChapterOrders: skipped.map((chapter) => chapter.order),
    qualityDebtChapterIds: preservedQualityDebt.map((chapter) => chapter.id),
    qualityDebtChapterOrders: preservedQualityDebt.map((chapter) => chapter.order),
    qualityDebtSummaries,
    qualityLoopLedger: (input.plan as DirectorAutoExecutionState | null | undefined)?.qualityLoopLedger ?? null,
    circuitBreaker: (input.plan as DirectorAutoExecutionState | null | undefined)?.circuitBreaker ?? null,
    firstChapterId: selected[0]?.id ?? input.range.firstChapterId,
    startOrder: input.range.startOrder,
    endOrder: input.range.endOrder,
    totalChapterCount,
    completedChapterCount: completed.length + skipped.length,
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
  if (isSkippableAutoExecutionReviewFailure(input.failureMessage)) {
    return buildSkippableAutoExecutionReviewCheckpointSummary({
      scopeLabel: input.scopeLabel,
      autoExecution: {
        remainingChapterCount: input.remainingChapterCount,
        nextChapterOrder: input.nextChapterOrder ?? null,
      },
    });
  }
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
  autoReview?: boolean;
  autoRepair?: boolean;
}): string {
  const completedScope = input.scopeLabel;
  const title = input.title.trim() || "当前项目";
  if (input.autoReview === false) {
    return `《${title}》已自动完成${completedScope}的章节执行，正文生成后未额外执行自动审核或修复。`;
  }
  if (input.autoRepair === false) {
    return `《${title}》已自动完成${completedScope}的章节执行与自动审核，未开启自动修复。`;
  }
  return `《${title}》已自动完成${completedScope}的章节执行、自动审核与修复。`;
}

export function buildDirectorAutoExecutionPipelineOptions(input: {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  workflowTaskId?: string;
  taskStyleProfileId?: string;
  controlAdvanceMode?: NovelControlPolicy["advanceMode"];
  startOrder: number;
  endOrder: number;
  runMode?: PipelineRunMode;
  autoReview?: boolean;
  autoRepair?: boolean;
  artifactSyncMode?: ArtifactSyncMode;
  repairMode?: DirectorAutoExecutionRepairMode;
}) {
  const autoReview = input.autoReview ?? true;
  return {
    startOrder: input.startOrder,
    endOrder: input.endOrder,
    controlPolicy: buildPipelineExecutionControlPolicy("director_start", input.controlAdvanceMode),
    maxRetries: 1,
    runMode: input.runMode ?? "fast",
    autoReview,
    autoRepair: autoReview ? (input.autoRepair ?? true) : false,
    skipCompleted: true,
    qualityThreshold: 75,
    repairMode: input.repairMode ?? "light_repair",
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    workflowTaskId: input.workflowTaskId,
    taskStyleProfileId: input.taskStyleProfileId,
    artifactSyncMode: input.artifactSyncMode ?? "adaptive",
  };
}

function qualityLoopEntryMatchesCurrentChapter(
  entry: NonNullable<DirectorAutoExecutionState["qualityLoopLedger"]>["entries"][number],
  state: DirectorAutoExecutionState,
): boolean {
  const chapterId = state.nextChapterId ?? null;
  const chapterOrder = state.nextChapterOrder ?? null;
  if (chapterId && entry.lastChapterId === chapterId) {
    return true;
  }
  if (typeof chapterOrder === "number" && entry.lastChapterOrder === chapterOrder) {
    return true;
  }

  const window = entry.affectedChapterWindow;
  if (chapterId && window.chapterIds?.includes(chapterId)) {
    return true;
  }
  if (typeof chapterOrder === "number") {
    if (window.chapterOrders?.includes(chapterOrder)) {
      return true;
    }
    if (
      typeof window.startOrder === "number"
      && typeof window.endOrder === "number"
      && chapterOrder >= window.startOrder
      && chapterOrder <= window.endOrder
    ) {
      return true;
    }
  }
  return !chapterId && typeof chapterOrder !== "number";
}

export function resolveDirectorAutoExecutionRepairMode(
  state: DirectorAutoExecutionState,
): DirectorAutoExecutionRepairMode {
  const entries = (state.qualityLoopLedger?.entries ?? [])
    .filter((entry) => qualityLoopEntryMatchesCurrentChapter(entry, state))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const nextAction = resolveDirectorQualityLoopBudgetNextAction(entries[0]);
  return nextAction === "auto_rewrite_chapter" ? "heavy_repair" : "light_repair";
}

export function resolveDirectorAutoExecutionWorkflowState(
  job: {
    progress: number;
    currentStage?: string | null;
    currentItemLabel?: string | null;
    payload?: string | null;
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
  const backgroundLabels = buildPipelineBackgroundActivityLabels(parsePipelinePayload(job.payload).backgroundSync);
  const activityLabel = backgroundLabels.length > 0
    ? ` · ${backgroundLabels.join(" / ")}`
    : "";
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(state, range.totalChapterCount);
  if (job.currentStage === "reviewing") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: `正在自动审校${scopeLabel}${chapterLabel}${activityLabel}`,
      progress: Number((0.965 + ((job.progress ?? 0) * 0.02)).toFixed(4)),
    };
  }
  if (job.currentStage === "repairing") {
    return {
      stage: "quality_repair",
      itemKey: "quality_repair",
      itemLabel: `正在自动修复${scopeLabel}${chapterLabel}${activityLabel}`,
      progress: Number((0.975 + ((job.progress ?? 0) * 0.015)).toFixed(4)),
    };
  }
  return {
    stage: "chapter_execution",
    itemKey: "chapter_execution",
    itemLabel: `正在自动执行${scopeLabel}${chapterLabel}${activityLabel}`,
    progress: Number((0.93 + ((job.progress ?? 0) * 0.035)).toFixed(4)),
  };
}
