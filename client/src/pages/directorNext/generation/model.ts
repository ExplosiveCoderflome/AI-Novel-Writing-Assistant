import type { DirectorGenerationSnapshot, DirectorWorkspaceActivity } from "@ai-novel/shared/types/director/generation";
import type { Selection, WorkspaceBook } from "../workspace";

export function acceptGenerationSnapshot(previous: DirectorGenerationSnapshot | null, value: unknown, novelId: string): DirectorGenerationSnapshot | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") return previous;
  const frame = value as DirectorGenerationSnapshot;
  if (frame.novelId !== novelId || typeof frame.chapterId !== "string" || !frame.chapterId
    || typeof frame.executionId !== "string" || !frame.executionId || typeof frame.chapterTitle !== "string"
    || !Number.isInteger(frame.chapterOrder) || frame.chapterOrder < 1
    || !Number.isInteger(frame.revision) || frame.revision < 1 || !Number.isFinite(frame.updatedAt)
    || typeof frame.content !== "string" || frame.content.length > 100_000
    || !["writing", "checking", "saved", "interrupted"].includes(frame.state)) return previous;
  if (previous?.executionId === frame.executionId && previous.revision >= frame.revision) return previous;
  return frame;
}

export function followedChapterSelection(enabled: boolean, frame: DirectorGenerationSnapshot | null, novelId: string) {
  return enabled && frame?.novelId === novelId && (frame.state === "writing" || frame.state === "checking")
    ? {kind: "chapter" as const, id: frame.chapterId} : null;
}

/** Deterministic navigation of projected artifact identities, never parsing status text. */
export function followedWorkspaceSelection(enabled: boolean, activity: DirectorWorkspaceActivity | undefined,
  frame: DirectorGenerationSnapshot | null, book: WorkspaceBook): {key: string; selection: Selection} | null {
  if (!enabled) return null;
  const chapter = followedChapterSelection(enabled, frame, book.novel.id);
  if (chapter) return {key: `chapter:${frame!.executionId}`, selection: chapter};
  if (activity?.novelId !== book.novel.id || !activity.focus) return null;
  const {key, artifactType, volumeId, chapterOrder} = activity.focus;
  const volumes = book.planning?.volumes ?? [];
  const plans = volumes.flatMap(volume => volume.chapters
    .filter(plan => plan.chapterOrder === chapterOrder && (!volumeId || volume.id === volumeId)));
  const volume = volumeId ? volumes.find(row => row.id === volumeId)
    : plans.length === 1 ? volumes.find(row => row.chapters.some(plan => plan.id === plans[0].id)) : null;
  let selection: Selection;
  switch (artifactType) {
    case "story_macro": case "book_contract": selection = {kind: "story"}; break;
    case "world_skeleton": selection = {kind: "world"}; break;
    case "character_cast": selection = {kind: "characters"}; break;
    case "volume_strategy": selection = {kind: "volumes"}; break;
    case "volume_beat_sheet": case "volume_chapter_list":
      selection = volume ? {kind: "volume", id: volume.id} : {kind: "volumes"}; break;
    case "chapter_task_sheet": case "chapter_execution_contract":
      selection = plans.length === 1 ? {kind: "plan", id: plans[0].id} : {kind: "volumes"}; break;
    default: return null;
  }
  return {key, selection};
}
