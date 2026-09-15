import type { VolumeChapterPlan, VolumePlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import {
  generatedChapterScenePlanSchema,
  normalizeChapterScenePlan,
  serializeChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";

const FALLBACK_TARGET_WORD_COUNT = 2800;

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function normalizeTargetWordCount(value: number | null | undefined): number | null {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return null;
  }
  return Math.max(200, Math.min(20000, Math.round(value as number)));
}

export function resolveChapterExecutionTargetWordCount(input: {
  chapterTargetWordCount?: number | null;
  novelDefaultChapterLength?: number | null;
  fallback?: number;
}): number {
  return normalizeTargetWordCount(input.chapterTargetWordCount)
    ?? normalizeTargetWordCount(input.novelDefaultChapterLength)
    ?? input.fallback
    ?? FALLBACK_TARGET_WORD_COUNT;
}

function buildFallbackSceneCards(chapter: VolumeChapterPlan, targetWordCount: number): string {
  const baseSummary = chapter.summary.trim() || chapter.title.trim() || "推进本章核心情节";
  const purpose = chapter.purpose?.trim() || baseSummary;
  const exclusiveEvent = chapter.exclusiveEvent?.trim() || baseSummary;
  const endingState = chapter.endingState?.trim() || "本章关键变化完成，局势进入可承接的新状态。";
  const nextEntry = chapter.nextChapterEntryState?.trim() || "下一章承接本章结果，继续处理新压力和未解问题。";
  const perScene = Math.max(1, Math.floor(targetWordCount / 3));
  const remainder = targetWordCount - perScene * 3;
  const sceneTargets = [perScene, perScene, perScene + remainder];

  return serializeChapterScenePlan(normalizeChapterScenePlan({
    scenes: [
      {
        key: "scene_1",
        title: "压力入场",
        purpose: `建立本章入口压力：${purpose}`,
        mustAdvance: [purpose],
        mustPreserve: [],
        entryState: "承接上一章状态，主角面对当前压力。",
        exitState: "主角被迫做出推进本章任务的行动选择。",
        forbiddenExpansion: [chapter.mustAvoid?.trim() || "避免偏离本章核心任务。"],
        targetWordCount: sceneTargets[0],
        resistance: "外部压力或现实阻碍逼近。",
        turn: "主角从被动承受到主动应对。",
        emotionalShift: "压力升高，行动意愿变强。",
        readerValue: "读者看清本章问题和期待的解决方向。",
      },
      {
        key: "scene_2",
        title: "关键推进",
        purpose: exclusiveEvent,
        mustAdvance: [exclusiveEvent],
        mustPreserve: [],
        entryState: "主角开始执行本章关键行动。",
        exitState: "行动带来明确结果或新的反制压力。",
        forbiddenExpansion: [chapter.mustAvoid?.trim() || "不要跳过本章必须发生的独占事件。"],
        targetWordCount: sceneTargets[1],
        resistance: "对手、环境或信息差制造阻碍。",
        turn: "关键事实、选择或冲突让局面发生变化。",
        emotionalShift: "从试探进入更强烈的决断或紧张。",
        readerValue: "本章核心事件落地，读者获得阶段推进感。",
      },
      {
        key: "scene_3",
        title: "收束牵引",
        purpose: `收束到章末状态：${endingState}`,
        mustAdvance: [endingState],
        mustPreserve: [],
        entryState: "关键推进后的结果开始显形。",
        exitState: endingState,
        forbiddenExpansion: [chapter.mustAvoid?.trim() || `不要把下一章入口事件提前落地：${nextEntry}`],
        targetWordCount: sceneTargets[2],
        resistance: "结果带来余波或新的未解压力。",
        turn: "章末留下可继续推进的入口。",
        emotionalShift: "阶段结果落定，同时保留追读压力。",
        readerValue: "读者获得本章兑现，并自然期待下一章。",
      },
    ],
    readerExperience: {
      readerQuestion: `主角能否完成本章目标：${purpose}`,
      promisedReward: `本章让读者看到：${exclusiveEvent}`,
      rewardLevel: "partial",
      protagonistWant: purpose,
      primaryResistance: chapter.mustAvoid?.trim() || "现实压力、对手阻挠或信息差限制主角行动。",
      keyTurn: chapter.exclusiveEvent?.trim() || endingState,
      emotionalShift: "从承压进入行动，再在章末保留新的追读压力。",
      informationReveal: (chapter.payoffRefs ?? []).length > 0
        ? `本章触碰或推进这些回报线索：${(chapter.payoffRefs ?? []).join("、")}`
        : "本章交付与当前冲突直接相关的新信息或新判断。",
      netChange: endingState,
      inheritedHookResponsibilities: [],
      endingHook: nextEntry,
    },
  }, targetWordCount));
}

function normalizeSceneCardsWithFallback(chapter: VolumeChapterPlan, targetWordCount: number): string {
  if (chapter.sceneCards?.trim()) {
    try {
      const normalized = normalizeChapterScenePlan(chapter.sceneCards, targetWordCount);
      if (generatedChapterScenePlanSchema.safeParse(normalized).success) {
        return serializeChapterScenePlan(normalized);
      }
    } catch {
      // Fall through to a conservative scene plan so stale partial contracts can recover.
    }
  }
  return buildFallbackSceneCards(chapter, targetWordCount);
}

export function completeChapterExecutionContractFallback(input: {
  chapter: VolumeChapterPlan;
  novelDefaultChapterLength?: number | null;
}): VolumeChapterPlan {
  const chapter = input.chapter;
  const targetWordCount = resolveChapterExecutionTargetWordCount({
    chapterTargetWordCount: chapter.targetWordCount,
    novelDefaultChapterLength: input.novelDefaultChapterLength,
  });
  const summary = chapter.summary.trim() || chapter.title.trim() || "推进本章核心情节";
  const purpose = chapter.purpose?.trim() || summary;
  const exclusiveEvent = chapter.exclusiveEvent?.trim() || summary;
  const endingState = chapter.endingState?.trim() || `本章完成“${chapter.title}”的阶段推进，局势发生明确变化。`;
  const nextChapterEntryState = chapter.nextChapterEntryState?.trim() || "下一章承接本章结果，继续推进新压力或未解问题。";
  const mustAvoid = chapter.mustAvoid?.trim() || "避免偏离本章任务单、提前解决后续章节核心冲突，或写出与既定设定矛盾的内容。";
  const completed: VolumeChapterPlan = {
    ...chapter,
    purpose,
    exclusiveEvent,
    endingState,
    nextChapterEntryState,
    conflictLevel: typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : 3,
    revealLevel: typeof chapter.revealLevel === "number" ? chapter.revealLevel : 2,
    targetWordCount,
    mustAvoid,
    taskSheet: chapter.taskSheet?.trim()
      || [
        `本章目标：${purpose}`,
        `独占事件：${exclusiveEvent}`,
        `章末状态：${endingState}`,
        `下章入口：${nextChapterEntryState}`,
        `禁止事项：${mustAvoid}`,
      ].join("\n"),
    sceneCards: normalizeSceneCardsWithFallback({
      ...chapter,
      purpose,
      exclusiveEvent,
      endingState,
      nextChapterEntryState,
      targetWordCount,
      mustAvoid,
    }, targetWordCount),
  };
  return completed;
}

export function completeExecutionContractsInDocument(input: {
  document: VolumePlanDocument;
  novelDefaultChapterLength?: number | null;
  chapterRange?: { startOrder: number; endOrder: number };
}): VolumePlanDocument {
  let changed = false;
  const volumes: VolumePlan[] = input.document.volumes.map((volume) => ({
    ...volume,
    chapters: volume.chapters.map((chapter) => {
      if (
        input.chapterRange
        && (chapter.chapterOrder < input.chapterRange.startOrder || chapter.chapterOrder > input.chapterRange.endOrder)
      ) {
        return chapter;
      }
      const hasExecutionArtifact = Boolean(chapter.taskSheet?.trim() || chapter.sceneCards?.trim());
      if (!hasExecutionArtifact) {
        return chapter;
      }
      const completed = completeChapterExecutionContractFallback({
        chapter,
        novelDefaultChapterLength: input.novelDefaultChapterLength,
      });
      if (JSON.stringify(completed) !== JSON.stringify(chapter)) {
        changed = true;
      }
      return completed;
    }),
  }));

  return changed ? { ...input.document, volumes } : input.document;
}
