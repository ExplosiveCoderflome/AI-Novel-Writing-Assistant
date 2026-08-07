import { Badge } from "@/components/ui/badge";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface TakeoverContextSummaryPanelProps {
  lines: string[];
}

export default function TakeoverContextSummaryPanel({ lines }: TakeoverContextSummaryPanelProps) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/15 p-3 sm:p-4">
      <div className="text-sm font-medium text-foreground">The current project information will be input as an automatic director</div>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        {lines.length > 0 ? lines.map((line) => (
          <Badge key={line} variant="secondary" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">
            {line}
          </Badge>
        )) : (
          <span className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            There is currently little information, so it is recommended to add at least one story summary or book-level selling point before taking over.
                                    </span>
        )}
      </div>
    </div>
  );
}
