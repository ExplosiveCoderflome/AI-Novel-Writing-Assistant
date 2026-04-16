import type {
  DirectorTakeoverCheckpointSnapshot,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverPipelineJobSnapshot,
} from "@ai-novel/shared/types/novelDirector";
import type { DirectorTakeoverNovelContext, DirectorTakeoverAssetSnapshot } from "./novelDirectorTakeover";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { BookContractService } from "../BookContractService";
import type { DirectorWorkflowSeedPayload } from "./novelDirectorHelpers";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { normalizeNovelOutput } from "../novelCoreShared";
import { DIRECTOR_PROGRESS } from "./novelDirectorProgress";
import { parseSeedPayload } from "../workflow/novelWorkflow.shared";
import { resolveDirectorAutoExecutionRangeFromState } from "./novelDirectorAutoExecution";

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

function hasPreparedOutlineChapterBoundary(
  chapter: VolumePlanDocument["volumes"][number]["chapters"][number] | null | undefined,
): boolean {
  if (!chapter) {
    return false;
  }
  return typeof chapter.conflictLevel === "number"
    || typeof chapter.revealLevel === "number"
    || typeof chapter.targetWordCount === "number"
    || Boolean(chapter.mustAvoid?.trim())
    || chapter.payoffRefs.length > 0;
}

function hasPreparedOutlineChapterExecutionDetail(
  chapter: VolumePlanDocument["volumes"][number]["chapters"][number] | null | undefined,
): boolean {
  if (!chapter) {
    return false;
  }
  return Boolean(chapter.purpose?.trim())
    && hasPreparedOutlineChapterBoundary(chapter)
    && Boolean(chapter.taskSheet?.trim());
}

function buildPreparedRangeFromWorkspace(
  workspace: VolumePlanDocument | null,
  chapterStates: Array<{ id: string; order: number; generationState: string | null }>,
): DirectorTakeoverExecutableRangeSnapshot | null {
  const firstVolume = workspace?.volumes[0];
  if (!firstVolume) {
    return null;
  }

  const prepared = firstVolume.chapters
    .filter((chapter) => hasPreparedOutlineChapterExecutionDetail(chapter))
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .slice(0, 10);
  if (prepared.length === 0) {
    return null;
  }

  const chapterStateMap = new Map(chapterStates.map((chapter) => [chapter.id, chapter]));
  const nextPending = prepared.find((chapter) => {
    const state = chapterStateMap.get(chapter.id)?.generationState ?? null;
    return state !== "approved" && state !== "published";
  }) ?? null;

  return {
    startOrder: prepared[0].chapterOrder,
    endOrder: prepared[prepared.length - 1].chapterOrder,
    totalChapterCount: prepared.length,
    nextChapterId: nextPending?.id ?? null,
    nextChapterOrder: nextPending?.chapterOrder ?? null,
  };
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
  if (checkpointType !== "front10_ready" && checkpointType !== "chapter_batch_ready" && checkpointType !== "replan_required") {
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
  getStoryMacroPlan: (novelId: string) => Promise<StoryMacroPlan | null>;
  getDirectorAssetSnapshot: (novelId: string) => Promise<{
    characterCount: number;
    chapterCount: number;
    volumeCount: number;
    firstVolumeId: string | null;
    firstVolumeChapterCount: number;
  }>;
  getVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument | null>;
  findActiveAutoDirectorTask: (novelId: string) => Promise<{ id: string } | null>;
  findLatestAutoDirectorTask: (novelId: string) => Promise<{
    id: string;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
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

  const executableRangeFromState = resolveDirectorAutoExecutionRangeFromState(latestSeedPayload?.autoExecution);
  const executableRange = executableRangeFromState
    ? {
        startOrder: executableRangeFromState.startOrder,
        endOrder: executableRangeFromState.endOrder,
        totalChapterCount: executableRangeFromState.totalChapterCount,
        nextChapterId: latestSeedPayload?.autoExecution?.nextChapterId ?? null,
        nextChapterOrder: latestSeedPayload?.autoExecution?.nextChapterOrder ?? null,
      }
    : buildPreparedRangeFromWorkspace(workspace, chapterRows);

  return {
    novel,
    storyMacroPlan,
    bookContract: novel.bookContract ?? null,
    snapshot: {
      ...assets,
      hasStoryMacroPlan: Boolean(storyMacroPlan?.storyInput?.trim() && storyMacroPlan.decomposition),
      hasBookContract: Boolean(novel.bookContract),
      firstVolumeId: assets.firstVolumeId,
      firstVolumeBeatSheetReady,
      firstVolumePreparedChapterCount,
      generatedChapterCount,
      approvedChapterCount,
      pendingRepairChapterCount,
    },
    activeTaskId: activeTask?.id ?? null,
    hasActiveTask: Boolean(activeTask),
    latestTaskId: latestTask?.id ?? null,
    activePipelineJob: activePipelineSnapshot,
    latestCheckpoint,
    executableRange,
    latestAutoExecutionState: latestSeedPayload?.autoExecution ?? null,
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
