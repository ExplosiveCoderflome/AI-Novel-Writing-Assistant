import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import type { ReactNode, RefObject } from "react";
import type {
  BookAnalysisChapterHighlightRange,
  BookAnalysisChapterReaderHandle,
} from "../hooks/useBookAnalysisChapterReader";
import BookAnalysisChapterReader from "./BookAnalysisChapterReader";

interface BookAnalysisDualPaneLayoutProps {
  enabled: boolean;
  chapters: DocumentChapter[];
  sourceVersionContent: string;
  readerRef: RefObject<BookAnalysisChapterReaderHandle | null>;
  currentChapterIndex: number | null;
  highlightRange: BookAnalysisChapterHighlightRange | null;
  onActiveChapterChange: (chapterIndex: number) => void;
  onSelectChapter: (chapterIndex: number) => void;
  children: ReactNode;
}

export default function BookAnalysisDualPaneLayout({
  enabled,
  chapters,
  sourceVersionContent,
  readerRef,
  currentChapterIndex,
  highlightRange,
  onActiveChapterChange,
  onSelectChapter,
  children,
}: BookAnalysisDualPaneLayoutProps) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="grid grid-cols-[5fr_6fr] items-start gap-4">
      <BookAnalysisChapterReader
        ref={readerRef}
        chapters={chapters}
        sourceVersionContent={sourceVersionContent}
        currentChapterIndex={currentChapterIndex}
        highlightRange={highlightRange}
        onActiveChapterChange={onActiveChapterChange}
        onSelectChapter={onSelectChapter}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
