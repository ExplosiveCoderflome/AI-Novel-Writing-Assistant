import type {
  VolumeBeatSheet,
  VolumePlan,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
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
  suggestedVolumeCount: number;
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
  chapterBudget: number;
}

export interface VolumeBeatSheetPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  targetVolume: VolumePlan;
  guidance?: string;
}

export interface VolumeChapterListPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  targetVolume: VolumePlan;
  targetBeatSheet: VolumeBeatSheet;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  guidance?: string;
  targetChapterCount: number;
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

export function buildChapterNeighborContext(volume: VolumePlan, chapterId: string): string {
  const index = volume.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) {
    return "none";
  }
  const previous = index > 0 ? volume.chapters[index - 1] : null;
  const current = volume.chapters[index];
  const next = index < volume.chapters.length - 1 ? volume.chapters[index + 1] : null;
  return [
    previous ? `previous chapter: ${previous.chapterOrder} ${previous.title} | ${previous.summary || "none"}` : "",
    `current chapter: ${current.chapterOrder} ${current.title} | ${current.summary || "none"}`,
    next ? `next chapter: ${next.chapterOrder} ${next.title} | ${next.summary || "none"}` : "",
  ].filter(Boolean).join("\n");
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
      `conflict level: ${typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : "none"}`,
      `reveal level: ${typeof chapter.revealLevel === "number" ? chapter.revealLevel : "none"}`,
      `target word count: ${typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : "none"}`,
      `must avoid: ${chapter.mustAvoid?.trim() || "none"}`,
      `payoff refs: ${chapter.payoffRefs.join(" | ") || "none"}`,
    ].join("\n");
  }
  return `current task sheet draft: ${chapter.taskSheet?.trim() || "none"}`;
}
