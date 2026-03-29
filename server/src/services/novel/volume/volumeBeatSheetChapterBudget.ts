import type { VolumeBeatSheet } from "@ai-novel/shared/types/novel";

export function getBeatSheetChapterSpanUpperBound(chapterSpanHint: string): number {
  const matches = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (matches.length === 0 || matches.some((value) => Number.isNaN(value))) {
    return 0;
  }
  return Math.max(...matches);
}

export function inferRequiredChapterCountFromBeatSheet(
  beatSheet: Pick<VolumeBeatSheet, "beats"> | null | undefined,
): number {
  if (!beatSheet || !Array.isArray(beatSheet.beats)) {
    return 0;
  }
  return beatSheet.beats.reduce((maxValue, beat) => {
    const upperBound = getBeatSheetChapterSpanUpperBound(beat.chapterSpanHint);
    return upperBound > maxValue ? upperBound : maxValue;
  }, 0);
}
