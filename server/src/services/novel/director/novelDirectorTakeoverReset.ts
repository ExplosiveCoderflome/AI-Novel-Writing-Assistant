import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import type { DirectorAutoExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import {
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionPlanChapterRange,
  resolveDirectorAutoExecutionRangeFromState,
} from "./novelDirectorAutoExecution";
import type { DirectorTakeoverResolvedPlan } from "./novelDirectorTakeover";
import type { DirectorTakeoverLoadedState } from "./novelDirectorTakeoverRuntime";

interface DirectorTakeoverResetDeps {
  getVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument>;
  updateVolumeWorkspace: (novelId: string, input: unknown) => Promise<VolumePlanDocument>;
  cancelPipelineJob: (jobId: string) => Promise<unknown>;
}

function resolveAutoExecutionRange(state: DirectorTakeoverLoadedState): { startOrder: number; endOrder: number } | null {
  if (state.requestedExecutionRange) {
    return {
      startOrder: state.requestedExecutionRange.startOrder,
      endOrder: state.requestedExecutionRange.endOrder,
    };
  }
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

function resolveChapterOrderRange(chapterOrders: number[]): { startOrder: number; endOrder: number } | null {
  const normalizedOrders = chapterOrders
    .filter((order) => Number.isFinite(order))
    .map((order) => Math.round(order))
    .sort((left, right) => left - right);
  if (normalizedOrders.length === 0) {
    return null;
  }
  return {
    startOrder: normalizedOrders[0],
    endOrder: normalizedOrders[normalizedOrders.length - 1],
  };
}

export async function resolveDirectorTakeoverAutoExecutionResetRange(input: {
  novelId: string;
  autoExecutionPlan?: DirectorAutoExecutionPlan | null;
  takeoverState: DirectorTakeoverLoadedState;
  deps: Pick<DirectorTakeoverResetDeps, "getVolumeWorkspace">;
}): Promise<{ startOrder: number; endOrder: number } | null> {
  if (input.autoExecutionPlan?.mode) {
    const plan = normalizeDirectorAutoExecutionPlan(input.autoExecutionPlan);
    const chapterRange = resolveDirectorAutoExecutionPlanChapterRange(plan);
    if (chapterRange) {
      return {
        startOrder: chapterRange.startOrder,
        endOrder: chapterRange.endOrder,
      };
    }
    if (plan.mode === "volume") {
      const workspace = await input.deps.getVolumeWorkspace(input.novelId);
      const targetVolume = workspace.volumes.find((volume) => volume.sortOrder === plan.volumeOrder);
      const range = resolveChapterOrderRange(
        targetVolume?.chapters.map((chapter) => chapter.chapterOrder) ?? [],
      );
      if (range) {
        return range;
      }
    }
  }
  return resolveAutoExecutionRange(input.takeoverState);
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
  range: { startOrder: number; endOrder: number } | null,
): Promise<void> {
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
  range: { startOrder: number; endOrder: number } | null,
): Promise<void> {
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
  autoExecutionPlan?: DirectorAutoExecutionPlan | null;
  takeoverState: DirectorTakeoverLoadedState;
  deps: DirectorTakeoverResetDeps;
}): Promise<void> {
  if (input.plan.strategy !== "restart_current_step") {
    return;
  }

  if (input.plan.effectiveStep === "story_macro") {
    await resetStoryMacroOutputs(input.novelId);
    await resetCharacterOutputs(input.novelId);
    await resetOutlineOutputs(input.novelId, input.deps);
    return;
  }
  if (input.plan.effectiveStep === "character") {
    await resetCharacterOutputs(input.novelId);
    await resetOutlineOutputs(input.novelId, input.deps);
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
  const autoExecutionRange = await resolveDirectorTakeoverAutoExecutionResetRange({
    novelId: input.novelId,
    autoExecutionPlan: input.autoExecutionPlan,
    takeoverState: input.takeoverState,
    deps: input.deps,
  });
  if (input.plan.effectiveStep === "chapter") {
    await resetChapterExecutionOutputs(input.novelId, autoExecutionRange);
    return;
  }
  await resetQualityRepairOutputs(input.novelId, autoExecutionRange);
}
