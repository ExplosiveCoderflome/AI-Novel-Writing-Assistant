import type {
  CharacterCandidate,
  CharacterFactionTrack,
  CharacterRelationStage,
  CharacterVolumeAssignment,
  DynamicCharacterCurrentVolume,
  DynamicCharacterOverviewItem,
  DynamicCharacterRiskLevel,
} from "@ai-novel/shared/types/characterDynamics";
import type { VolumeDynamicsProjection } from "./characterDynamicsSchemas";

export interface VolumeWindow {
  id: string;
  sortOrder: number;
  title: string;
  chapterOrders: number[];
}

export function safeJsonArray<T>(value: string | null | undefined, fallback: T[] = []): T[] {
  if (!value?.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  ));
}

function normalizeProjectionText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeProjectionChapterOrders(chapterOrders: number[]): number[] {
  return Array.from(new Set(
    chapterOrders.filter((order) => Number.isInteger(order) && order > 0),
  )).sort((left, right) => left - right);
}

function pickLatestDefinedValue(current: number | null | undefined, next: number | null | undefined): number | null | undefined {
  if (typeof next !== "number") {
    return current;
  }
  return next;
}

export function mergeProjectionAssignments(
  assignments: VolumeDynamicsProjection["assignments"],
): VolumeDynamicsProjection["assignments"] {
  const byKey = new Map<string, VolumeDynamicsProjection["assignments"][number]>();

  for (const assignment of assignments) {
    const normalizedCharacterName = assignment.characterName.trim();
    const normalizedRoleLabel = normalizeProjectionText(assignment.roleLabel);
    const normalizedResponsibility = assignment.responsibility.trim();
    const normalizedAppearanceExpectation = normalizeProjectionText(assignment.appearanceExpectation);
    const normalizedPlannedChapterOrders = normalizeProjectionChapterOrders(assignment.plannedChapterOrders);
    const key = `${normalizedCharacterName.toLowerCase()}::${assignment.volumeSortOrder}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...assignment,
        characterName: normalizedCharacterName,
        roleLabel: normalizedRoleLabel,
        responsibility: normalizedResponsibility,
        appearanceExpectation: normalizedAppearanceExpectation,
        plannedChapterOrders: normalizedPlannedChapterOrders,
      });
      continue;
    }

    byKey.set(key, {
      ...existing,
      ...assignment,
      characterName: existing.characterName,
      roleLabel: normalizedRoleLabel ?? existing.roleLabel,
      responsibility: normalizedResponsibility || existing.responsibility,
      appearanceExpectation: normalizedAppearanceExpectation ?? existing.appearanceExpectation,
      plannedChapterOrders: normalizeProjectionChapterOrders([
        ...existing.plannedChapterOrders,
        ...normalizedPlannedChapterOrders,
      ]),
      isCore: existing.isCore || assignment.isCore,
      absenceWarningThreshold: pickLatestDefinedValue(existing.absenceWarningThreshold, assignment.absenceWarningThreshold),
      absenceHighRiskThreshold: pickLatestDefinedValue(existing.absenceHighRiskThreshold, assignment.absenceHighRiskThreshold),
    });
  }

  return [...byKey.values()];
}

export function collapseVolumeProjectionAssignments(
  assignments: VolumeDynamicsProjection["assignments"],
): VolumeDynamicsProjection["assignments"] {
  return mergeProjectionAssignments(assignments);
}

export function buildVolumeWindows(
  volumes: Array<{ id: string; sortOrder: number; title: string; chapters: Array<{ chapterOrder: number }> }>,
): VolumeWindow[] {
  return volumes.map((volume) => ({
    id: volume.id,
    sortOrder: volume.sortOrder,
    title: volume.title,
    chapterOrders: volume.chapters.map((chapter) => chapter.chapterOrder).sort((a, b) => a - b),
  }));
}

export function resolveCurrentVolume(
  volumes: VolumeWindow[],
  currentChapterOrder: number | null,
): DynamicCharacterCurrentVolume | null {
  if (volumes.length === 0) {
    return null;
  }

  const byCurrentOrder = typeof currentChapterOrder === "number"
    ? volumes.find((volume) => volume.chapterOrders.includes(currentChapterOrder))
    : null;
  const firstFuture = typeof currentChapterOrder === "number"
    ? volumes.find((volume) => {
        const endOrder = volume.chapterOrders[volume.chapterOrders.length - 1];
        return typeof endOrder === "number" && endOrder >= currentChapterOrder;
      })
    : null;
  const picked = byCurrentOrder ?? firstFuture ?? volumes[volumes.length - 1] ?? null;
  if (!picked) {
    return null;
  }

  return {
    id: picked.id,
    title: picked.title,
    sortOrder: picked.sortOrder,
    startChapterOrder: picked.chapterOrders[0] ?? null,
    endChapterOrder: picked.chapterOrders[picked.chapterOrders.length - 1] ?? null,
    currentChapterOrder,
  };
}

export function countAbsenceSpan(
  plannedChapterOrders: number[],
  appearanceOrders: number[],
  currentChapterOrder: number | null,
): number {
  if (plannedChapterOrders.length === 0 || typeof currentChapterOrder !== "number") {
    return 0;
  }
  const relevantPlanned = plannedChapterOrders.filter((order) => order <= currentChapterOrder).sort((a, b) => a - b);
  if (relevantPlanned.length === 0) {
    return 0;
  }
  const relevantAppearances = appearanceOrders.filter((order) => order <= currentChapterOrder).sort((a, b) => a - b);
  const lastAppearance = relevantAppearances[relevantAppearances.length - 1];
  if (typeof lastAppearance !== "number") {
    return relevantPlanned.length;
  }
  return relevantPlanned.filter((order) => order > lastAppearance).length;
}

export function computeAbsenceRisk(
  isCore: boolean,
  absenceSpan: number,
  warningThreshold: number,
  highThreshold: number,
): DynamicCharacterRiskLevel {
  if (absenceSpan >= highThreshold) {
    return isCore ? "high" : "info";
  }
  if (absenceSpan >= warningThreshold) {
    return isCore ? "warn" : "info";
  }
  return "none";
}

export function buildOverviewSummary(input: {
  volumeTitle: string | null;
  coreCount: number;
  warnCount: number;
  highCount: number;
  pendingCandidateCount: number;
  relationStageCount: number;
}): string {
  const segments = [
    input.volumeTitle ? `当前卷：${input.volumeTitle}` : "当前卷：未定位",
    `核心角色 ${input.coreCount} 个`,
    input.highCount > 0 ? `${input.highCount} 个角色已高风险缺席` : "",
    input.warnCount > 0 ? `${input.warnCount} 个角色接近缺席阈值` : "",
    input.pendingCandidateCount > 0 ? `待确认新角色 ${input.pendingCandidateCount} 个` : "",
    input.relationStageCount > 0 ? `当前关系阶段 ${input.relationStageCount} 条` : "",
  ];
  return segments.filter(Boolean).join("，");
}

export function toCharacterCandidate(row: {
  id: string;
  novelId: string;
  sourceChapterId: string | null;
  sourceChapter?: { order: number } | null;
  proposedName: string;
  proposedRole: string | null;
  summary: string | null;
  evidenceJson: string | null;
  matchedCharacterId: string | null;
  status: string;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterCandidate {
  return {
    id: row.id,
    novelId: row.novelId,
    sourceChapterId: row.sourceChapterId,
    sourceChapterOrder: row.sourceChapter?.order ?? null,
    proposedName: row.proposedName,
    proposedRole: row.proposedRole,
    summary: row.summary,
    evidence: safeJsonArray<string>(row.evidenceJson, []),
    matchedCharacterId: row.matchedCharacterId,
    status: row.status as CharacterCandidate["status"],
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCharacterVolumeAssignment(row: {
  id: string;
  novelId: string;
  characterId: string;
  volumeId: string;
  volume?: { title: string } | null;
  roleLabel: string | null;
  responsibility: string;
  appearanceExpectation: string | null;
  plannedChapterOrdersJson: string | null;
  isCore: boolean;
  absenceWarningThreshold: number;
  absenceHighRiskThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}): CharacterVolumeAssignment {
  return {
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    volumeId: row.volumeId,
    volumeTitle: row.volume?.title ?? null,
    roleLabel: row.roleLabel,
    responsibility: row.responsibility,
    appearanceExpectation: row.appearanceExpectation,
    plannedChapterOrders: safeJsonArray<number>(row.plannedChapterOrdersJson, []),
    isCore: row.isCore,
    absenceWarningThreshold: row.absenceWarningThreshold,
    absenceHighRiskThreshold: row.absenceHighRiskThreshold,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCharacterFactionTrack(row: {
  id: string;
  novelId: string;
  characterId: string;
  volumeId: string | null;
  volume?: { title: string } | null;
  chapterId: string | null;
  chapterOrder: number | null;
  factionLabel: string;
  stanceLabel: string | null;
  summary: string | null;
  sourceType: string;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterFactionTrack {
  return {
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    volumeId: row.volumeId,
    volumeTitle: row.volume?.title ?? null,
    chapterId: row.chapterId,
    chapterOrder: row.chapterOrder,
    factionLabel: row.factionLabel,
    stanceLabel: row.stanceLabel,
    summary: row.summary,
    sourceType: row.sourceType,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCharacterRelationStage(row: {
  id: string;
  novelId: string;
  relationId: string | null;
  sourceCharacterId: string;
  targetCharacterId: string;
  sourceCharacter: { name: string };
  targetCharacter: { name: string };
  volumeId: string | null;
  volume?: { title: string } | null;
  chapterId: string | null;
  chapterOrder: number | null;
  stageLabel: string;
  stageSummary: string;
  nextTurnPoint: string | null;
  sourceType: string;
  confidence: number | null;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CharacterRelationStage {
  return {
    id: row.id,
    novelId: row.novelId,
    relationId: row.relationId,
    sourceCharacterId: row.sourceCharacterId,
    targetCharacterId: row.targetCharacterId,
    sourceCharacterName: row.sourceCharacter.name,
    targetCharacterName: row.targetCharacter.name,
    volumeId: row.volumeId,
    volumeTitle: row.volume?.title ?? null,
    chapterId: row.chapterId,
    chapterOrder: row.chapterOrder,
    stageLabel: row.stageLabel,
    stageSummary: row.stageSummary,
    nextTurnPoint: row.nextTurnPoint,
    sourceType: row.sourceType,
    confidence: row.confidence,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildOverviewItem(input: {
  character: {
    id: string;
    name: string;
    role: string;
    castRole: string | null;
    currentState: string | null;
    currentGoal: string | null;
  };
  assignment: CharacterVolumeAssignment | null;
  factionTrack: CharacterFactionTrack | null;
  appearanceOrders: number[];
  currentChapterOrder: number | null;
}): DynamicCharacterOverviewItem {
  const plannedChapterOrders = input.assignment?.plannedChapterOrders ?? [];
  const lastAppearanceChapterOrder = input.appearanceOrders[input.appearanceOrders.length - 1] ?? null;
  const absenceSpan = countAbsenceSpan(plannedChapterOrders, input.appearanceOrders, input.currentChapterOrder);
  const warningThreshold = input.assignment?.absenceWarningThreshold ?? 3;
  const highThreshold = input.assignment?.absenceHighRiskThreshold ?? 5;
  return {
    characterId: input.character.id,
    name: input.character.name,
    role: input.character.role,
    castRole: input.character.castRole,
    currentState: input.character.currentState,
    currentGoal: input.character.currentGoal,
    volumeRoleLabel: input.assignment?.roleLabel ?? null,
    volumeResponsibility: input.assignment?.responsibility ?? null,
    isCoreInVolume: input.assignment?.isCore ?? false,
    plannedChapterOrders,
    appearanceCount: input.appearanceOrders.length,
    lastAppearanceChapterOrder,
    absenceSpan,
    absenceRisk: computeAbsenceRisk(input.assignment?.isCore ?? false, absenceSpan, warningThreshold, highThreshold),
    factionLabel: input.factionTrack?.factionLabel ?? null,
    stanceLabel: input.factionTrack?.stanceLabel ?? null,
  };
}
