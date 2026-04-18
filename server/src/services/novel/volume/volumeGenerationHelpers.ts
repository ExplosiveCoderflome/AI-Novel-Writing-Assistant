import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumeChapterListGenerationMode,
  VolumeGenerationScope,
  VolumeGenerationScopeInput,
  VolumeChapterPlan,
  VolumePlan,
  VolumePlanDocument,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import {
  normalizeChapterScenePlan,
  serializeChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { volumeChapterTaskSheetPrompt } from "../../../prompting/prompts/novel/volume/chapterDetail.prompts";
import { buildVolumeChapterDetailContextBlocks } from "../../../prompting/prompts/novel/volume/contextBlocks";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { buildVolumeWorkspaceDocument } from "./volumeWorkspaceDocument";
import type {
  ChapterDetailMode,
  VolumeGenerateOptions,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "./volumeModels";

type StoryMacroPlanResult = Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;

export interface GeneratedVolumeChapterBlock {
  beatKey: string;
  beatLabel: string;
  chapterCount: number;
  chapters: Array<{
    beatKey: string;
    title: string;
    summary: string;
  }>;
}

export function normalizeScope(scope?: VolumeGenerationScopeInput): VolumeGenerationScope {
  if (scope === "book") {
    return "skeleton";
  }
  if (scope === "volume") {
    return "chapter_list";
  }
  return scope ?? "strategy";
}

export function deriveChapterBudget(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  options: VolumeGenerateOptions;
}): number {
  const { novel, workspace, options } = params;
  return Math.max(
    options.estimatedChapterCount ?? 0,
    novel.estimatedChapterCount ?? 0,
    workspace.volumes.flatMap((volume) => volume.chapters).length,
    12,
  );
}

export function allocateChapterBudgets(params: {
  volumeCount: number;
  chapterBudget: number;
  existingVolumes: VolumePlan[];
}): number[] {
  const { volumeCount, chapterBudget, existingVolumes } = params;
  const safeVolumeCount = Math.max(volumeCount, 1);
  const minimumPerVolume = 3;
  const totalBudget = Math.max(chapterBudget, safeVolumeCount * minimumPerVolume);
  const existingCounts = Array.from(
    { length: safeVolumeCount },
    (_, index) => Math.max(existingVolumes[index]?.chapters.length ?? 0, 0),
  );
  const hasUsefulWeights = existingCounts.some((count) => count >= minimumPerVolume);
  const weights = hasUsefulWeights
    ? existingCounts.map((count) => Math.max(count, 1))
    : Array.from({ length: safeVolumeCount }, () => 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const budgets = weights.map((weight) => Math.max(minimumPerVolume, Math.round((totalBudget * weight) / totalWeight)));
  let delta = totalBudget - budgets.reduce((sum, budget) => sum + budget, 0);

  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    for (let index = 0; index < budgets.length && delta !== 0; index += 1) {
      if (direction < 0 && budgets[index] <= minimumPerVolume) {
        continue;
      }
      budgets[index] += direction;
      delta -= direction;
    }
  }

  return budgets;
}

export function getTargetVolume(document: VolumePlanDocument, targetVolumeId?: string): VolumePlan {
  const volumeId = targetVolumeId?.trim();
  if (!volumeId) {
    throw new Error("缺少目标卷。");
  }
  const targetVolume = document.volumes.find((volume) => volume.id === volumeId);
  if (!targetVolume) {
    throw new Error("目标卷不存在。");
  }
  return targetVolume;
}

export function getTargetChapter(targetVolume: VolumePlan, targetChapterId?: string): VolumePlan["chapters"][number] {
  const chapterId = targetChapterId?.trim();
  if (!chapterId) {
    throw new Error("缺少目标章节。");
  }
  const targetChapter = targetVolume.chapters.find((chapter) => chapter.id === chapterId);
  if (!targetChapter) {
    throw new Error("目标章节不存在。");
  }
  return targetChapter;
}

export function getBeatSheet(document: VolumePlanDocument, volumeId: string): VolumeBeatSheet | null {
  return document.beatSheets.find((sheet) => sheet.volumeId === volumeId && sheet.beats.length > 0) ?? null;
}

export function parseBeatChapterSpan(chapterSpanHint: string): { start: number; end: number } | null {
  const matches = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (matches.length === 0 || matches.some((value) => Number.isNaN(value))) {
    return null;
  }
  const start = Math.max(1, matches[0]);
  const end = Math.max(start, matches[matches.length - 1]);
  return { start, end };
}

export function getBeatExpectedChapterCount(beat: Pick<VolumeBeat, "chapterSpanHint">): number {
  const span = parseBeatChapterSpan(beat.chapterSpanHint);
  if (!span) {
    return 0;
  }
  return Math.max(1, span.end - span.start + 1);
}

function buildLocalVolumeChapterOrderMap(volume: VolumePlan): Map<string, number> {
  return new Map(
    volume.chapters
      .slice()
      .sort((left, right) => left.chapterOrder - right.chapterOrder)
      .map((chapter, index) => [chapter.id, index + 1]),
  );
}

export function resolveVolumeChapterBeatKey(params: {
  chapter: VolumeChapterPlan;
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet | null;
}): string | null {
  const normalizedBeatKey = params.chapter.beatKey?.trim();
  if (normalizedBeatKey) {
    return normalizedBeatKey;
  }
  if (!params.beatSheet) {
    return null;
  }
  const localOrderMap = buildLocalVolumeChapterOrderMap(params.volume);
  const localOrder = localOrderMap.get(params.chapter.id);
  if (!localOrder) {
    return null;
  }
  const matchedBeat = params.beatSheet.beats.find((beat) => {
    const span = parseBeatChapterSpan(beat.chapterSpanHint);
    return span ? localOrder >= span.start && localOrder <= span.end : false;
  });
  return matchedBeat?.key ?? null;
}

function buildExistingBeatChapterGroups(params: {
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet;
}): {
  groups: Map<string, VolumeChapterPlan[]>;
  unmatched: VolumeChapterPlan[];
} {
  const groups = new Map<string, VolumeChapterPlan[]>(
    params.beatSheet.beats.map((beat) => [beat.key, []]),
  );
  const unmatched: VolumeChapterPlan[] = [];
  for (const chapter of params.volume.chapters.slice().sort((left, right) => left.chapterOrder - right.chapterOrder)) {
    const beatKey = resolveVolumeChapterBeatKey({
      chapter,
      volume: params.volume,
      beatSheet: params.beatSheet,
    });
    if (!beatKey || !groups.has(beatKey)) {
      unmatched.push(chapter);
      continue;
    }
    groups.get(beatKey)?.push(chapter);
  }
  return { groups, unmatched };
}

function cloneExistingChapterWithBeatKey(chapter: VolumeChapterPlan, beatKey: string | null): VolumeChapterPlan {
  return {
    ...chapter,
    beatKey,
  };
}

export function assertScopeReadiness(
  document: VolumePlanDocument,
  scope: VolumeGenerationScope,
  targetVolumeId?: string,
): void {
  if (scope === "strategy") {
    return;
  }
  if (scope === "strategy_critique" || scope === "skeleton") {
    if (!document.strategyPlan) {
      throw new Error("请先生成卷战略建议，再继续当前步骤。");
    }
    return;
  }
  if (scope === "beat_sheet") {
    if (!document.strategyPlan) {
      throw new Error("请先生成卷战略建议，再生成当前卷节奏板。");
    }
    getTargetVolume(document, targetVolumeId);
    return;
  }
  if (scope === "chapter_list") {
    const targetVolume = getTargetVolume(document, targetVolumeId);
    if (!getBeatSheet(document, targetVolume.id)) {
      throw new Error("当前卷还没有节奏板，不能直接拆章节列表。");
    }
    return;
  }
  if (scope === "rebalance") {
    const targetVolume = getTargetVolume(document, targetVolumeId);
    if (!document.strategyPlan) {
      throw new Error("请先生成卷战略建议，再生成相邻卷再平衡建议。");
    }
    if (!getBeatSheet(document, targetVolume.id)) {
      throw new Error("请先生成当前卷节奏板，再生成相邻卷再平衡建议。");
    }
    if (targetVolume.chapters.length === 0) {
      throw new Error("请先生成当前卷章节列表，再生成相邻卷再平衡建议。");
    }
    return;
  }
  const targetVolume = getTargetVolume(document, targetVolumeId);
  if (!getBeatSheet(document, targetVolume.id)) {
    throw new Error("请先生成当前卷节奏板，再细化章节。");
  }
}

export function mergeStrategyPlan(document: VolumePlanDocument, strategyPlan: VolumeStrategyPlan): VolumePlanDocument {
  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

export function mergeCritiqueReport(document: VolumePlanDocument, critiqueReport: VolumePlanDocument["critiqueReport"]): VolumePlanDocument {
  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan: document.strategyPlan,
    critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

export function mergeSkeleton(document: VolumePlanDocument, generatedVolumes: Array<{
  title: string;
  summary?: string | null;
  openingHook: string;
  mainPromise: string;
  primaryPressureSource: string;
  coreSellingPoint: string;
  escalationMode: string;
  protagonistChange: string;
  midVolumeRisk: string;
  climax: string;
  payoffType: string;
  nextVolumeHook: string;
  resetPoint?: string | null;
  openPayoffs: string[];
}>): VolumePlanDocument {
  const mergedVolumes = generatedVolumes.map((volume, index) => {
    const existing = document.volumes[index];
    return {
      id: existing?.id,
      novelId: document.novelId,
      sortOrder: index + 1,
      title: volume.title,
      summary: volume.summary ?? null,
      openingHook: volume.openingHook,
      mainPromise: volume.mainPromise,
      primaryPressureSource: volume.primaryPressureSource,
      coreSellingPoint: volume.coreSellingPoint,
      escalationMode: volume.escalationMode,
      protagonistChange: volume.protagonistChange,
      midVolumeRisk: volume.midVolumeRisk,
      climax: volume.climax,
      payoffType: volume.payoffType,
      nextVolumeHook: volume.nextVolumeHook,
      resetPoint: volume.resetPoint ?? null,
      openPayoffs: volume.openPayoffs,
      status: existing?.status ?? "active",
      sourceVersionId: existing?.sourceVersionId ?? null,
      chapters: existing?.chapters ?? [],
      createdAt: existing?.createdAt ?? new Date(0).toISOString(),
      updatedAt: existing?.updatedAt ?? new Date(0).toISOString(),
    };
  });

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: mergedVolumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: [],
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

export function mergeBeatSheet(
  document: VolumePlanDocument,
  targetVolume: VolumePlan,
  beats: VolumeBeatSheet["beats"],
): VolumePlanDocument {
  const nextBeatSheets = [
    ...document.beatSheets.filter((sheet) => sheet.volumeId !== targetVolume.id),
    {
      volumeId: targetVolume.id,
      volumeSortOrder: targetVolume.sortOrder,
      status: "generated" as const,
      beats,
    },
  ].sort((left, right) => left.volumeSortOrder - right.volumeSortOrder);

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: nextBeatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

export function mergeChapterList(
  document: VolumePlanDocument,
  targetVolumeId: string,
  targetBeatSheet: VolumeBeatSheet,
  generatedBlocks: GeneratedVolumeChapterBlock[],
  options: {
    generationMode?: VolumeChapterListGenerationMode;
    targetBeatKey?: string;
    resumeFromBeatKey?: string | null;
  } = {},
): VolumePlanDocument {
  const mergedVolumes = document.volumes.map((volume) => {
    if (volume.id !== targetVolumeId) {
      return volume;
    }

    const { groups: existingGroups, unmatched } = buildExistingBeatChapterGroups({
      volume,
      beatSheet: targetBeatSheet,
    });
    const generatedBlocksByBeatKey = new Map(
      generatedBlocks.map((block) => [block.beatKey, block]),
    );
    const generationMode = options.generationMode ?? "full_volume";
    const resumeBeatKey = options.resumeFromBeatKey?.trim() || null;
    const resumeBeatIndex = resumeBeatKey
      ? targetBeatSheet.beats.findIndex((beat) => beat.key === resumeBeatKey)
      : -1;
    const nextChapters: VolumeChapterPlan[] = [];

    for (const [beatIndex, beat] of targetBeatSheet.beats.entries()) {
      const existingBeatChapters = existingGroups.get(beat.key) ?? [];
      const generatedBlock = generatedBlocksByBeatKey.get(beat.key);

      if (!generatedBlock) {
        const shouldPreserveExistingBeat = generationMode === "single_beat"
          || (generationMode === "full_volume" && resumeBeatIndex >= 0 && beatIndex < resumeBeatIndex);
        if (shouldPreserveExistingBeat) {
          nextChapters.push(
            ...existingBeatChapters.map((chapter) => cloneExistingChapterWithBeatKey(chapter, beat.key)),
          );
        }
        continue;
      }

      for (const [chapterIndex, chapter] of generatedBlock.chapters.entries()) {
        const existingChapter = existingBeatChapters[chapterIndex];
        nextChapters.push({
          id: existingChapter?.id,
          volumeId: volume.id,
          chapterOrder: nextChapters.length + 1,
          beatKey: beat.key,
          title: chapter.title,
          summary: chapter.summary,
          purpose: existingChapter?.purpose ?? null,
          exclusiveEvent: existingChapter?.exclusiveEvent ?? null,
          endingState: existingChapter?.endingState ?? null,
          nextChapterEntryState: existingChapter?.nextChapterEntryState ?? null,
          conflictLevel: existingChapter?.conflictLevel ?? null,
          revealLevel: existingChapter?.revealLevel ?? null,
          targetWordCount: existingChapter?.targetWordCount ?? null,
          mustAvoid: existingChapter?.mustAvoid ?? null,
          taskSheet: existingChapter?.taskSheet ?? null,
          sceneCards: existingChapter?.sceneCards ?? null,
          payoffRefs: existingChapter?.payoffRefs ?? [],
          createdAt: existingChapter?.createdAt ?? new Date(0).toISOString(),
          updatedAt: existingChapter?.updatedAt ?? new Date(0).toISOString(),
        });
      }
    }

    if (generationMode === "single_beat") {
      const preservedUnmatched = unmatched
        .filter((chapter) => {
          const normalizedTargetBeatKey = options.targetBeatKey?.trim();
          if (!normalizedTargetBeatKey) {
            return true;
          }
          return resolveVolumeChapterBeatKey({
            chapter,
            volume,
            beatSheet: targetBeatSheet,
          }) !== normalizedTargetBeatKey;
        })
        .map((chapter) => cloneExistingChapterWithBeatKey(chapter, chapter.beatKey ?? null));
      nextChapters.push(...preservedUnmatched);
    }

    return {
      ...volume,
      chapters: nextChapters.map((chapter, chapterIndex) => ({
        ...chapter,
        chapterOrder: chapterIndex + 1,
      })),
    };
  });

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: mergedVolumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

export function mergeChapterDetail(params: {
  document: VolumePlanDocument;
  targetVolumeId: string;
  targetChapterId: string;
  detailMode: ChapterDetailMode;
  generatedDetail: Record<string, unknown>;
}): VolumePlanDocument {
  const { document, targetVolumeId, targetChapterId, detailMode, generatedDetail } = params;
  const mergedVolumes = document.volumes.map((volume) => {
    if (volume.id !== targetVolumeId) {
      return volume;
    }
    return {
      ...volume,
      chapters: volume.chapters.map((chapter) => {
        if (chapter.id !== targetChapterId) {
          return chapter;
        }
        if (detailMode === "purpose") {
          return {
            ...chapter,
            purpose: typeof generatedDetail.purpose === "string" ? generatedDetail.purpose : chapter.purpose,
          };
        }
        if (detailMode === "boundary") {
          return {
            ...chapter,
            exclusiveEvent: typeof generatedDetail.exclusiveEvent === "string" ? generatedDetail.exclusiveEvent : chapter.exclusiveEvent,
            endingState: typeof generatedDetail.endingState === "string" ? generatedDetail.endingState : chapter.endingState,
            nextChapterEntryState: typeof generatedDetail.nextChapterEntryState === "string"
              ? generatedDetail.nextChapterEntryState
              : chapter.nextChapterEntryState,
            conflictLevel: typeof generatedDetail.conflictLevel === "number" ? generatedDetail.conflictLevel : chapter.conflictLevel,
            revealLevel: typeof generatedDetail.revealLevel === "number" ? generatedDetail.revealLevel : chapter.revealLevel,
            targetWordCount: typeof generatedDetail.targetWordCount === "number" ? generatedDetail.targetWordCount : chapter.targetWordCount,
            mustAvoid: typeof generatedDetail.mustAvoid === "string" ? generatedDetail.mustAvoid : chapter.mustAvoid,
            payoffRefs: Array.isArray(generatedDetail.payoffRefs)
              ? generatedDetail.payoffRefs.filter((item): item is string => typeof item === "string")
              : chapter.payoffRefs,
          };
        }
        return {
          ...chapter,
          taskSheet: typeof generatedDetail.taskSheet === "string" ? generatedDetail.taskSheet : chapter.taskSheet,
          sceneCards: typeof generatedDetail.sceneCards === "string" ? generatedDetail.sceneCards : chapter.sceneCards,
        };
      }),
    };
  });

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: mergedVolumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

export async function generateChapterTaskSheetDetail(params: {
  promptInput: {
    novel: VolumeGenerationNovel;
    workspace: VolumeWorkspace;
    storyMacroPlan: StoryMacroPlanResult;
    strategyPlan: VolumePlanDocument["strategyPlan"];
    targetVolume: VolumePlan;
    targetBeatSheet: VolumeBeatSheet | null;
    targetChapter: VolumePlan["chapters"][number];
    guidance?: string;
    detailMode: "task_sheet";
  };
  options: VolumeGenerateOptions;
}): Promise<{ taskSheet: string; sceneCards: string }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const generated = await runStructuredPrompt({
        asset: volumeChapterTaskSheetPrompt,
        promptInput: params.promptInput,
        contextBlocks: buildVolumeChapterDetailContextBlocks(params.promptInput),
        options: {
          provider: params.options.provider,
          model: params.options.model,
          temperature: params.options.temperature ?? 0.35,
        },
      });
      const scenePlan = normalizeChapterScenePlan(
        generated.output.sceneCards,
        params.promptInput.targetChapter.targetWordCount,
      );
      return {
        taskSheet: generated.output.taskSheet.trim(),
        sceneCards: serializeChapterScenePlan(scenePlan),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("章节执行合同生成失败。");
    }
  }

  throw lastError ?? new Error("章节执行合同生成失败。");
}

export function mergeRebalance(
  document: VolumePlanDocument,
  anchorVolumeId: string,
  decisions: VolumeRebalanceDecision[],
): VolumePlanDocument {
  const nextDecisions = [
    ...document.rebalanceDecisions.filter((decision) => decision.anchorVolumeId !== anchorVolumeId),
    ...decisions,
  ];
  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: nextDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}
