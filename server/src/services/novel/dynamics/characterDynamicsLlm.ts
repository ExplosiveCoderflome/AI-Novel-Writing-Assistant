import { invokeStructuredLlm } from "../../../llm/structuredInvoke";
import type { VolumeDynamicsProjection } from "./characterDynamicsSchemas";
import {
  chapterDynamicExtractionSchema,
  volumeDynamicsProjectionSchema,
} from "./characterDynamicsSchemas";

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
  return invokeStructuredLlm({
    label: `character-dynamics-projection:${context.id}`,
    taskType: "planner",
    systemPrompt: [
      "You project a dynamic role system for a long-form web novel.",
      "Return strict JSON only.",
      "Use every volume and decide which existing characters are core, what they must carry, how often they should appear, what faction pressure they represent, and what the current relationship stage is.",
      "Do not create new characters here. Only use names from the known roster.",
      "Assignments must reflect target audience, selling point, and first 30 chapter promise.",
      "Core characters should usually have warning threshold 3 and high threshold 5 unless there is a strong reason not to.",
    ].join("\n"),
    userPrompt: [
      `Novel: ${context.title}`,
      `Description: ${context.description ?? "none"}`,
      `Target audience: ${context.targetAudience ?? "unknown"}`,
      `Selling point: ${context.bookSellingPoint ?? "unknown"}`,
      `First 30 chapter promise: ${context.first30ChapterPromise ?? "unknown"}`,
      `Outline: ${context.outline ?? "none"}`,
      `Structured outline: ${context.structuredOutline ?? "none"}`,
      context.characterCastOptions[0]
        ? `Applied cast option: ${context.characterCastOptions[0].title} | ${context.characterCastOptions[0].summary}`
        : "Applied cast option: none",
      `Known roster:\n${context.characters.map((item) => `${item.name} | role=${item.role} | cast=${item.castRole ?? ""} | protagonistRelation=${item.relationToProtagonist ?? ""} | function=${item.storyFunction ?? ""} | goal=${item.currentGoal ?? ""} | state=${item.currentState ?? ""}`).join("\n")}`,
      `Known structured relations:\n${context.characterRelations.map((item) => `${item.sourceCharacter.name} -> ${item.targetCharacter.name} | surface=${item.surfaceRelation} | tension=${item.hiddenTension ?? ""} | conflict=${item.conflictSource ?? ""} | dynamic=${item.dynamicLabel ?? ""} | next=${item.nextTurnPoint ?? ""}`).join("\n") || "none"}`,
      `Volume plans:\n${context.volumePlans.map((volume) => [
        `Volume ${volume.sortOrder}: ${volume.title}`,
        `summary=${volume.summary ?? ""}`,
        `promise=${volume.mainPromise ?? ""}`,
        `escalation=${volume.escalationMode ?? ""}`,
        `protagonistChange=${volume.protagonistChange ?? ""}`,
        `climax=${volume.climax ?? ""}`,
        `hook=${volume.nextVolumeHook ?? ""}`,
        `chapters=${volume.chapters.map((chapter) => `${chapter.chapterOrder}.${chapter.title} ${chapter.summary}`).join(" | ")}`,
      ].join("\n")).join("\n\n")}`,
    ].join("\n\n"),
    schema: volumeDynamicsProjectionSchema,
    maxRepairAttempts: 1,
  });
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
  return invokeStructuredLlm({
    label: `character-dynamics-chapter:${input.novelId}:${input.chapterId}`,
    taskType: "fact_extraction",
    systemPrompt: [
      "You extract dynamic character facts from a drafted chapter.",
      "Return strict JSON only.",
      "Do not invent characters that are already in the known roster unless the chapter clearly introduces a genuinely new person.",
      "Candidates are only for truly new, named, story-relevant roles.",
      "Faction updates are only for meaningful allegiance or camp signals, not vague moods.",
      "Relation stages are only for meaningful progression or regression between named existing characters.",
    ].join("\n"),
    userPrompt: [
      `Novel: ${input.novelTitle}`,
      `Target audience: ${input.targetAudience ?? "unknown"}`,
      `Selling point: ${input.bookSellingPoint ?? "unknown"}`,
      `First 30 chapter promise: ${input.first30ChapterPromise ?? "unknown"}`,
      `Current volume: ${input.currentVolumeTitle ?? "unknown"}`,
      `Known roster:\n${input.rosterLines.join("\n") || "none"}`,
      `Known structured relations:\n${input.relationLines.join("\n") || "none"}`,
      `Chapter ${input.chapterOrder} ${input.chapterTitle}`,
      input.chapterContent,
    ].join("\n\n"),
    schema: chapterDynamicExtractionSchema,
    maxRepairAttempts: 1,
  });
}
