import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterDynamicsExtractionPrompt,
  volumeDynamicsProjectionPrompt,
} from "../../../prompting/prompts/novel/characterDynamics.prompts";
import type { VolumeDynamicsProjection } from "./characterDynamicsSchemas";

const MAX_VOLUMES_PER_PROJECTION_BATCH = 2;
const MAX_CHAPTERS_PER_PROJECTION_BATCH = 48;

function compactText(value: string | null | undefined, maxLength = 120): string {
  const normalized = value?.replace(/\s+/g, " ").trim() || "";
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function chunkVolumePlans<T extends { chapters: Array<unknown> }>(volumePlans: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentChapterCount = 0;

  for (const volume of volumePlans) {
    const volumeChapterCount = volume.chapters.length;
    const shouldFlush = current.length > 0 && (
      current.length >= MAX_VOLUMES_PER_PROJECTION_BATCH
      || currentChapterCount + volumeChapterCount > MAX_CHAPTERS_PER_PROJECTION_BATCH
    );
    if (shouldFlush) {
      batches.push(current);
      current = [];
      currentChapterCount = 0;
    }
    current.push(volume);
    currentChapterCount += volumeChapterCount;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function buildVolumePlansText(volumePlans: Array<{
  sortOrder: number;
  title: string;
  summary: string | null;
  mainPromise: string | null;
  escalationMode: string | null;
  protagonistChange: string | null;
  climax: string | null;
  nextVolumeHook: string | null;
  chapters: Array<{
    chapterOrder: number;
    title: string;
    summary: string;
  }>;
}>): string {
  return volumePlans.map((volume) => [
    `Volume ${volume.sortOrder}: ${volume.title}`,
    `summary=${compactText(volume.summary, 100)}`,
    `promise=${compactText(volume.mainPromise, 80)}`,
    `escalation=${compactText(volume.escalationMode, 60)}`,
    `protagonistChange=${compactText(volume.protagonistChange, 80)}`,
    `climax=${compactText(volume.climax, 80)}`,
    `hook=${compactText(volume.nextVolumeHook, 80)}`,
    `chapters=${volume.chapters.map((chapter) => `${chapter.chapterOrder}.${compactText(chapter.title, 24)}`).join(" | ")}`,
  ].join("\n")).join("\n\n");
}

export async function generateVolumeProjection(context: {
  id: string;
  title: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  first30ChapterPromise: string | null;
  outline: string | null;
  structuredOutline: string | null;
  characters: Array<{
    name: string;
    role: string;
    castRole: string | null;
    relationToProtagonist: string | null;
    storyFunction: string | null;
    currentGoal: string | null;
    currentState: string | null;
  }>;
  characterRelations: Array<{
    sourceCharacter: { name: string };
    targetCharacter: { name: string };
    surfaceRelation: string;
    hiddenTension: string | null;
    conflictSource: string | null;
    dynamicLabel: string | null;
    nextTurnPoint: string | null;
  }>;
  characterCastOptions: Array<{
    title: string;
    summary: string;
  }>;
  volumePlans: Array<{
    sortOrder: number;
    title: string;
    summary: string | null;
    mainPromise: string | null;
    escalationMode: string | null;
    protagonistChange: string | null;
    climax: string | null;
    nextVolumeHook: string | null;
    chapters: Array<{
      chapterOrder: number;
      title: string;
      summary: string;
    }>;
  }>;
}): Promise<VolumeDynamicsProjection> {
  const sharedPromptInput = {
    novelTitle: context.title,
    description: context.description ?? "none",
    targetAudience: context.targetAudience ?? "unknown",
    sellingPoint: context.bookSellingPoint ?? "unknown",
    firstPromise: context.first30ChapterPromise ?? "unknown",
    outline: context.outline ?? "none",
    structuredOutline: context.structuredOutline ?? "none",
    appliedCastOption: context.characterCastOptions[0]
      ? `${context.characterCastOptions[0].title} | ${context.characterCastOptions[0].summary}`
      : "none",
    rosterText: context.characters.map((item) => `${item.name} | role=${item.role} | cast=${item.castRole ?? ""} | protagonistRelation=${item.relationToProtagonist ?? ""} | function=${item.storyFunction ?? ""} | goal=${item.currentGoal ?? ""} | state=${item.currentState ?? ""}`).join("\n"),
    relationText: context.characterRelations.map((item) => `${item.sourceCharacter.name} -> ${item.targetCharacter.name} | surface=${item.surfaceRelation} | tension=${item.hiddenTension ?? ""} | conflict=${item.conflictSource ?? ""} | dynamic=${item.dynamicLabel ?? ""} | next=${item.nextTurnPoint ?? ""}`).join("\n") || "none",
  };

  const batches = chunkVolumePlans(context.volumePlans);
  const merged: VolumeDynamicsProjection = {
    assignments: [],
    factionTracks: [],
    relationStages: [],
  };

  for (const batch of batches) {
    const result = await runStructuredPrompt({
      asset: volumeDynamicsProjectionPrompt,
      promptInput: {
        ...sharedPromptInput,
        volumePlansText: buildVolumePlansText(batch),
      },
    });
    merged.assignments.push(...result.output.assignments);
    merged.factionTracks.push(...result.output.factionTracks);
    merged.relationStages.push(...result.output.relationStages);
  }

  return merged;
}

export async function extractChapterDynamics(input: {
  novelId: string;
  chapterId: string;
  novelTitle: string;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  first30ChapterPromise: string | null;
  currentVolumeTitle: string | null;
  rosterLines: string[];
  relationLines: string[];
  chapterOrder: number;
  chapterTitle: string;
  chapterContent: string;
}) {
  const result = await runStructuredPrompt({
    asset: chapterDynamicsExtractionPrompt,
    promptInput: {
      novelTitle: input.novelTitle,
      targetAudience: input.targetAudience ?? "unknown",
      sellingPoint: input.bookSellingPoint ?? "unknown",
      firstPromise: input.first30ChapterPromise ?? "unknown",
      currentVolumeTitle: input.currentVolumeTitle ?? "unknown",
      rosterText: input.rosterLines.join("\n") || "none",
      relationText: input.relationLines.join("\n") || "none",
      chapterOrder: input.chapterOrder,
      chapterTitle: input.chapterTitle,
      chapterContent: input.chapterContent,
    },
  });
  return result.output;
}
