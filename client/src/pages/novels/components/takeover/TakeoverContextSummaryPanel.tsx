import { Badge } from "@/components/ui/badge";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface TakeoverContextSummaryPanelProps {
  lines: string[];
}

export default function TakeoverContextSummaryPanel({ lines }: TakeoverContextSummaryPanelProps) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/15 p-3 sm:p-4">
      <div className="text-sm font-medium text-foreground">当前项目信息会作为自动导演输入</div>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        {lines.length > 0 ? lines.map((line) => (
          <Badge key={line} variant="secondary" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">
            {line}
          </Badge>
        )) : (
          <span className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            当前信息较少，建议至少补一句故事概述或书级卖点后再接管。
          </span>
        )}
      </div>
    </div>
  );
}
