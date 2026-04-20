import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { resolveDirectorAutoExecutionRangeFromState } from "./novelDirectorAutoExecution";
import type { DirectorTakeoverResolvedPlan } from "./novelDirectorTakeover";
import type { DirectorTakeoverLoadedState } from "./novelDirectorTakeoverRuntime";

interface DirectorTakeoverResetDeps {
  getVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument>;
  updateVolumeWorkspace: (novelId: string, input: unknown) => Promise<VolumePlanDocument>;
  cancelPipelineJob: (jobId: string) => Promise<unknown>;
}

function resolveAutoExecutionRange(state: DirectorTakeoverLoadedState): { startOrder: number; endOrder: number } | null {
  const stateRange = resolveDirectorAutoExecutionRangeFromState(state.latestAutoExecutionState);
  if (stateRange) {
    return {
      startOrder: stateRange.startOrder,
      endOrder: stateRange.endOrder,
    };
  }
  if (state.executableRange) {
    return {
      startOrder: state.executableRange.startOrder,
      endOrder: state.executableRange.endOrder,
    };
  }
  if (state.activePipelineJob) {
    return {
      startOrder: state.activePipelineJob.startOrder,
      endOrder: state.activePipelineJob.endOrder,
    };
  }
  if (typeof state.latestCheckpoint?.chapterOrder === "number") {
    return {
      startOrder: state.latestCheckpoint.chapterOrder,
      endOrder: state.latestCheckpoint.chapterOrder,
    };
  }
  return null;
}

async function cancelActivePipelineJobIfNeeded(
  state: DirectorTakeoverLoadedState,
  deps: DirectorTakeoverResetDeps,
): Promise<void> {
  const jobId = state.activePipelineJob?.id?.trim();
  if (!jobId) {
    return;
  }
  await deps.cancelPipelineJob(jobId).catch(() => null);
}

async function resetStoryMacroOutputs(novelId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.bookContract.deleteMany({ where: { novelId } });
    await tx.storyMacroPlan.deleteMany({ where: { novelId } });
  });
}

async function resetCharacterOutputs(novelId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.characterCastOption.deleteMany({ where: { novelId } });
    await tx.characterCandidate.deleteMany({ where: { novelId } });
    await tx.characterRelation.deleteMany({ where: { novelId } });
    await tx.character.deleteMany({ where: { novelId } });
  });
}

async function deleteBlankChaptersByOrders(novelId: string, chapterOrders: number[]): Promise<void> {
  if (chapterOrders.length === 0) {
    return;
  }
  await prisma.chapter.deleteMany({
    where: {
      novelId,
      order: { in: chapterOrders },
      OR: [
        { content: null },
        { content: "" },
      ],
    },
  });
}

async function resetOutlineOutputs(
  novelId: string,
  deps: DirectorTakeoverResetDeps,
): Promise<void> {
  const workspace = await deps.getVolumeWorkspace(novelId);
  const chapterOrders = workspace.volumes.flatMap((volume) => volume.chapters.map((chapter) => chapter.chapterOrder));
  await deps.updateVolumeWorkspace(novelId, {
    volumes: [],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
  });
  await deleteBlankChaptersByOrders(novelId, chapterOrders);
}

function resolveStructuredTargetVolumeId(
  state: DirectorTakeoverLoadedState,
  workspace: VolumePlanDocument,
): string | null {
  return state.latestCheckpoint?.volumeId
    ?? state.snapshot.firstVolumeId
    ?? workspace.volumes[0]?.id
    ?? null;
}

async function resetStructuredOutputs(
  novelId: string,
  state: DirectorTakeoverLoadedState,
  deps: DirectorTakeoverResetDeps,
): Promise<void> {
  const workspace = await deps.getVolumeWorkspace(novelId);
  const targetVolumeId = resolveStructuredTargetVolumeId(state, workspace);
  if (!targetVolumeId) {
    return;
  }
  const targetVolume = workspace.volumes.find((volume) => volume.id === targetVolumeId);
  if (!targetVolume) {
    return;
  }
  await deps.updateVolumeWorkspace(novelId, {
    volumes: workspace.volumes.map((volume) => (
      volume.id === targetVolumeId
        ? { ...volume, chapters: [] }
        : volume
    )),
    strategyPlan: workspace.strategyPlan,
    critiqueReport: workspace.critiqueReport,
    beatSheets: workspace.beatSheets.filter((sheet) => sheet.volumeId !== targetVolumeId),
    rebalanceDecisions: workspace.rebalanceDecisions.filter((decision) => (
      decision.anchorVolumeId !== targetVolumeId && decision.affectedVolumeId !== targetVolumeId
    )),
  });
  await deleteBlankChaptersByOrders(
    novelId,
    targetVolume.chapters.map((chapter) => chapter.chapterOrder),
  );
}

async function resetChapterExecutionOutputs(
  novelId: string,
  state: DirectorTakeoverLoadedState,
): Promise<void> {
  const range = resolveAutoExecutionRange(state);
  if (!range) {
    return;
  }
  const chapterRows = await prisma.chapter.findMany({
    where: {
      novelId,
      order: {
        gte: range.startOrder,
        lte: range.endOrder,
      },
    },
    select: { id: true },
  });
  if (chapterRows.length === 0) {
    return;
  }
  const chapterIds = chapterRows.map((chapter) => chapter.id);
  await prisma.$transaction(async (tx) => {
    await tx.chapter.updateMany({
      where: { id: { in: chapterIds } },
      data: {
        content: "",
        generationState: "planned",
        chapterStatus: "unplanned",
        repairHistory: null,
        qualityScore: null,
        continuityScore: null,
        characterScore: null,
        pacingScore: null,
        riskFlags: null,
        hook: null,
      },
    });
    await tx.chapterSummary.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.consistencyFact.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.characterTimeline.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.characterCandidate.deleteMany({ where: { novelId, sourceChapterId: { in: chapterIds } } });
    await tx.characterFactionTrack.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.characterRelationStage.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.qualityReport.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
    await tx.auditReport.deleteMany({ where: { novelId, chapterId: { in: chapterIds } } });
  });
}

async function resetQualityRepairOutputs(
  novelId: string,
  state: DirectorTakeoverLoadedState,
): Promise<void> {
  const range = resolveAutoExecutionRange(state);
  if (!range) {
    return;
  }
  const chapterRows = await prisma.chapter.findMany({
    where: {
      novelId,
      order: {
        gte: range.startOrder,
        lte: range.endOrder,
      },
    },
    select: {
      id: true,
      content: true,
    },
  });
  if (chapterRows.length === 0) {
    return;
  }
  const withContentIds = chapterRows.filter((chapter) => chapter.content?.trim()).map((chapter) => chapter.id);
  const emptyIds = chapterRows.filter((chapter) => !chapter.content?.trim()).map((chapter) => chapter.id);
  await prisma.$transaction(async (tx) => {
    if (withContentIds.length > 0) {
      await tx.chapter.updateMany({
        where: { id: { in: withContentIds } },
        data: {
          generationState: "drafted",
          chapterStatus: "unplanned",
          repairHistory: null,
          qualityScore: null,
          continuityScore: null,
          characterScore: null,
          pacingScore: null,
          riskFlags: null,
          hook: null,
        },
      });
    }
    if (emptyIds.length > 0) {
      await tx.chapter.updateMany({
        where: { id: { in: emptyIds } },
        data: {
          generationState: "planned",
          chapterStatus: "unplanned",
          repairHistory: null,
          qualityScore: null,
          continuityScore: null,
          characterScore: null,
          pacingScore: null,
          riskFlags: null,
          hook: null,
        },
      });
    }
    await tx.qualityReport.deleteMany({
      where: {
        novelId,
        chapterId: { in: chapterRows.map((chapter) => chapter.id) },
      },
    });
    await tx.auditReport.deleteMany({
      where: {
        novelId,
        chapterId: { in: chapterRows.map((chapter) => chapter.id) },
      },
    });
  });
}

export async function resetDirectorTakeoverCurrentStep(input: {
  novelId: string;
  plan: DirectorTakeoverResolvedPlan;
  takeoverState: DirectorTakeoverLoadedState;
  deps: DirectorTakeoverResetDeps;
}): Promise<void> {
  if (input.plan.strategy !== "restart_current_step") {
    return;
  }

  if (input.plan.effectiveStep === "story_macro") {
    await resetStoryMacroOutputs(input.novelId);
    return;
  }
  if (input.plan.effectiveStep === "character") {
    await resetCharacterOutputs(input.novelId);
    return;
  }
  if (input.plan.effectiveStep === "outline") {
    await resetOutlineOutputs(input.novelId, input.deps);
    return;
  }
  if (input.plan.effectiveStep === "structured") {
    await resetStructuredOutputs(input.novelId, input.takeoverState, input.deps);
    return;
  }

  await cancelActivePipelineJobIfNeeded(input.takeoverState, input.deps);
  if (input.plan.effectiveStep === "chapter") {
    await resetChapterExecutionOutputs(input.novelId, input.takeoverState);
    return;
  }
  await resetQualityRepairOutputs(input.novelId, input.takeoverState);
}
