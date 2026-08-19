import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Badge } from "@/components/ui/badge";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface TakeoverContextSummaryPanelProps {
  lines: string[];
}

export default function TakeoverContextSummaryPanel({ lines }: TakeoverContextSummaryPanelProps) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/15 p-3 sm:p-4">
      <div className="text-sm font-medium text-foreground">{i18next.t("dict.gen_335ffbc2")}</div>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        {lines.length > 0 ? lines.map((line) => (
          <Badge key={line} variant="secondary" className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]">
            {line}
          </Badge>
        )) : (
          <span className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("novels.takeoverContextSummaryPanel.yjf5p9")}</span>
        )}
      </div>
    </div>
  );
}
