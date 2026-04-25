import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { PipelineJobStatus, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import {
  buildDirectorAutoExecutionScopeLabelFromState,
  buildDirectorAutoExecutionState,
  isDirectorAutoExecutionChapterProcessed,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionBookRange,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionRangeFromState,
  type DirectorAutoExecutionChapterRef,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import { isSkippableAutoExecutionReviewFailure } from "./novelDirectorAutoExecutionFailure";
import {
  flattenPreparedOutlineChapters,
  resolveStructuredOutlineRecoveryCursor,
} from "./novelDirectorStructuredOutlineRecovery";

interface DirectorAutoExecutionResolvedScope {
  range: DirectorAutoExecutionRange;
  scopeLabel?: string | null;
  volumeTitle?: string | null;
  preparedVolumeIds?: string[];
}

export interface AutoExecutionScopeRuntimeDeps {
  listChapters(novelId: string): Promise<DirectorAutoExecutionChapterRef[]>;
  getVolumes?: (novelId: string) => Promise<VolumePlanDocument>;
}

function findMissingChapterOrders(
  chapters: DirectorAutoExecutionChapterRef[],
  range: DirectorAutoExecutionRange,
): number[] {
  const chapterOrders = new Set(chapters.map((chapter) => chapter.order));
  const missing: number[] = [];
  for (let order = range.startOrder; order <= range.endOrder; order += 1) {
    if (!chapterOrders.has(order)) {
      missing.push(order);
    }
  }
  return missing;
}

export function applyReviewSkipOverride(input: {
  existingState?: DirectorAutoExecutionState | null;
  previousFailureMessage?: string | null;
  allowSkipReviewBlockedChapter?: boolean;
}): DirectorAutoExecutionState | null {
  if (
    !input.allowSkipReviewBlockedChapter
    || !input.existingState
    || !isSkippableAutoExecutionReviewFailure(input.previousFailureMessage)
  ) {
    return input.existingState ?? null;
  }

  const nextChapterId = input.existingState.nextChapterId?.trim() || null;
  const nextChapterOrder = typeof input.existingState.nextChapterOrder === "number"
    ? input.existingState.nextChapterOrder
    : null;
  if (!nextChapterId && nextChapterOrder == null) {
    return input.existingState;
  }

  const skippedChapterIds = Array.from(new Set(
    [
      ...(input.existingState.skippedChapterIds ?? []),
      ...(nextChapterId ? [nextChapterId] : []),
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  ));
  const skippedChapterOrders = Array.from(new Set(
    [
      ...(input.existingState.skippedChapterOrders ?? []),
      ...(typeof nextChapterOrder === "number" ? [nextChapterOrder] : []),
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  )).sort((left, right) => left - right);

  return {
    ...input.existingState,
    skippedChapterIds,
    skippedChapterOrders,
    pipelineJobId: null,
    pipelineStatus: null,
  };
}

export function buildRequestedAutoExecutionState(input: {
  request: DirectorConfirmRequest;
  existingState?: DirectorAutoExecutionState | null;
  existingPipelineJobId?: string | null;
}): DirectorAutoExecutionState | null {
  const requestedPlan = normalizeDirectorAutoExecutionPlan(input.request.autoExecutionPlan);
  const hasRequestedPlan = Boolean(input.request.autoExecutionPlan);
  if (!input.existingState) {
    return {
      enabled: true,
      mode: requestedPlan.mode,
      startOrder: requestedPlan.startOrder,
      endOrder: requestedPlan.endOrder,
      volumeOrder: requestedPlan.volumeOrder,
      autoReview: requestedPlan.autoReview,
      autoRepair: requestedPlan.autoRepair,
      pipelineJobId: input.existingPipelineJobId?.trim() || null,
      pipelineStatus: input.existingPipelineJobId ? "running" : null,
    };
  }

  const keepPipelineBinding = Boolean(input.existingPipelineJobId?.trim());
  if (!hasRequestedPlan) {
    return {
      ...input.existingState,
      pipelineJobId: keepPipelineBinding
        ? (input.existingPipelineJobId?.trim() || input.existingState.pipelineJobId || null)
        : null,
      pipelineStatus: keepPipelineBinding ? (input.existingState.pipelineStatus ?? "running") : null,
    };
  }
  return {
    ...input.existingState,
    mode: requestedPlan.mode,
    startOrder: requestedPlan.startOrder,
    endOrder: requestedPlan.endOrder,
    volumeOrder: requestedPlan.volumeOrder,
    autoReview: requestedPlan.autoReview,
    autoRepair: requestedPlan.autoRepair,
    scopeLabel: null,
    pipelineJobId: keepPipelineBinding
      ? (input.existingPipelineJobId?.trim() || input.existingState.pipelineJobId || null)
      : null,
    pipelineStatus: keepPipelineBinding ? (input.existingState.pipelineStatus ?? "running") : null,
  };
}

function findPendingEarlierVolumeChapter(input: {
  workspace: VolumePlanDocument;
  chapters: DirectorAutoExecutionChapterRef[];
  selectedVolumeOrder: number;
}): {
  volumeOrder: number;
  volumeTitle: string;
  chapterOrder: number;
} | null {
  if (input.selectedVolumeOrder <= 1) {
    return null;
  }
  const chapterByOrder = new Map(input.chapters.map((chapter) => [chapter.order, chapter] as const));
  const pendingChapter = flattenPreparedOutlineChapters(input.workspace)
    .filter((chapter) => chapter.volumeOrder < input.selectedVolumeOrder)
    .find((chapter) => {
      const persistedChapter = chapterByOrder.get(chapter.chapterOrder);
      return !persistedChapter || !isDirectorAutoExecutionChapterProcessed(persistedChapter);
    });
  if (!pendingChapter) {
    return null;
  }
  return {
    volumeOrder: pendingChapter.volumeOrder,
    volumeTitle: pendingChapter.volumeTitle?.trim() || `第 ${pendingChapter.volumeOrder} 卷`,
    chapterOrder: pendingChapter.chapterOrder,
  };
}

async function resolveVolumeScopedRange(input: {
  novelId: string;
  plan: DirectorAutoExecutionState;
  chapters: DirectorAutoExecutionChapterRef[];
  getVolumes?: (novelId: string) => Promise<VolumePlanDocument>;
}): Promise<DirectorAutoExecutionResolvedScope> {
  if (!input.getVolumes) {
    throw new Error("当前环境缺少卷工作区服务，无法解析按卷自动执行范围。");
  }
  const normalizedPlan = normalizeDirectorAutoExecutionPlan(input.plan);
  const workspace = await input.getVolumes(input.novelId);
  const recoveryCursor = resolveStructuredOutlineRecoveryCursor({
    workspace,
    plan: normalizedPlan,
  });
  if (recoveryCursor.step !== "chapter_sync" && recoveryCursor.step !== "completed") {
    throw new Error(`${recoveryCursor.scopeLabel}还没有完成节奏 / 拆章同步，不能直接进入自动执行。`);
  }
  const pendingEarlierVolumeChapter = findPendingEarlierVolumeChapter({
    workspace,
    chapters: input.chapters,
    selectedVolumeOrder: normalizedPlan.volumeOrder ?? 1,
  });
  if (pendingEarlierVolumeChapter) {
    throw new Error(
      `${pendingEarlierVolumeChapter.volumeTitle}仍有未完成章节（第 ${pendingEarlierVolumeChapter.chapterOrder} 章起），不能直接跳到第 ${normalizedPlan.volumeOrder ?? 1} 卷。请先完成前序卷，或把卷序号改为 ${pendingEarlierVolumeChapter.volumeOrder}。`,
    );
  }
  const selectedChapterOrders = recoveryCursor.selectedChapters
    .map((chapter) => chapter.chapterOrder)
    .sort((left, right) => left - right);
  if (selectedChapterOrders.length === 0) {
    throw new Error(`${recoveryCursor.scopeLabel}还没有可执行的章节范围，请先完成目标卷的拆章同步。`);
  }
  const chapterByOrder = new Map(input.chapters.map((chapter) => [chapter.order, chapter] as const));
  const firstChapterOrder = selectedChapterOrders[0] ?? 1;
  const lastChapterOrder = selectedChapterOrders[selectedChapterOrders.length - 1] ?? firstChapterOrder;
  return {
    range: {
      startOrder: firstChapterOrder,
      endOrder: lastChapterOrder,
      totalChapterCount: selectedChapterOrders.length,
      firstChapterId: chapterByOrder.get(firstChapterOrder)?.id ?? null,
    },
    scopeLabel: recoveryCursor.scopeLabel,
    volumeTitle: recoveryCursor.volumeTitle ?? recoveryCursor.selectedChapters[0]?.volumeTitle ?? null,
    preparedVolumeIds: recoveryCursor.preparedVolumeIds,
  };
}

export async function resolveAutoExecutionRangeAndState(input: {
  novelId: string;
  deps: AutoExecutionScopeRuntimeDeps;
  existingState?: DirectorAutoExecutionState | null;
  pipelineJobId?: string | null;
  pipelineStatus?: PipelineJobStatus | null;
}): Promise<{
  range: DirectorAutoExecutionRange;
  autoExecution: DirectorAutoExecutionState;
}> {
  const chapters = await input.deps.listChapters(input.novelId);
  const normalizedPlan = normalizeDirectorAutoExecutionPlan(input.existingState);
  let range: DirectorAutoExecutionRange | null = null;
  let scopeLabel = input.existingState?.scopeLabel ?? null;
  let volumeTitle = input.existingState?.volumeTitle ?? null;
  let preparedVolumeIds = input.existingState?.preparedVolumeIds ?? [];
  if (normalizedPlan.mode === "book" && input.existingState?.enabled) {
    range = resolveDirectorAutoExecutionBookRange(chapters);
    scopeLabel = scopeLabel ?? buildDirectorAutoExecutionScopeLabelFromState(input.existingState, range?.totalChapterCount ?? null);
  } else if (normalizedPlan.mode === "volume" && input.existingState?.enabled) {
    const resolvedVolumeScope = await resolveVolumeScopedRange({
      novelId: input.novelId,
      plan: input.existingState,
      chapters,
      getVolumes: input.deps.getVolumes,
    });
    range = resolvedVolumeScope.range;
    scopeLabel = resolvedVolumeScope.scopeLabel ?? scopeLabel;
    volumeTitle = resolvedVolumeScope.volumeTitle ?? volumeTitle;
    preparedVolumeIds = resolvedVolumeScope.preparedVolumeIds ?? preparedVolumeIds;
  }
  range = range ?? resolveDirectorAutoExecutionRangeFromState(input.existingState);
  range = range ?? resolveDirectorAutoExecutionRange(chapters);
  if (!range) {
    throw new Error("当前还没有可自动执行的章节，请先完成目标范围的拆章同步。");
  }
  const missingChapterOrders = findMissingChapterOrders(chapters, range);
  if (missingChapterOrders.length > 0) {
    const resolvedScopeLabel = scopeLabel ?? buildDirectorAutoExecutionScopeLabelFromState(input.existingState, range.totalChapterCount);
    throw new Error(
      `${resolvedScopeLabel}对应的章节执行区还缺少第 ${missingChapterOrders.slice(0, 5).join("、")} 章，请先完成目标范围的拆章同步。`,
    );
  }
  return {
    range,
    autoExecution: buildDirectorAutoExecutionState({
      range,
      chapters,
      plan: input.existingState,
      scopeLabel,
      volumeTitle,
      preparedVolumeIds,
      pipelineJobId: input.pipelineJobId ?? input.existingState?.pipelineJobId ?? null,
      pipelineStatus: input.pipelineStatus ?? input.existingState?.pipelineStatus ?? null,
    }),
  };
}
