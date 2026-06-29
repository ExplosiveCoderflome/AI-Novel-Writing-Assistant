import { useCallback, useRef, useState } from "react";

export interface BookAnalysisChapterHighlightRange {
  chapterIndex: number;
  start: number;
  end: number;
}

export interface BookAnalysisChapterReaderHandle {
  scrollToChapter: (chapterIndex: number) => void;
  scrollToEvidence: (chapterIndex: number, range?: { start: number; end: number }) => void;
}

export function useBookAnalysisChapterReader() {
  const readerRef = useRef<BookAnalysisChapterReaderHandle | null>(null);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number | null>(null);
  const [highlightRange, setHighlightRange] = useState<BookAnalysisChapterHighlightRange | null>(null);

  const scrollToEvidence = useCallback((chapterIndex: number, range?: { start: number; end: number }) => {
    setCurrentChapterIndex(chapterIndex);
    setHighlightRange(range ? { chapterIndex, ...range } : null);
    readerRef.current?.scrollToEvidence(chapterIndex, range);
  }, []);

  const scrollToChapter = useCallback((chapterIndex: number) => {
    setCurrentChapterIndex(chapterIndex);
    setHighlightRange(null);
    readerRef.current?.scrollToChapter(chapterIndex);
  }, []);

  return {
    readerRef,
    currentChapterIndex,
    highlightRange,
    setCurrentChapterIndex,
    setHighlightRange,
    scrollToEvidence,
    scrollToChapter,
  };
}
