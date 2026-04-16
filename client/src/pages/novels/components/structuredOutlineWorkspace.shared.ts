import type { StructuredTabViewProps } from "./NovelEditView.types";

type StructuredVolume = StructuredTabViewProps["volumes"][number];
type StructuredChapter = StructuredVolume["chapters"][number];
type StructuredBeatSheet = StructuredTabViewProps["beatSheets"][number];
type StructuredBeat = StructuredBeatSheet["beats"][number];

export function parseBeatSpan(chapterSpanHint: string): { start: number; end: number } | null {
  const numbers = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (numbers.length === 0 || numbers.some((value) => Number.isNaN(value))) {
    return null;
  }
  return { start: numbers[0], end: numbers[numbers.length - 1] };
}

export function getBeatExpectedChapterCount(beat: StructuredBeat): number {
  const span = parseBeatSpan(beat.chapterSpanHint);
  if (!span) {
    return 0;
  }
  return Math.max(1, span.end - span.start + 1);
}

export function getBeatSheetRequiredChapterCount(beatSheet: StructuredBeatSheet | null): number {
  if (!beatSheet) {
    return 0;
  }
  const beatCounts = beatSheet.beats
    .map((beat) => getBeatExpectedChapterCount(beat))
    .filter((count) => count > 0);
  if (beatCounts.length === beatSheet.beats.length) {
    return beatCounts.reduce((sum, count) => sum + count, 0);
  }
  return beatSheet.beats.reduce((maxValue, beat) => {
    const span = parseBeatSpan(beat.chapterSpanHint);
    const upperBound = span?.end ?? 0;
    return upperBound > maxValue ? upperBound : maxValue;
  }, 0);
}

function getLocalChapterOrder(
  chapter: StructuredChapter,
  volumeChapters: StructuredChapter[],
): number | null {
  const index = volumeChapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .findIndex((item) => item.id === chapter.id);
  return index >= 0 ? index + 1 : null;
}

export function chapterMatchesBeat(
  chapter: StructuredChapter,
  beat: StructuredBeat,
  volumeChapters: StructuredChapter[],
): boolean {
  if (chapter.beatKey?.trim()) {
    return chapter.beatKey.trim() === beat.key;
  }
  const span = parseBeatSpan(beat.chapterSpanHint);
  const localChapterOrder = getLocalChapterOrder(chapter, volumeChapters);
  return span && localChapterOrder ? localChapterOrder >= span.start && localChapterOrder <= span.end : false;
}

export function findChapterBeat(
  chapter: StructuredChapter,
  beatSheet: StructuredBeatSheet | null,
  volumeChapters: StructuredChapter[],
): StructuredBeat | null {
  return beatSheet?.beats.find((beat) => chapterMatchesBeat(chapter, beat, volumeChapters)) ?? null;
}
