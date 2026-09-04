import type { DirectorTakeoverReadinessResponse } from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../../db/prisma";
import { NovelContextService } from "../../NovelContextService";
import { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import { NovelVolumeService } from "../../volume/NovelVolumeService";
import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import { buildDirectorTakeoverReadiness } from "../runtime/novelDirectorTakeover";
import { loadDirectorTakeoverState } from "../runtime/novelDirectorTakeoverRuntime";
import { flattenPreparedOutlineChapters } from "./novelDirectorStructuredOutlineRecovery";

export class DirectorTakeoverReadService {
  constructor(
    private readonly novelContextService: NovelContextService,
    private readonly storyMacroService: StoryMacroPlanService,
    private readonly volumeService: NovelVolumeService,
    private readonly workflowService: NovelWorkflowService,
  ) {}

  async getAssetSnapshot(novelId: string) {
    const [characters, chapters, workspace, novel] = await Promise.all([
      this.novelContextService.listCharacters(novelId),
      this.novelContextService.listChapters(novelId),
      this.volumeService.getVolumes(novelId).catch(() => null),
      prisma.novel.findUnique({
        where: { id: novelId },
        select: { estimatedChapterCount: true },
      }),
    ]);
    const firstVolume = workspace?.volumes[0] ?? null;
    const preparedOutlineChapters = workspace ? flattenPreparedOutlineChapters(workspace) : [];
    const volumeChapterRangeMax = Math.max(
      0,
      ...(workspace?.volumes ?? []).flatMap((volume) => volume.chapters
        .map((chapter) => chapter.chapterOrder)
        .filter((order) => Number.isFinite(order))),
    );
    const structuredOutlineMax = Math.max(
      0,
      ...preparedOutlineChapters
        .map((chapter) => chapter.chapterOrder)
        .filter((order) => Number.isFinite(order)),
    );
    const plannedChapterCount = Math.max(
      novel?.estimatedChapterCount ?? 0,
      volumeChapterRangeMax,
      structuredOutlineMax,
      chapters.length,
    ) || null;
    return {
      characterCount: characters.length,
      chapterCount: chapters.length,
      plannedChapterCount,
      volumeCount: workspace?.volumes.length ?? 0,
      hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
      firstVolumeId: firstVolume?.id ?? null,
      firstVolumeChapterCount: firstVolume?.chapters.length ?? 0,
      volumeChapterRanges: (workspace?.volumes ?? []).map((volume) => {
        const orders = volume.chapters
          .map((chapter) => chapter.chapterOrder)
          .filter((order) => Number.isFinite(order))
          .sort((left, right) => left - right);
        return orders.length > 0
          ? { volumeOrder: volume.sortOrder, startOrder: orders[0], endOrder: orders[orders.length - 1] }
          : null;
      }).filter((range): range is { volumeOrder: number; startOrder: number; endOrder: number } => Boolean(range)),
      structuredOutlineChapterOrders: preparedOutlineChapters.map((chapter) => chapter.chapterOrder),
    };
  }

  async getReadiness(novelId: string): Promise<DirectorTakeoverReadinessResponse> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId,
      getStoryMacroPlan: (targetNovelId) => this.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.getAssetSnapshot(targetNovelId),
      getVolumeWorkspace: (targetNovelId) => this.volumeService.getVolumes(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
      findLatestAutoDirectorTask: (targetNovelId) => this.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
    });
    return buildDirectorTakeoverReadiness({
      novel: takeoverState.novel,
      snapshot: takeoverState.snapshot,
      hasActiveTask: takeoverState.hasActiveTask,
      activeTaskId: takeoverState.activeTaskId,
      activePipelineJob: takeoverState.activePipelineJob,
      latestCheckpoint: takeoverState.latestCheckpoint,
      executableRange: takeoverState.executableRange,
    });
  }
}
