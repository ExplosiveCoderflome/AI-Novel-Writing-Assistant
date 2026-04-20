import type { VolumeBeatSheet } from "@ai-novel/shared/types/novel";

export function parseBeatSheetChapterSpan(chapterSpanHint: string): { start: number; end: number } | null {
  const matches = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (matches.length === 0 || matches.some((value) => Number.isNaN(value))) {
    return null;
  }
  const start = Math.max(1, matches[0]);
  const end = Math.max(start, matches[matches.length - 1]);
  return { start, end };
}

export function getBeatSheetChapterSpanUpperBound(chapterSpanHint: string): number {
  return parseBeatSheetChapterSpan(chapterSpanHint)?.end ?? 0;
}

export function getBeatSheetChapterSpanCount(chapterSpanHint: string): number {
  const span = parseBeatSheetChapterSpan(chapterSpanHint);
  if (!span) {
    return 0;
  }
  return Math.max(1, span.end - span.start + 1);
}

export function inferRequiredChapterCountFromBeatSheet(
  beatSheet: Pick<VolumeBeatSheet, "beats"> | null | undefined,
): number {
  if (!beatSheet || !Array.isArray(beatSheet.beats)) {
    return 0;
  }

  const spanCounts = beatSheet.beats
    .map((beat) => getBeatSheetChapterSpanCount(beat.chapterSpanHint))
    .filter((count) => count > 0);
  if (spanCounts.length === beatSheet.beats.length) {
    return spanCounts.reduce((sum, count) => sum + count, 0);
  }

  return beatSheet.beats.reduce((maxValue, beat) => {
    const upperBound = getBeatSheetChapterSpanUpperBound(beat.chapterSpanHint);
    return upperBound > maxValue ? upperBound : maxValue;
  }, 0);
}

export function resolveTargetChapterCount(input: {
  budgetedChapterCount: number;
  beatSheetRequiredChapterCount: number;
}): {
  targetChapterCount: number;
  beatSheetCountAccepted: boolean;
  maxTrustedChapterCount: number;
} {
  const budgetedChapterCount = Math.max(3, Math.round(input.budgetedChapterCount || 0));
  const beatSheetRequiredChapterCount = Math.max(0, Math.round(input.beatSheetRequiredChapterCount || 0));
  const maxTrustedChapterCount = budgetedChapterCount + Math.max(6, Math.ceil(budgetedChapterCount * 0.25));

  if (beatSheetRequiredChapterCount === 0) {
    return {
      targetChapterCount: budgetedChapterCount,
      beatSheetCountAccepted: false,
      maxTrustedChapterCount,
    };
  }

  if (beatSheetRequiredChapterCount > maxTrustedChapterCount) {
    return {
      targetChapterCount: budgetedChapterCount,
      beatSheetCountAccepted: false,
      maxTrustedChapterCount,
    };
  }

  return {
    targetChapterCount: Math.max(budgetedChapterCount, beatSheetRequiredChapterCount),
    beatSheetCountAccepted: true,
    maxTrustedChapterCount,
  };
}
