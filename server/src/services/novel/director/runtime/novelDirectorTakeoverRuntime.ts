import type {
  DirectorTakeoverCheckpointSnapshot,
  DirectorAutoExecutionPlan,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverPipelineJobSnapshot,
} from "@ai-novel/shared/types/novelDirector";
import type { DirectorTakeoverNovelContext, DirectorTakeoverAssetSnapshot } from "./novelDirectorTakeover";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { BookContractService } from "../../BookContractService";
import type { DirectorWorkflowSeedPayload } from "./novelDirectorHelpers";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../../db/prisma";
import { normalizeNovelOutput } from "../../novelCoreShared";
import { DIRECTOR_PROGRESS } from "../projections/novelDirectorProgress";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import {
  buildDirectorAutoExecutionState,
  buildDirectorAutoExecutionDeferredQualityState,
  hasDirectorAutoExecutionChapterContract,
  isDirectorAutoExecutionChapterProcessed,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionPlanChapterRange,
  resolveDirectorAutoExecutionRangeFromState,
  type DirectorAutoExecutionChapterRef,
} from "../automation/novelDirectorAutoExecution";
import { resolveStructuredOutlineRecoveryCursor } from "../recovery/novelDirectorStructuredOutlineRecovery";

export interface DirectorTakeoverLoadedState {
  novel: DirectorTakeoverNovelContext;
  storyMacroPlan: StoryMacroPlan | null;
  bookContract: Awaited<ReturnType<BookContractService["getByNovelId"]>>;
  snapshot: DirectorTakeoverAssetSnapshot;
  activeTaskId: string | null;
  hasActiveTask: boolean;
  latestTaskId: string | null;
  activePipelineJob: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint: DirectorTakeoverCheckpointSnapshot | null;
  executableRange: DirectorTakeoverExecutableRangeSnapshot | null;
  latestAutoExecutionState: DirectorWorkflowSeedPayload["autoExecution"] | null;
}

interface TakeoverChapterRow {
  id: string;
  order: number;
  generationState: string | null;
  chapterStatus: string | null;
  content: string | null;
  targetWordCount: number | null;
  conflictLevel: number | null;
  revealLevel: number | null;
  mustAvoid: string | null;
  taskSheet: string | null;
  sceneCards: string | null;
}

function hasPersistedChapterContent(chapter: Pick<TakeoverChapterRow, "content"> | null | undefined): boolean {
  return typeof chapter?.content === "string" && chapter.content.trim().length > 0;
}

function isNoChaptersToGenerateFailure(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes("指定区间内没有可生成的章节");
}

function isPendingAutoExecutionChapter(chapter: TakeoverChapterRow): boolean {
  return !isDirectorAutoExecutionChapterProcessed(chapter as Parameters<typeof isDirectorAutoExecutionChapterProcessed>[0]);
}

function reconcileAutoExecutionStateAfterStaleNoChapterFailure(input: {
  chapterRows: TakeoverChapterRow[];
  latestTaskError?: string | null;
  state: DirectorWorkflowSeedPayload["autoExecution"] | null | undefined;
}): DirectorWorkflowSeedPayload["autoExecution"] | null {
  const state = input.state ?? null;
  if (!state || !isNoChaptersToGenerateFailure(input.latestTaskError)) {
    return state;
  }

  const range = resolveDirectorAutoExecutionRangeFromState(state);
  if (!range) {
    return state;
  }

  const nextChapterId = state.nextChapterId?.trim() || null;
  const nextChapterOrder = typeof state.nextChapterOrder === "number"
    ? state.nextChapterOrder
    : null;
  const nextChapter = input.chapterRows.find((chapter) => (
    (nextChapterId && chapter.id === nextChapterId)
    || (nextChapterOrder != null && chapter.order === nextChapterOrder)
  )) ?? null;
  if (!nextChapter || !hasPersistedChapterContent(nextChapter)) {
    return state;
  }

  const alreadySkipped = (state.skippedChapterIds ?? []).includes(nextChapter.id)
    || (state.skippedChapterOrders ?? []).includes(nextChapter.order);
  if (alreadySkipped) {
    return state;
  }

  const hasLaterPendingChapter = input.chapterRows.some((chapter) => (
    chapter.order > nextChapter.order
    && chapter.order <= range.endOrder
    && isPendingAutoExecutionChapter(chapter)
  ));
  if (!hasLaterPendingChapter) {
    return state;
  }

  const deferredState = buildDirectorAutoExecutionDeferredQualityState({
    state,
    reason: "继续已有进度时已跳过当前待修章节，后续章节继续执行。",
    source: "review_skip",
    chapter: {
      id: nextChapter.id,
      order: nextChapter.order,
      content: nextChapter.content,
      generationState: nextChapter.generationState,
      chapterStatus: nextChapter.chapterStatus,
    } as DirectorAutoExecutionChapterRef,
  });
  return buildDirectorAutoExecutionState({
    range,
    chapters: input.chapterRows as Parameters<typeof buildDirectorAutoExecutionState>[0]["chapters"],
    plan: deferredState,
    scopeLabel: deferredState.scopeLabel ?? null,
    volumeTitle: deferredState.volumeTitle ?? null,
    preparedVolumeIds: deferredState.preparedVolumeIds ?? [],
    pipelineJobId: deferredState.pipelineJobId ?? null,
    pipelineStatus: deferredState.pipelineStatus ?? null,
  });
}

function applyAutoExecutionStateCursorToExecutableRange(
  range: DirectorTakeoverExecutableRangeSnapshot | null,
  state: DirectorWorkflowSeedPayload["autoExecution"] | null,
): DirectorTakeoverExecutableRangeSnapshot | null {
  if (!range || !state?.enabled) {
    return range;
  }
  const nextChapterOrder = typeof state.nextChapterOrder === "number"
    && state.nextChapterOrder >= range.startOrder
    && state.nextChapterOrder <= range.endOrder
    ? state.nextChapterOrder
    : range.nextChapterOrder ?? null;
  const nextChapterId = state.nextChapterId?.trim()
    ? state.nextChapterId.trim()
    : range.nextChapterId ?? null;
  return {
    ...range,
    nextChapterId,
    nextChapterOrder,
  };
}

function hasPreparedOutlineChapterExecutionDetail(
  chapter: VolumePlanDocument["volumes"][number]["chapters"][number] | null | undefined,
): boolean {
  if (!chapter) {
    return false;
  }
  return hasDirectorAutoExecutionChapterContract({
    id: chapter.id,
    order: chapter.chapterOrder,
    conflictLevel: chapter.conflictLevel ?? null,
    revealLevel: chapter.revealLevel ?? null,
    targetWordCount: chapter.targetWordCount ?? null,
    mustAvoid: chapter.mustAvoid ?? null,
    taskSheet: chapter.taskSheet ?? null,
    sceneCards: chapter.sceneCards ?? null,
  }) && Boolean(chapter.purpose?.trim());
}

function hasSyncedExecutionChapterDetail(chapter: TakeoverChapterRow): boolean {
  return hasDirectorAutoExecutionChapterContract({
    id: chapter.id,
    order: chapter.order,
    conflictLevel: chapter.conflictLevel,
    revealLevel: chapter.revealLevel,
    targetWordCount: chapter.targetWordCount,
    mustAvoid: chapter.mustAvoid,
    taskSheet: chapter.taskSheet,
    sceneCards: chapter.sceneCards,
  });
}

/**
 * 解析「生效自动执行 plan」对应的目标章节序集合（取自执行区持久化章节）。
 * book = 全部章节；volume = 该卷序范围；chapter_range = [start,end]。
 * 与 novelDirectorAutoExecutionScopeRuntime 的范围解析保持一致。
 */
function resolveTargetOrdersForAutoExecutionRange(input: {
  chapterRows: TakeoverChapterRow[];
  plan: DirectorAutoExecutionPlan | DirectorWorkflowSeedPayload["autoExecution"] | null | undefined;
  volumeChapterRanges?: Array<{ volumeOrder: number; startOrder: number; endOrder: number }>;
}): number[] {
  const normalized = normalizeDirectorAutoExecutionPlan(input.plan);
  const allOrders = input.chapterRows
    .map((chapter) => chapter.order)
    .filter((order) => Number.isFinite(order) && order >= 1);
  if (normalized.mode === "book") {
    return allOrders;
  }
  if (normalized.mode === "volume") {
    const targetVolume = input.volumeChapterRanges?.find(
      (range) => range.volumeOrder === (normalized.volumeOrder ?? 1),
    ) ?? null;
    if (!targetVolume) {
      return [];
    }
    return allOrders.filter((order) => order >= targetVolume.startOrder && order <= targetVolume.endOrder);
  }
  const chapterRange = resolveDirectorAutoExecutionPlanChapterRange(normalized);
  if (!chapterRange) {
    return [];
  }
  return allOrders.filter((order) => order >= chapterRange.startOrder && order <= chapterRange.endOrder);
}

/**
 * 计算目标自动执行范围内「仍缺少完整章节细化」的章节序：
 * 未处理（未写 / 待修）且缺少完整执行契约的持久化章节。
 * 与 scope runtime 的 findMissingExecutionContextOrders 同语义——
 * 这些正是会让 runFromReady 直接抛「缺少完整章节细化」并卡死的章节。
 */
function computeMissingExecutionContractOrders(input: {
  chapterRows: TakeoverChapterRow[];
  plan: DirectorAutoExecutionPlan | DirectorWorkflowSeedPayload["autoExecution"] | null | undefined;
  volumeChapterRanges?: Array<{ volumeOrder: number; startOrder: number; endOrder: number }>;
}): number[] {
  const targetOrders = new Set(resolveTargetOrdersForAutoExecutionRange(input));
  if (targetOrders.size === 0) {
    return [];
  }
  return input.chapterRows
    .filter((chapter) => targetOrders.has(chapter.order))
    .filter((chapter) => isPendingAutoExecutionChapter(chapter))
    .filter((chapter) => !hasSyncedExecutionChapterDetail(chapter))
    .map((chapter) => chapter.order)
    .sort((left, right) => left - right);
}

function buildPreparedRangeFromSyncedChapters(
  chapterRows: TakeoverChapterRow[],
  expectedOrders: number[],
): DirectorTakeoverExecutableRangeSnapshot | null {
  const normalizedExpectedOrders = Array.from(
    new Set(
      expectedOrders
        .filter((order) => Number.isFinite(order))
        .map((order) => Math.max(1, Math.round(order))),
    ),
  ).sort((left, right) => left - right);
  if (normalizedExpectedOrders.length === 0) {
    return null;
  }

  const preparedByOrder = new Map(
    chapterRows
      .filter((chapter) => hasSyncedExecutionChapterDetail(chapter))
      .map((chapter) => [chapter.order, chapter] as const),
  );
  const prepared = normalizedExpectedOrders
    .map((order) => preparedByOrder.get(order) ?? null)
    .filter((chapter): chapter is TakeoverChapterRow => Boolean(chapter));
  if (prepared.length !== normalizedExpectedOrders.length) {
    return null;
  }

  const nextPending = prepared.find((chapter) => {
    return chapter.generationState !== "approved" && chapter.generationState !== "published";
  }) ?? null;

  return {
    startOrder: prepared[0].order,
    endOrder: prepared[prepared.length - 1].order,
    totalChapterCount: prepared.length,
    nextChapterId: nextPending?.id ?? null,
    nextChapterOrder: nextPending?.order ?? null,
  };
}

function buildPreparedRangeFromState(
  chapterRows: TakeoverChapterRow[],
  state: DirectorWorkflowSeedPayload["autoExecution"] | null | undefined,
): DirectorTakeoverExecutableRangeSnapshot | null {
  const stateRange = resolveDirectorAutoExecutionRangeFromState(state);
  if (!stateRange) {
    return null;
  }
  return buildPreparedRangeFromSyncedChapters(
    chapterRows,
    Array.from(
      { length: Math.max(0, stateRange.endOrder - stateRange.startOrder + 1) },
      (_item, index) => stateRange.startOrder + index,
    ),
  );
}

function buildCheckpointSnapshot(input: {
  task: {
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
  } | null;
  chapterOrderMap: Map<string, number>;
}): DirectorTakeoverCheckpointSnapshot | null {
  const checkpointType = input.task?.checkpointType;
  if (checkpointType !== "chapter_batch_ready" && checkpointType !== "replan_required") {
    return null;
  }

  let chapterId: string | null = null;
  let volumeId: string | null = null;
  const rawResumeTarget = input.task?.resumeTargetJson?.trim();
  if (rawResumeTarget) {
    try {
      const parsed = JSON.parse(rawResumeTarget) as {
        chapterId?: string | null;
        volumeId?: string | null;
      };
      chapterId = parsed.chapterId?.trim() || null;
      volumeId = parsed.volumeId?.trim() || null;
    } catch {
      chapterId = null;
      volumeId = null;
    }
  }

  return {
    checkpointType,
    checkpointSummary: input.task?.checkpointSummary ?? null,
    chapterId,
    chapterOrder: chapterId ? (input.chapterOrderMap.get(chapterId) ?? null) : null,
    volumeId,
  };
}

export async function loadDirectorTakeoverState(input: {
  novelId: string;
  autoExecutionPlan?: DirectorAutoExecutionPlan | null;
  getStoryMacroPlan: (novelId: string) => Promise<StoryMacroPlan | null>;
  getDirectorAssetSnapshot: (novelId: string) => Promise<{
    characterCount: number;
    chapterCount: number;
    plannedChapterCount?: number | null;
    volumeCount: number;
    hasVolumeStrategyPlan: boolean;
    firstVolumeId: string | null;
    firstVolumeChapterCount: number;
    volumeChapterRanges?: Array<{
      volumeOrder: number;
      startOrder: number;
      endOrder: number;
    }>;
    structuredOutlineChapterOrders?: number[];
  }>;
  getVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument | null>;
  findActiveAutoDirectorTask: (novelId: string) => Promise<{ id: string } | null>;
  findLatestAutoDirectorTask: (novelId: string) => Promise<{
    id: string;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
    lastError?: string | null;
  } | null>;
}): Promise<DirectorTakeoverLoadedState> {
  const [novelRow, storyMacroPlan, assets, workspace, activeTask, latestTask, chapterRows, activePipelineJob] = await Promise.all([
    prisma.novel.findUnique({
      where: { id: input.novelId },
      select: {
        id: true,
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        genreId: true,
        primaryStoryModeId: true,
        secondaryStoryModeId: true,
        worldId: true,
        writingMode: true,
        projectMode: true,
        narrativePov: true,
        pacePreference: true,
        styleTone: true,
        emotionIntensity: true,
        aiFreedom: true,
        defaultChapterLength: true,
        estimatedChapterCount: true,
        projectStatus: true,
        storylineStatus: true,
        outlineStatus: true,
        resourceReadyScore: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
        bookContract: true,
      },
    }),
    input.getStoryMacroPlan(input.novelId).catch(() => null),
    input.getDirectorAssetSnapshot(input.novelId),
    input.getVolumeWorkspace(input.novelId).catch(() => null),
    input.findActiveAutoDirectorTask(input.novelId),
    input.findLatestAutoDirectorTask(input.novelId),
    prisma.chapter.findMany({
      where: { novelId: input.novelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        generationState: true,
        chapterStatus: true,
        content: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
      },
    }),
    prisma.generationJob.findFirst({
      where: {
        novelId: input.novelId,
        status: { in: ["queued", "running"] },
        finishedAt: null,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        currentStage: true,
        currentItemLabel: true,
        completedCount: true,
        totalCount: true,
        startOrder: true,
        endOrder: true,
      },
    }),
  ]);
  if (!novelRow) {
    throw new Error("小说不存在。");
  }

  const novel = normalizeNovelOutput(novelRow) as DirectorTakeoverNovelContext & {
    bookContract?: Awaited<ReturnType<BookContractService["getByNovelId"]>>;
  };
  const firstVolume = workspace?.volumes[0] ?? null;
  const firstVolumeBeatSheetReady = Boolean(
    firstVolume
    && workspace?.beatSheets.some((sheet) => sheet.volumeId === firstVolume.id && sheet.beats.length > 0),
  );
  const firstVolumePreparedChapterCount = firstVolume?.chapters.filter((chapter) => hasPreparedOutlineChapterExecutionDetail(chapter)).length ?? 0;
  const generatedChapterCount = chapterRows.filter((chapter) => Boolean(chapter.content?.trim())).length;
  const approvedChapterCount = chapterRows.filter((chapter) => chapter.generationState === "approved" || chapter.generationState === "published").length;
  const pendingRepairChapterCount = chapterRows.filter((chapter) => {
    if (!chapter.content?.trim()) {
      return false;
    }
    return chapter.generationState !== "approved" && chapter.generationState !== "published";
  }).length;
  const latestSeedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(latestTask?.seedPayloadJson) ?? null;
  const reconciledLatestAutoExecutionState = reconcileAutoExecutionStateAfterStaleNoChapterFailure({
    chapterRows: chapterRows as TakeoverChapterRow[],
    latestTaskError: latestTask?.lastError ?? null,
    state: latestSeedPayload?.autoExecution ?? null,
  });
  const requestedAutoExecutionPlan = input.autoExecutionPlan ?? null;
  const effectiveAutoExecutionPlan = requestedAutoExecutionPlan
    ?? latestSeedPayload?.autoExecutionPlan
    ?? reconciledLatestAutoExecutionState
    ?? null;
  const structuredOutlineCursor = workspace
    ? resolveStructuredOutlineRecoveryCursor({
        workspace,
        plan: effectiveAutoExecutionPlan,
      })
    : null;
  const missingExecutionContractOrders = computeMissingExecutionContractOrders({
    chapterRows: chapterRows as TakeoverChapterRow[],
    plan: effectiveAutoExecutionPlan,
    volumeChapterRanges: assets.volumeChapterRanges,
  });
  const chapterOrderMap = new Map(chapterRows.map((chapter) => [chapter.id, chapter.order]));
  const activePipelineSnapshot = activePipelineJob
    ? {
        id: activePipelineJob.id,
        status: activePipelineJob.status,
        currentStage: activePipelineJob.currentStage ?? null,
        currentItemLabel: activePipelineJob.currentItemLabel ?? null,
        completedCount: activePipelineJob.completedCount,
        totalCount: activePipelineJob.totalCount,
        startOrder: activePipelineJob.startOrder,
        endOrder: activePipelineJob.endOrder,
      }
    : null;
  const latestCheckpoint = buildCheckpointSnapshot({
    task: latestTask,
    chapterOrderMap,
  });

  const executableRangeFromState = requestedAutoExecutionPlan
    ? null
    : buildPreparedRangeFromState(
        chapterRows as TakeoverChapterRow[],
        reconciledLatestAutoExecutionState,
      );
  const executableRangeFromSyncedChapters = structuredOutlineCursor
    && (structuredOutlineCursor.step === "chapter_sync" || structuredOutlineCursor.step === "completed")
    ? buildPreparedRangeFromSyncedChapters(
        chapterRows as TakeoverChapterRow[],
        structuredOutlineCursor.selectedChapters.map((chapter) => chapter.chapterOrder),
      )
    : null;
  const executableRange = applyAutoExecutionStateCursorToExecutableRange(
    executableRangeFromState
    ? {
        startOrder: executableRangeFromState.startOrder,
        endOrder: executableRangeFromState.endOrder,
        totalChapterCount: executableRangeFromState.totalChapterCount,
        nextChapterId: executableRangeFromState.nextChapterId,
        nextChapterOrder: executableRangeFromState.nextChapterOrder,
      }
    : executableRangeFromSyncedChapters,
    reconciledLatestAutoExecutionState,
  );

  return {
    novel,
    storyMacroPlan,
    bookContract: novel.bookContract ?? null,
    snapshot: {
      ...assets,
      hasStoryMacroPlan: Boolean(storyMacroPlan?.storyInput?.trim() && storyMacroPlan.decomposition),
      hasBookContract: Boolean(novel.bookContract),
      hasVolumeStrategyPlan: assets.hasVolumeStrategyPlan,
      firstVolumeId: assets.firstVolumeId,
      volumeChapterRanges: assets.volumeChapterRanges,
      structuredOutlineChapterOrders: assets.structuredOutlineChapterOrders,
      firstVolumeBeatSheetReady,
      firstVolumePreparedChapterCount,
      structuredOutlineRecoveryStep: structuredOutlineCursor?.step ?? null,
      generatedChapterCount,
      approvedChapterCount,
      pendingRepairChapterCount,
      hasUnpreparedChaptersInRange: missingExecutionContractOrders.length > 0,
      missingExecutionContractOrders,
    },
    activeTaskId: activeTask?.id ?? null,
    hasActiveTask: Boolean(activeTask),
    latestTaskId: latestTask?.id ?? null,
    activePipelineJob: activePipelineSnapshot,
    latestCheckpoint,
    executableRange,
    latestAutoExecutionState: reconciledLatestAutoExecutionState,
  };
}

export function resolveDirectorRunningStateForPhase(
  phase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
) {
  if (phase === "story_macro") {
    return {
      stage: "story_macro" as const,
      itemKey: "book_contract" as const,
      itemLabel: "正在准备 Book Contract 与故事宏观规划",
      progress: DIRECTOR_PROGRESS.bookContract,
    };
  }
  if (phase === "character_setup") {
    return {
      stage: "character_setup" as const,
      itemKey: "character_setup" as const,
      itemLabel: "正在补齐角色准备",
      progress: DIRECTOR_PROGRESS.characterSetup,
    };
  }
  if (phase === "volume_strategy") {
    return {
      stage: "volume_strategy" as const,
      itemKey: "volume_strategy" as const,
      itemLabel: "正在继续生成卷战略",
      progress: DIRECTOR_PROGRESS.volumeStrategy,
    };
  }
  return {
    stage: "structured_outline" as const,
    itemKey: "beat_sheet" as const,
    itemLabel: "正在继续生成第 1 卷节奏板与细化",
    progress: DIRECTOR_PROGRESS.beatSheet,
  };
}

