import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumeCountGuidance,
  VolumePlan,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import { parseChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type {
  ChapterDetailMode,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "../../../../services/novel/volume/volumeModels";

export interface VolumeStrategyPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  guidance?: string;
  volumeCountGuidance: VolumeCountGuidance;
}

export interface VolumeStrategyCritiquePromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan;
  guidance?: string;
}

export interface VolumeSkeletonPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan;
  guidance?: string;
  volumeCountGuidance: VolumeCountGuidance;
  chapterBudget: number;
}

export interface VolumeBeatSheetPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  targetVolume: VolumePlan;
  targetChapterCount: number;
  guidance?: string;
}

export interface VolumeChapterListPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  targetVolume: VolumePlan;
  targetBeatSheet: VolumeBeatSheet;
  targetBeat: VolumeBeat;
  previousBeat?: VolumeBeat | null;
  nextBeat?: VolumeBeat | null;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  guidance?: string;
  targetBeatChapterCount: number;
  targetChapterStartOrder: number;
  targetChapterEndOrder: number;
  nextAvailableChapterOrder: number;
  previousBeatChapterSummary?: string | null;
  preservedBeatChapterSummary?: string | null;
  retryReason?: string | null;
}

export interface VolumeChapterDetailPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  targetVolume: VolumePlan;
  targetBeatSheet: VolumeBeatSheet | null;
  targetChapter: VolumePlan["chapters"][number];
  guidance?: string;
  detailMode: ChapterDetailMode;
}

export interface VolumeRebalancePromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  anchorVolume: VolumePlan;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  guidance?: string;
}

function compactText(value: string | null | undefined, fallback = "none"): string {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function parseCommercialTags(commercialTagsJson: string | null | undefined): string[] {
  try {
    return commercialTagsJson ? JSON.parse(commercialTagsJson) as string[] : [];
  } catch {
    return [];
  }
}

function summarizeCharacters(novel: VolumeGenerationNovel): string {
  if (novel.characters.length === 0) {
    return "none";
  }
  return novel.characters
    .slice(0, 6)
    .map((item) => (
      `${item.name} | ${item.role} | goal=${item.currentGoal ?? "none"} | state=${item.currentState ?? "none"}`
    ))
    .join("\n");
}

export function buildCommonNovelContext(novel: VolumeGenerationNovel): string {
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  return [
    `title: ${novel.title}`,
    `genre: ${novel.genre?.name ?? "unset"}`,
    novel.storyModePromptBlock?.trim() ? novel.storyModePromptBlock.trim() : "",
    `description: ${compactText(novel.description)}`,
    `target audience: ${compactText(novel.targetAudience)}`,
    `selling point: ${compactText(novel.bookSellingPoint)}`,
    `first 30 chapter promise: ${compactText(novel.first30ChapterPromise)}`,
    `narrative pov: ${compactText(novel.narrativePov, "unset")}`,
    `pace preference: ${compactText(novel.pacePreference, "unset")}`,
    `emotion intensity: ${compactText(novel.emotionIntensity, "unset")}`,
    `commercial tags: ${commercialTags.join(" | ") || "none"}`,
    `character context:\n${summarizeCharacters(novel)}`,
  ].filter(Boolean).join("\n");
}

export function buildCompactVolumeCard(volume: VolumePlan): string {
  return [
    `volume ${volume.sortOrder}: ${volume.title}`,
    `summary: ${compactText(volume.summary)}`,
    `opening hook: ${compactText(volume.openingHook)}`,
    `main promise: ${compactText(volume.mainPromise)}`,
    `primary pressure: ${compactText(volume.primaryPressureSource)}`,
    `core selling point: ${compactText(volume.coreSellingPoint)}`,
    `escalation: ${compactText(volume.escalationMode)}`,
    `protagonist change: ${compactText(volume.protagonistChange)}`,
    `mid-volume risk: ${compactText(volume.midVolumeRisk)}`,
    `climax: ${compactText(volume.climax)}`,
    `payoff type: ${compactText(volume.payoffType)}`,
    `next volume hook: ${compactText(volume.nextVolumeHook)}`,
    `open payoffs: ${volume.openPayoffs.join(" | ") || "none"}`,
    `chapter count: ${volume.chapters.length}`,
  ].join("\n");
}

export function buildCompactVolumeContext(volumes: VolumePlan[]): string {
  if (volumes.length === 0) {
    return "none";
  }
  return volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((volume) => buildCompactVolumeCard(volume))
    .join("\n\n");
}

export function buildWindowedVolumeContext(
  volumes: VolumePlan[],
  targetVolumeId?: string,
  windowSize = 1,
): string {
  if (volumes.length === 0) {
    return "none";
  }
  const sorted = volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (!targetVolumeId) {
    return sorted.slice(0, Math.min(sorted.length, 3)).map((volume) => buildCompactVolumeCard(volume)).join("\n\n");
  }
  const targetIndex = sorted.findIndex((volume) => volume.id === targetVolumeId);
  if (targetIndex < 0) {
    return sorted.slice(0, Math.min(sorted.length, 3)).map((volume) => buildCompactVolumeCard(volume)).join("\n\n");
  }
  const start = Math.max(0, targetIndex - windowSize);
  const end = Math.min(sorted.length, targetIndex + windowSize + 1);
  return sorted.slice(start, end).map((volume) => buildCompactVolumeCard(volume)).join("\n\n");
}

export function buildSoftFutureVolumeSummary(
  volumes: VolumePlan[],
  targetVolumeId?: string,
): string {
  if (!targetVolumeId) {
    return "none";
  }
  const sorted = volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const targetIndex = sorted.findIndex((volume) => volume.id === targetVolumeId);
  if (targetIndex < 0 || targetIndex >= sorted.length - 1) {
    return "none";
  }
  return sorted
    .slice(targetIndex + 1, targetIndex + 4)
    .map((volume) => `volume ${volume.sortOrder}: ${volume.title} | ${volume.mainPromise ?? volume.summary ?? "pending"}`)
    .join("\n") || "none";
}

function buildStrategyVolumeCard(strategyPlan: VolumeStrategyPlan): string {
  return strategyPlan.volumes
    .map((volume) => [
      `volume ${volume.sortOrder}`,
      `planning mode: ${volume.planningMode}`,
      `role label: ${volume.roleLabel}`,
      `core reward: ${volume.coreReward}`,
      `escalation focus: ${volume.escalationFocus}`,
      `uncertainty level: ${volume.uncertaintyLevel}`,
    ].join("\n"))
    .join("\n\n");
}

export function buildStrategyContext(strategyPlan: VolumeStrategyPlan | null): string {
  if (!strategyPlan) {
    return "none";
  }
  return [
    `recommended volume count: ${strategyPlan.recommendedVolumeCount}`,
    `hard planned volume count: ${strategyPlan.hardPlannedVolumeCount}`,
    `reader reward ladder: ${strategyPlan.readerRewardLadder}`,
    `escalation ladder: ${strategyPlan.escalationLadder}`,
    `midpoint shift: ${strategyPlan.midpointShift}`,
    `notes: ${strategyPlan.notes}`,
    `volume strategy:\n${buildStrategyVolumeCard(strategyPlan)}`,
    strategyPlan.uncertainties.length > 0
      ? `uncertainties:\n${strategyPlan.uncertainties.map((item) => `${item.targetType}:${item.targetRef}|${item.level}|${item.reason}`).join("\n")}`
      : "uncertainties: none",
  ].join("\n\n");
}

export function buildStoryMacroContext(storyMacroPlan: StoryMacroPlan | null): string {
  if (!storyMacroPlan) {
    return "none";
  }
  return [
    storyMacroPlan.decomposition?.selling_point ? `selling point: ${storyMacroPlan.decomposition.selling_point}` : "",
    storyMacroPlan.decomposition?.core_conflict ? `core conflict: ${storyMacroPlan.decomposition.core_conflict}` : "",
    storyMacroPlan.decomposition?.main_hook ? `main hook: ${storyMacroPlan.decomposition.main_hook}` : "",
    storyMacroPlan.decomposition?.progression_loop ? `progression loop: ${storyMacroPlan.decomposition.progression_loop}` : "",
    storyMacroPlan.decomposition?.growth_path ? `growth path: ${storyMacroPlan.decomposition.growth_path}` : "",
    storyMacroPlan.decomposition?.ending_flavor ? `ending flavor: ${storyMacroPlan.decomposition.ending_flavor}` : "",
    storyMacroPlan.constraints.length > 0 ? `constraints: ${storyMacroPlan.constraints.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

export function buildVolumeCountGuidanceContext(volumeCountGuidance: VolumeCountGuidance): string {
  return [
    `chapter budget: ${volumeCountGuidance.chapterBudget}`,
    `target chapter range per volume: ${volumeCountGuidance.targetChapterRange.min}-${volumeCountGuidance.targetChapterRange.max} chapters (ideal ${volumeCountGuidance.targetChapterRange.ideal})`,
    `allowed volume count range: ${volumeCountGuidance.allowedVolumeCountRange.min}-${volumeCountGuidance.allowedVolumeCountRange.max}`,
    `system recommended volume count: ${volumeCountGuidance.systemRecommendedVolumeCount}`,
    `active recommended volume count: ${volumeCountGuidance.recommendedVolumeCount}`,
    `hard planned volume range: ${volumeCountGuidance.hardPlannedVolumeRange.min}-${volumeCountGuidance.hardPlannedVolumeRange.max}`,
    `user preferred volume count: ${volumeCountGuidance.userPreferredVolumeCount ?? "none"}`,
    `respected existing volume count: ${volumeCountGuidance.respectedExistingVolumeCount ?? "none"}`,
  ].join("\n");
}

export function buildBeatSheetContext(beatSheet: VolumeBeatSheet | null | undefined): string {
  if (!beatSheet || beatSheet.beats.length === 0) {
    return "none";
  }
  return beatSheet.beats
    .map((beat) => [
      `${beat.label} (${beat.key})`,
      `summary: ${beat.summary}`,
      `chapter span hint: ${beat.chapterSpanHint}`,
      `must deliver: ${beat.mustDeliver.join(" | ")}`,
    ].join("\n"))
    .join("\n\n");
}

export function buildBeatCard(beat: VolumeBeat | null | undefined): string {
  if (!beat) {
    return "none";
  }
  return [
    `${beat.label} (${beat.key})`,
    `summary: ${beat.summary}`,
    `chapter span hint: ${beat.chapterSpanHint}`,
    `must deliver: ${beat.mustDeliver.join(" | ") || "none"}`,
  ].join("\n");
}

export function buildBeatContextWindow(params: {
  previousBeat?: VolumeBeat | null;
  nextBeat?: VolumeBeat | null;
}): string {
  const lines = [
    params.previousBeat ? `previous beat:\n${buildBeatCard(params.previousBeat)}` : "",
    params.nextBeat ? `next beat:\n${buildBeatCard(params.nextBeat)}` : "",
  ].filter(Boolean);
  return lines.join("\n\n") || "none";
}

export function buildBeatChapterRangeContext(input: {
  targetBeat: VolumeBeat;
  targetBeatChapterCount: number;
  targetChapterStartOrder: number;
  targetChapterEndOrder: number;
  nextAvailableChapterOrder: number;
}): string {
  return [
    `current beat: ${input.targetBeat.label} (${input.targetBeat.key})`,
    `chapter slot range in current volume: ${input.targetChapterStartOrder}-${input.targetChapterEndOrder}`,
    `target chapter count for this beat: ${input.targetBeatChapterCount}`,
    `next available chapter slot before generation: ${input.nextAvailableChapterOrder}`,
  ].join("\n");
}

export function buildBeatChapterSummary(summary: string | null | undefined): string {
  const normalized = summary?.trim();
  return normalized ? normalized : "none";
}

export function buildChapterNeighborContext(volume: VolumePlan, chapterId: string): string {
  const index = volume.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) {
    return "none";
  }
  const previous = index > 0 ? volume.chapters[index - 1] : null;
  const current = volume.chapters[index];
  const next = index < volume.chapters.length - 1 ? volume.chapters[index + 1] : null;
  return [
    previous
      ? `previous chapter: ${previous.chapterOrder} ${previous.title} | ${previous.summary || "none"} | exclusiveEvent=${previous.exclusiveEvent || "none"} | endingState=${previous.endingState || "none"} | nextEntry=${previous.nextChapterEntryState || "none"}`
      : "",
    `current chapter: ${current.chapterOrder} ${current.title} | ${current.summary || "none"} | exclusiveEvent=${current.exclusiveEvent || "none"} | endingState=${current.endingState || "none"} | nextEntry=${current.nextChapterEntryState || "none"}`,
    next
      ? `next chapter: ${next.chapterOrder} ${next.title} | ${next.summary || "none"} | exclusiveEvent=${next.exclusiveEvent || "none"} | endingState=${next.endingState || "none"} | nextEntry=${next.nextChapterEntryState || "none"}`
      : "",
  ].filter(Boolean).join("\n");
}

function buildSceneTrajectoryLine(
  chapter: VolumePlan["chapters"][number],
  sceneIndex: number,
  label: string,
): string | null {
  const scenePlan = parseChapterScenePlan(chapter.sceneCards, {
    targetWordCount: chapter.targetWordCount ?? undefined,
  });
  const scene = scenePlan?.scenes[sceneIndex];
  if (!scene) {
    return null;
  }
  return [
    `${label}: ${scene.title}`,
    `purpose=${scene.purpose}`,
    `entry=${scene.entryState}`,
    `exit=${scene.exitState}`,
    scene.mustAdvance.length > 0 ? `mustAdvance=${scene.mustAdvance.join(" | ")}` : "",
    scene.forbiddenExpansion.length > 0 ? `forbidden=${scene.forbiddenExpansion.join(" | ")}` : "",
  ].filter(Boolean).join(" | ");
}

export function buildRecentChapterExecutionContext(
  volume: VolumePlan,
  chapterId: string,
  lookback = 2,
): string {
  const index = volume.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index <= 0) {
    return "none";
  }

  const recentChapters = volume.chapters.slice(Math.max(0, index - lookback), index);
  if (recentChapters.length === 0) {
    return "none";
  }

  return recentChapters.map((chapter) => {
    const scenePlan = parseChapterScenePlan(chapter.sceneCards, {
      targetWordCount: chapter.targetWordCount ?? undefined,
    });
    const openingLine = buildSceneTrajectoryLine(chapter, 0, "opening scene");
    const endingLine = scenePlan
      ? buildSceneTrajectoryLine(chapter, Math.max(scenePlan.scenes.length - 1, 0), "ending scene")
      : null;
    const middleSceneLines = scenePlan && scenePlan.scenes.length > 2
      ? scenePlan.scenes
        .slice(1, -1)
        .map((scene, middleIndex) => (
          `middle scene ${middleIndex + 1}: ${scene.title} | purpose=${scene.purpose} | mustAdvance=${scene.mustAdvance.join(" | ") || "none"}`
        ))
      : [];

    return [
      `chapter ${chapter.chapterOrder}: ${chapter.title}`,
      `summary: ${compactText(chapter.summary)}`,
      `task sheet: ${compactText(chapter.taskSheet)}`,
      openingLine,
      ...middleSceneLines,
      endingLine,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

export function buildChapterDetailDraft(
  chapter: VolumePlan["chapters"][number],
  detailMode: ChapterDetailMode,
): string {
  if (detailMode === "purpose") {
    return `current purpose draft: ${chapter.purpose?.trim() || "none"}`;
  }
  if (detailMode === "boundary") {
    return [
      `exclusive event: ${chapter.exclusiveEvent?.trim() || "none"}`,
      `ending state: ${chapter.endingState?.trim() || "none"}`,
      `next chapter entry state: ${chapter.nextChapterEntryState?.trim() || "none"}`,
      `conflict level: ${typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : "none"}`,
      `reveal level: ${typeof chapter.revealLevel === "number" ? chapter.revealLevel : "none"}`,
      `target word count: ${typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : "none"}`,
      `must avoid: ${chapter.mustAvoid?.trim() || "none"}`,
      `payoff refs: ${chapter.payoffRefs.join(" | ") || "none"}`,
    ].join("\n");
  }
  return [
    `current chapter title: ${chapter.title.trim() || "none"}`,
    `current chapter summary: ${chapter.summary?.trim() || "none"}`,
    `current purpose draft: ${chapter.purpose?.trim() || "none"}`,
    `exclusive event: ${chapter.exclusiveEvent?.trim() || "none"}`,
    `ending state: ${chapter.endingState?.trim() || "none"}`,
    `next chapter entry state: ${chapter.nextChapterEntryState?.trim() || "none"}`,
    `conflict level: ${typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : "none"}`,
    `reveal level: ${typeof chapter.revealLevel === "number" ? chapter.revealLevel : "none"}`,
    `target word count: ${typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : "none"}`,
    `must avoid: ${chapter.mustAvoid?.trim() || "none"}`,
    `payoff refs: ${chapter.payoffRefs.join(" | ") || "none"}`,
    `current task sheet draft: ${chapter.taskSheet?.trim() || "none"}`,
  ].join("\n");
}
