import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterDynamicsExtractionPrompt,
  volumeDynamicsProjectionPrompt,
} from "../../../prompting/prompts/novel/characterDynamics.prompts";
import type { VolumeDynamicsProjection } from "./characterDynamicsSchemas";

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
  const result = await runStructuredPrompt({
    asset: volumeDynamicsProjectionPrompt,
    promptInput: {
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
      volumePlansText: context.volumePlans.map((volume) => [
        `Volume ${volume.sortOrder}: ${volume.title}`,
        `summary=${volume.summary ?? ""}`,
        `promise=${volume.mainPromise ?? ""}`,
        `escalation=${volume.escalationMode ?? ""}`,
        `protagonistChange=${volume.protagonistChange ?? ""}`,
        `climax=${volume.climax ?? ""}`,
        `hook=${volume.nextVolumeHook ?? ""}`,
        `chapters=${volume.chapters.map((chapter) => `${chapter.chapterOrder}.${chapter.title} ${chapter.summary}`).join(" | ")}`,
      ].join("\n")).join("\n\n"),
    },
  });
  return result.output;
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
