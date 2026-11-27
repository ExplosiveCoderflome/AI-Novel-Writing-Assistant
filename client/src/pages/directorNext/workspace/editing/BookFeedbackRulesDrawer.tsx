import { Trash2 } from "lucide-react";
import type { NovelHumanStyleFeedbackSummary } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";

export function BookFeedbackRulesDrawer({
  summary,
  removingPattern,
  onRemove,
}: {
  summary: NovelHumanStyleFeedbackSummary;
  removingPattern: string | null;
  onRemove: (aiPattern: string) => void;
}) {
  if (summary.contrastPairs.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="本书写作避坑记录"
      className="space-y-2.5 bg-muted/30 px-4 py-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {summary.profileName ? `${summary.profileName} · ` : ""}已记住 {summary.contrastPairs.length} 条表达对照
        </span>
        <span className="text-muted-foreground">后续生成与局部修文会自动参照避开</span>
      </div>
      <div className="divide-y divide-border/50">
        {summary.contrastPairs.map((pair) => (
          <div key={pair.aiPattern} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0 space-y-0.5 leading-5">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground/80">避免：</span>
                {pair.aiPattern}
              </p>
              <p className="text-foreground">
                <span className="font-medium text-primary/90">改用：</span>
                {pair.preferred}
              </p>
              {pair.note ? <p className="text-muted-foreground">原因：{pair.note}</p> : null}
            </div>
            {summary.isBookOwned ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={removingPattern === pair.aiPattern}
                aria-label={`移除反例：${pair.aiPattern}`}
                onClick={() => onRemove(pair.aiPattern)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
