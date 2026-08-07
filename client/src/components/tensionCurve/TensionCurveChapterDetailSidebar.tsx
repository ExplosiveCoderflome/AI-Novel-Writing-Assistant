import { ArrowRight, BookOpenText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface TensionCurveChapterContext {
  id: string;
  chapterId?: string | null;
  chapterOrder: number;
  beatKey?: string | null;
  title: string;
  summary?: string | null;
  purpose?: string | null;
  exclusiveEvent?: string | null;
  conflictLevel?: number | null;
  conflictLevelSource?: "ai" | "user" | null;
}

interface TensionCurveChapterDetailSidebarProps {
  chapter: TensionCurveChapterContext | null;
  beatLabel?: string | null;
  onOpenChapterDetail?: () => void;
}

function FieldBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-6 text-foreground">{value?.trim() || "This field is not filled in yet."}</div>
    </div>
  );
}

export function TensionCurveChapterDetailSidebar(props: TensionCurveChapterDetailSidebarProps) {
  const { chapter, beatLabel, onOpenChapterDetail } = props;

  if (!chapter) {
    return (
      <aside className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        After clicking a chapter node on the curve, the chapter title, summary, purpose and exclusive events will be displayed here, making it easy to adjust the intensity according to the narrative intention.
                  </aside>
    );
  }

  return (
    <aside className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Section{chapter.chapterOrder}chapter</Badge>
          {beatLabel ? <Badge variant="outline">{beatLabel}</Badge> : null}
          {chapter.conflictLevelSource === "user" ? <Badge variant="secondary">Manual fixation</Badge> : <Badge variant="outline">AI Hosting</Badge>}
        </div>
        <div className="text-base font-semibold leading-6 text-foreground">{chapter.title || `第${chapter.chapterOrder}章`}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpenText className="h-3.5 w-3.5" aria-hidden="true" />
          conflict intensity {typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : "To be determined"}
        </div>
      </div>

      <FieldBlock label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." value={chapter.summary} />
      <FieldBlock label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." value={chapter.purpose} />
      <FieldBlock label="monopoly case" value={chapter.exclusiveEvent} />

      {onOpenChapterDetail ? (
        <Button type="button" className="w-full justify-between" variant="outline" onClick={onOpenChapterDetail}>
          Open full chapter details card
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </aside>
  );
}
