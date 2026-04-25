import type { VolumePlanDocument, VolumeChapterPlan } from "@ai-novel/shared/types/novel";
import { resolveStructuredOutlineRecoveryCursor } from "./novelDirectorStructuredOutlineRecovery";

export interface DirectorTakeoverChapterSyncRef {
  id: string;
  order: number;
  title?: string | null;
  expectation?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  content?: string | null;
  generationState?: string | null;
}

export interface DirectorTakeoverCompletenessSnapshot {
  expectedVolumeCount: number | null;
  plannedChapterCount: number;
  volumePlanningReady: boolean;
  structuredOutlineReady: boolean;
  chapterSyncReady: boolean;
  structuredOutlineRecoveryStep: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync" | "completed" | null;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveExpectedVolumeCount(workspace: VolumePlanDocument | null): number | null {
  const recommended = workspace?.strategyPlan?.recommendedVolumeCount;
  if (typeof recommended !== "number" || !Number.isFinite(recommended) || recommended < 1) {
    return null;
  }
  return Math.round(recommended);
}

function hasConsecutiveSortOrders(sortOrders: number[], expectedCount: number): boolean {
  if (sortOrders.length !== expectedCount) {
    return false;
  }
  const ordered = sortOrders.slice().sort((left, right) => left - right);
  return ordered.every((sortOrder, index) => sortOrder === index + 1);
}

function resolveVolumePlanningReady(workspace: VolumePlanDocument | null, expectedVolumeCount: number | null): boolean {
  if (!workspace?.strategyPlan || !expectedVolumeCount) {
    return false;
  }
  return hasConsecutiveSortOrders(workspace.volumes.map((volume) => volume.sortOrder), expectedVolumeCount)
    && hasConsecutiveSortOrders(workspace.strategyPlan.volumes.map((volume) => volume.sortOrder), expectedVolumeCount);
}

function resolveStructuredOutlineReady(input: {
  workspace: VolumePlanDocument | null;
  estimatedChapterCount?: number | null;
  volumePlanningReady: boolean;
}): boolean {
  if (!input.workspace || !input.volumePlanningReady) {
    return false;
  }
  return input.workspace.volumes.every((volume) => {
    const cursor = resolveStructuredOutlineRecoveryCursor({
      workspace: input.workspace!,
      plan: { mode: "volume", volumeOrder: volume.sortOrder },
      estimatedChapterCount: input.estimatedChapterCount,
    });
    return cursor.step === "chapter_sync";
  });
}

function nullableNumberEquals(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function isChapterSyncedToPlan(chapter: VolumeChapterPlan, existing: DirectorTakeoverChapterSyncRef | null): boolean {
  if (!existing) {
    return false;
  }
  if (normalizeText(existing.title) !== normalizeText(chapter.title)) {
    return false;
  }
  const plannedSummary = normalizeText(chapter.summary);
  if (plannedSummary && normalizeText(existing.expectation) !== plannedSummary) {
    return false;
  }
  return nullableNumberEquals(existing.targetWordCount, chapter.targetWordCount)
    && nullableNumberEquals(existing.conflictLevel, chapter.conflictLevel)
    && nullableNumberEquals(existing.revealLevel, chapter.revealLevel)
    && normalizeText(existing.mustAvoid) === normalizeText(chapter.mustAvoid)
    && normalizeText(existing.taskSheet) === normalizeText(chapter.taskSheet)
    && normalizeText(existing.sceneCards) === normalizeText(chapter.sceneCards);
}

function resolveChapterSyncReady(input: {
  workspace: VolumePlanDocument | null;
  chapterStates: DirectorTakeoverChapterSyncRef[];
  structuredOutlineReady: boolean;
}): boolean {
  if (!input.workspace || !input.structuredOutlineReady) {
    return false;
  }
  const existingByOrder = new Map(input.chapterStates.map((chapter) => [chapter.order, chapter]));
  return input.workspace.volumes
    .flatMap((volume) => volume.chapters)
    .every((chapter) => isChapterSyncedToPlan(chapter, existingByOrder.get(chapter.chapterOrder) ?? null));
}

export function buildDirectorTakeoverCompletenessSnapshot(input: {
  workspace: VolumePlanDocument | null;
  chapterStates: DirectorTakeoverChapterSyncRef[];
  estimatedChapterCount?: number | null;
}): DirectorTakeoverCompletenessSnapshot {
  const expectedVolumeCount = resolveExpectedVolumeCount(input.workspace);
  const plannedChapterCount = input.workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0;
  const volumePlanningReady = resolveVolumePlanningReady(input.workspace, expectedVolumeCount);
  const structuredOutlineReady = resolveStructuredOutlineReady({
    workspace: input.workspace,
    estimatedChapterCount: input.estimatedChapterCount,
    volumePlanningReady,
  });
  const chapterSyncReady = resolveChapterSyncReady({
    workspace: input.workspace,
    chapterStates: input.chapterStates,
    structuredOutlineReady,
  });
  const structuredOutlineRecoveryStep = input.workspace && volumePlanningReady
    ? resolveStructuredOutlineRecoveryCursor({
      workspace: input.workspace,
      plan: { mode: "volume", volumeOrder: 1 },
      estimatedChapterCount: input.estimatedChapterCount,
    }).step
    : null;

  return {
    expectedVolumeCount,
    plannedChapterCount,
    volumePlanningReady,
    structuredOutlineReady,
    chapterSyncReady,
    structuredOutlineRecoveryStep,
  };
}
