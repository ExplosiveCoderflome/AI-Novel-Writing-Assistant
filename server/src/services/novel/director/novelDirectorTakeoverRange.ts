import type {
  DirectorAutoExecutionPlan,
  DirectorTakeoverCheckpointSnapshot,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverPipelineJobSnapshot,
} from "@ai-novel/shared/types/novelDirector";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { normalizeDirectorAutoExecutionPlan } from "./novelDirectorAutoExecution";

interface TakeoverChapterStateRef {
  id: string;
  order: number;
  generationState: string | null;
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

function buildRangeFromPreparedChapters(input: {
  prepared: VolumePlanDocument["volumes"][number]["chapters"];
  chapterStates: TakeoverChapterStateRef[];
}): DirectorTakeoverExecutableRangeSnapshot | null {
  if (input.prepared.length === 0) {
    return null;
  }

  const chapterStateMap = new Map(input.chapterStates.map((chapter) => [chapter.id, chapter]));
  const nextPending = input.prepared.find((chapter) => {
    const state = chapterStateMap.get(chapter.id)?.generationState ?? null;
    return state !== "approved" && state !== "published";
  }) ?? null;

  return {
    startOrder: input.prepared[0].chapterOrder,
    endOrder: input.prepared[input.prepared.length - 1].chapterOrder,
    totalChapterCount: input.prepared.length,
    nextChapterId: nextPending?.id ?? null,
    nextChapterOrder: nextPending?.chapterOrder ?? null,
  };
}

export function buildPreparedExecutableRange(input: {
  workspace: VolumePlanDocument | null;
  chapterStates: TakeoverChapterStateRef[];
}): DirectorTakeoverExecutableRangeSnapshot | null {
  const prepared = (input.workspace?.volumes ?? [])
    .flatMap((volume) => volume.chapters)
    .filter((chapter) => hasPreparedOutlineChapterExecutionDetail(chapter))
    .sort((left, right) => left.chapterOrder - right.chapterOrder);

  return buildRangeFromPreparedChapters({
    prepared,
    chapterStates: input.chapterStates,
  });
}

export function resolveRequestedTakeoverRange(input: {
  autoExecutionPlan?: DirectorAutoExecutionPlan | null;
  workspace: VolumePlanDocument | null;
  chapterStates: TakeoverChapterStateRef[];
}): DirectorTakeoverExecutableRangeSnapshot | null {
  const normalized = normalizeDirectorAutoExecutionPlan(input.autoExecutionPlan);
  if (normalized.mode === "chapter_range") {
    const nextChapter = input.chapterStates
      .find((chapter) => chapter.order === (normalized.startOrder ?? 1)) ?? null;
    return {
      startOrder: normalized.startOrder ?? 1,
      endOrder: normalized.endOrder ?? normalized.startOrder ?? 1,
      totalChapterCount: Math.max(1, (normalized.endOrder ?? normalized.startOrder ?? 1) - (normalized.startOrder ?? 1) + 1),
      nextChapterId: nextChapter?.id ?? null,
      nextChapterOrder: normalized.startOrder ?? 1,
    };
  }
  if (normalized.mode === "volume") {
    const targetVolume = (input.workspace?.volumes ?? [])
      .find((volume) => volume.sortOrder === normalized.volumeOrder);
    if (!targetVolume) {
      return null;
    }
    const prepared = targetVolume.chapters
      .filter((chapter) => hasPreparedOutlineChapterExecutionDetail(chapter))
      .sort((left, right) => left.chapterOrder - right.chapterOrder);
    return buildRangeFromPreparedChapters({
      prepared,
      chapterStates: input.chapterStates,
    });
  }
  const prepared = (input.workspace?.volumes ?? [])
    .flatMap((volume) => volume.chapters)
    .filter((chapter) => hasPreparedOutlineChapterExecutionDetail(chapter))
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .slice(0, 10);
  return buildRangeFromPreparedChapters({
    prepared,
    chapterStates: input.chapterStates,
  });
}

export function doesCheckpointOverlapRange(
  checkpoint: DirectorTakeoverCheckpointSnapshot | null | undefined,
  range: DirectorTakeoverExecutableRangeSnapshot | null | undefined,
): boolean {
  if (!checkpoint || !range || typeof checkpoint.chapterOrder !== "number") {
    return false;
  }
  return checkpoint.chapterOrder >= range.startOrder && checkpoint.chapterOrder <= range.endOrder;
}

export function doesPipelineJobOverlapRange(
  job: DirectorTakeoverPipelineJobSnapshot | null | undefined,
  range: DirectorTakeoverExecutableRangeSnapshot | null | undefined,
): boolean {
  if (!job || !range) {
    return false;
  }
  return !(job.endOrder < range.startOrder || job.startOrder > range.endOrder);
}
