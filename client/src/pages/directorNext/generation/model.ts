import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";

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
