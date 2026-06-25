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
  const selectedValue = currentChapterIndex === null ? "" : String(currentChapterIndex);
  const canGoPrev = currentPosition > 0;
  const canGoNext = currentPosition >= 0 && currentPosition < chapters.length - 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canGoPrev}
          onClick={() => onSelectChapter(chapters[currentPosition - 1].chapterIndex)}
        >
          上一章
        </Button>
        <select
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          value={selectedValue}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onSelectChapter(next);
            }
          }}
        >
          <option value="" disabled>
            选择章节
          </option>
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.chapterIndex}>
              {chapter.chapterIndex + 1}. {chapter.title}
            </option>
          ))}
        </select>
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

      {chapters.length > 30 ? (
        <div className="max-h-48 overflow-auto rounded-md border bg-muted/10 p-1">
          {chapters.map((chapter) => {
            const selected = chapter.chapterIndex === currentChapterIndex;
            return (
              <button
                key={chapter.id}
                type="button"
                className={`block w-full rounded px-2 py-1.5 text-left text-xs leading-5 ${
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted/40"
                }`}
                onClick={() => onSelectChapter(chapter.chapterIndex)}
              >
                {chapter.chapterIndex + 1}. {chapter.title}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
