export type DirectorCompletionMode = "compact_book" | "serial_book";

export type DirectorPromiseScope = "whole_book" | "first_30_chapters";

export type DirectorCompletionStructure = "three_act_compact" | "serial_staged";

export interface DirectorCompletionProfile {
  mode: DirectorCompletionMode;
  targetChapterCount: number;
  maxChapterCount: number;
  promiseScope: DirectorPromiseScope;
  structure: DirectorCompletionStructure;
  endingRequiredBy: number;
}

export function buildDirectorCompletionProfile(targetChapterCount: number): DirectorCompletionProfile {
  const target = Math.max(1, Math.round(Number.isFinite(targetChapterCount) ? targetChapterCount : 80));
  const compact = target <= 60;
  return {
    mode: compact ? "compact_book" : "serial_book",
    targetChapterCount: target,
    maxChapterCount: compact ? target + 5 : target,
    promiseScope: compact ? "whole_book" : "first_30_chapters",
    structure: compact ? "three_act_compact" : "serial_staged",
    endingRequiredBy: target,
  };
}

export function normalizeDirectorCompletionProfile(
  profile: Partial<DirectorCompletionProfile> | null | undefined,
  fallbackTargetChapterCount = 80,
): DirectorCompletionProfile {
  const target = typeof profile?.targetChapterCount === "number"
    ? profile.targetChapterCount
    : fallbackTargetChapterCount;
  const derived = buildDirectorCompletionProfile(target);
  if (!profile || typeof profile !== "object") return derived;
  return {
    ...derived,
    ...profile,
    targetChapterCount: derived.targetChapterCount,
    mode: derived.mode,
    promiseScope: derived.promiseScope,
    structure: derived.structure,
    maxChapterCount: derived.maxChapterCount,
    endingRequiredBy: derived.endingRequiredBy,
  };
}
