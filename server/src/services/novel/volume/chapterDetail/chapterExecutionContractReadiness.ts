import { parseChapterScenePlan, serializeChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import {
  assessChapterExecutionContractShape,
  type ChapterTaskSheetQualityGateResult,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import type { VolumeChapterPlan } from "@ai-novel/shared/types/novel";

export interface PersistedChapterExecutionContract {
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
}

export type ChapterExecutionContractCompatibility = "compatible" | "incompatible";

export interface ChapterExecutionContractReadiness {
  structure: ChapterTaskSheetQualityGateResult;
  compatibility: ChapterExecutionContractCompatibility;
  mismatchedFields: Array<keyof PersistedChapterExecutionContract>;
  canReuse: boolean;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeSceneCards(
  value: string | null | undefined,
  targetWordCount: number | null | undefined,
): string | null {
  const parsed = parseChapterScenePlan(value, {
    targetWordCount: targetWordCount ?? undefined,
  });
  return parsed ? serializeChapterScenePlan(parsed) : null;
}

/**
 * 以当前卷规划中的章节要求为结构基线，并检查已同步到 Chapter 的执行字段是否仍一致。
 * 结构完整只说明规划本身可执行；兼容则说明正文入口实际读取到的是该规划的当前版本。
 */
export function inspectChapterExecutionContractReadiness(input: {
  novelId: string;
  volumeId: string;
  requirement: VolumeChapterPlan;
  persisted: PersistedChapterExecutionContract;
}): ChapterExecutionContractReadiness {
  const structure = assessChapterExecutionContractShape({
    novelId: input.novelId,
    volumeId: input.volumeId,
    chapterId: input.requirement.chapterId ?? input.requirement.id,
    chapterOrder: input.requirement.chapterOrder,
    title: input.requirement.title,
    summary: input.requirement.summary,
    purpose: input.requirement.purpose,
    exclusiveEvent: input.requirement.exclusiveEvent,
    endingState: input.requirement.endingState,
    nextChapterEntryState: input.requirement.nextChapterEntryState,
    conflictLevel: input.requirement.conflictLevel,
    revealLevel: input.requirement.revealLevel,
    targetWordCount: input.requirement.targetWordCount,
    mustAvoid: input.requirement.mustAvoid,
    payoffRefs: input.requirement.payoffRefs,
    taskSheet: input.requirement.taskSheet,
    sceneCards: input.requirement.sceneCards,
  });
  const mismatchedFields: Array<keyof PersistedChapterExecutionContract> = [];
  const scalarFields = ["targetWordCount", "conflictLevel", "revealLevel"] as const;
  for (const field of scalarFields) {
    if ((input.persisted[field] ?? null) !== (input.requirement[field] ?? null)) {
      mismatchedFields.push(field);
    }
  }
  const textFields = ["mustAvoid", "taskSheet"] as const;
  for (const field of textFields) {
    if (normalizeText(input.persisted[field]) !== normalizeText(input.requirement[field])) {
      mismatchedFields.push(field);
    }
  }
  if (
    normalizeSceneCards(input.persisted.sceneCards, input.persisted.targetWordCount)
    !== normalizeSceneCards(input.requirement.sceneCards, input.requirement.targetWordCount)
  ) {
    mismatchedFields.push("sceneCards");
  }
  const compatibility: ChapterExecutionContractCompatibility = mismatchedFields.length === 0
    ? "compatible"
    : "incompatible";
  return {
    structure,
    compatibility,
    mismatchedFields,
    canReuse: structure.canEnterExecution && compatibility === "compatible",
  };
}
