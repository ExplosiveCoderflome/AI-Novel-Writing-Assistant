import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import { Button } from "@/components/ui/button";

interface BookAnalysisChapterNavigatorProps {
  chapters: DocumentChapter[];
  currentChapterIndex: number | null;
  onSelectChapter: (chapterIndex: number) => void;
}

export default function BookAnalysisChapterNavigator({
  chapters,
  currentChapterIndex,
  onSelectChapter,
}: BookAnalysisChapterNavigatorProps) {
  const currentPosition = chapters.findIndex((chapter) => chapter.chapterIndex === currentChapterIndex);
  const canGoPrev = currentPosition > 0;
  const canGoNext = currentPosition >= 0 && currentPosition < chapters.length - 1;

  return (
    <nav className="flex h-full min-h-0 flex-col bg-muted/10">
      <div className="space-y-2 border-b p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canGoPrev}
            onClick={() => onSelectChapter(chapters[currentPosition - 1].chapterIndex)}
          >
            上一章
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canGoNext}
            onClick={() => onSelectChapter(chapters[currentPosition + 1].chapterIndex)}
          >
            下一章
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="space-y-1">
          {chapters.map((chapter) => {
            const selected = chapter.chapterIndex === currentChapterIndex;
            return (
              <button
                key={chapter.id}
                type="button"
                className={`block w-full rounded-md border px-2 py-2 text-left text-xs leading-5 transition-colors ${
                  selected
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-transparent bg-background/80 hover:border-border hover:bg-background"
                }`}
                onClick={() => onSelectChapter(chapter.chapterIndex)}
                title={chapter.title}
              >
                <div className="font-medium">{chapter.chapterIndex + 1}. {chapter.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{chapter.charCount} 字</div>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
