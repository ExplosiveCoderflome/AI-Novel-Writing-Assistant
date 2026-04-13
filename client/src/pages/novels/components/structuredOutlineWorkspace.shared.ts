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

export function getBeatSheetRequiredChapterCount(beatSheet: StructuredBeatSheet | null): number {
  if (!beatSheet) {
    return 0;
  }
  return beatSheet.beats.reduce((maxValue, beat) => {
    const span = parseBeatSpan(beat.chapterSpanHint);
    const upperBound = span?.end ?? 0;
    return upperBound > maxValue ? upperBound : maxValue;
  }, 0);
}

export function chapterMatchesBeat(chapter: StructuredChapter, beat: StructuredBeat): boolean {
  const span = parseBeatSpan(beat.chapterSpanHint);
  return span ? chapter.chapterOrder >= span.start && chapter.chapterOrder <= span.end : false;
}

export function findChapterBeat(
  chapter: StructuredChapter,
  beatSheet: StructuredBeatSheet | null,
): StructuredBeat | null {
  return beatSheet?.beats.find((beat) => chapterMatchesBeat(chapter, beat)) ?? null;
}
