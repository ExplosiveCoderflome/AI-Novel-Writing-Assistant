import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type {
  BookAnalysisChapterHighlightRange,
  BookAnalysisChapterReaderHandle,
} from "../hooks/useBookAnalysisChapterReader";
import BookAnalysisChapterNavigator from "./BookAnalysisChapterNavigator";

interface BookAnalysisChapterReaderProps {
  chapters: DocumentChapter[];
  sourceVersionContent: string;
  currentChapterIndex: number | null;
  highlightRange: BookAnalysisChapterHighlightRange | null;
  onActiveChapterChange: (chapterIndex: number) => void;
  onSelectChapter: (chapterIndex: number) => void;
}

const BookAnalysisChapterReader = forwardRef<BookAnalysisChapterReaderHandle, BookAnalysisChapterReaderProps>(
  function BookAnalysisChapterReader(props, ref) {
    const {
      chapters,
      sourceVersionContent,
      currentChapterIndex,
      highlightRange,
      onActiveChapterChange,
      onSelectChapter,
    } = props;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chapterRefs = useRef(new Map<number, HTMLElement>());
    const frameRef = useRef<number | null>(null);
    const sortedChapters = useMemo(
      () => [...chapters].sort((a, b) => a.chapterIndex - b.chapterIndex),
      [chapters],
    );

    const setChapterRef = (chapterIndex: number, element: HTMLElement | null) => {
      if (element) {
        chapterRefs.current.set(chapterIndex, element);
      } else {
        chapterRefs.current.delete(chapterIndex);
      }
    };

    const scrollToChapter = (chapterIndex: number) => {
      const container = containerRef.current;
      const element = chapterRefs.current.get(chapterIndex);
      if (!container || !element) {
        return;
      }
      container.scrollTo({
        top: element.offsetTop - 12,
        behavior: "smooth",
      });
    };

    useImperativeHandle(ref, () => ({
      scrollToChapter,
      scrollToEvidence: (chapterIndex) => {
        scrollToChapter(chapterIndex);
      },
    }));

    useEffect(() => {
      if (currentChapterIndex === null && sortedChapters[0]) {
        onActiveChapterChange(sortedChapters[0].chapterIndex);
      }
    }, [currentChapterIndex, onActiveChapterChange, sortedChapters]);

    useEffect(() => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    }, []);

    const updateActiveChapter = () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const containerTop = container.getBoundingClientRect().top;
      let nextChapterIndex = sortedChapters[0]?.chapterIndex ?? 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const chapter of sortedChapters) {
        const element = chapterRefs.current.get(chapter.chapterIndex);
        if (!element) {
          continue;
        }
        const distance = Math.abs(element.getBoundingClientRect().top - containerTop - 16);
        if (distance < bestDistance) {
          bestDistance = distance;
          nextChapterIndex = chapter.chapterIndex;
        }
      }
      if (nextChapterIndex !== currentChapterIndex) {
        onActiveChapterChange(nextChapterIndex);
      }
    };

    const handleScroll = () => {
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateActiveChapter();
      });
    };

    if (sortedChapters.length === 0) {
      return (
        <aside className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
          当前文档还没有可用于对照阅读的章节缓存。
        </aside>
      );
    }

    return (
      <aside className="sticky top-0 isolate h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden rounded-md border bg-background shadow-sm">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b bg-background px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{t("gen.pages.bookAnalysis.components.BookAnalysisChapterReader.gen_8cb781c5")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisChapterReader.gen_067a3cdb")}</div>
              </div>
              {currentChapterIndex !== null ? (
                <div className="rounded-md border bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
                  当前第 {currentChapterIndex + 1} 章
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
            <div className="min-h-0 border-r bg-muted/10">
              <BookAnalysisChapterNavigator
                chapters={sortedChapters}
                currentChapterIndex={currentChapterIndex}
                onSelectChapter={onSelectChapter}
              />
            </div>
            <div ref={containerRef} className="min-h-0 overflow-auto bg-background p-4" onScroll={handleScroll}>
              <div className="space-y-4">
                {sortedChapters.map((chapter) => {
                  const content = sourceVersionContent.slice(chapter.startOffset, chapter.endOffset);
                  const isActive = currentChapterIndex === chapter.chapterIndex;
                  const activeHighlight = highlightRange?.chapterIndex === chapter.chapterIndex ? highlightRange : null;
                  return (
                    <section
                      key={chapter.id}
                      ref={(element) => setChapterRef(chapter.chapterIndex, element)}
                      className={`scroll-mt-4 rounded-md border p-4 ${
                        isActive ? "border-primary/40 bg-primary/5" : "bg-muted/10"
                      }`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold">{chapter.title}</h3>
                        <span className="text-xs text-muted-foreground">{t("gen.pages.bookAnalysis.components.BookAnalysisChapterReader.gen_821cf47a")}</span>
                      </div>
                      <ChapterContent
                        chapterContent={content}
                        chapterStartOffset={chapter.startOffset}
                        highlightRange={activeHighlight}
                      />
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  },
);

export default BookAnalysisChapterReader;

function ChapterContent({
  chapterContent,
  chapterStartOffset,
  highlightRange,
}: {
  chapterContent: string;
  chapterStartOffset: number;
  highlightRange: BookAnalysisChapterHighlightRange | null;
}) {
  if (!highlightRange) {
    return <div className="whitespace-pre-wrap text-sm leading-7">{chapterContent}</div>;
  }

  const relativeStart = Math.max(0, highlightRange.start - chapterStartOffset);
  const relativeEnd = Math.min(
    chapterContent.length,
    Math.max(relativeStart, highlightRange.end - chapterStartOffset),
  );
  const before = chapterContent.slice(0, relativeStart);
  const highlight = chapterContent.slice(relativeStart, relativeEnd);
  const after = chapterContent.slice(relativeEnd);

  return (
    <div className="whitespace-pre-wrap text-sm leading-7">
      <span>{before}</span>
      <mark className="rounded bg-amber-200 px-1 text-amber-950">{highlight}</mark>
      <span>{after}</span>
    </div>
  );
}
