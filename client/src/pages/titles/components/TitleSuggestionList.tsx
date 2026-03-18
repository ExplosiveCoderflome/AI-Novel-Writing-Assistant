import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getClickRateBadgeClass, getTitleStyleLabel } from "../titleStudio.shared";

interface TitleSuggestionListProps {
  suggestions: TitleFactorySuggestion[];
  selectedTitle?: string;
  primaryActionLabel?: string;
  onPrimaryAction?: (suggestion: TitleFactorySuggestion) => void;
  onCopy?: (suggestion: TitleFactorySuggestion) => void;
  onSave?: (suggestion: TitleFactorySuggestion) => void;
  savingTitle?: string;
  emptyMessage?: string;
}

export default function TitleSuggestionList({
  suggestions,
  selectedTitle = "",
  primaryActionLabel = "复制标题",
  onPrimaryAction,
  onCopy,
  onSave,
  savingTitle = "",
  emptyMessage = "还没有生成任何标题。",
}: TitleSuggestionListProps) {
  if (suggestions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {suggestions.map((suggestion) => {
        const isSelected = selectedTitle === suggestion.title;
        return (
          <div
            key={suggestion.title}
            className={`rounded-xl border p-4 transition ${
              isSelected ? "border-primary/50 bg-primary/5" : "border-border/70 bg-background"
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getClickRateBadgeClass(suggestion.clickRate)}>
                    预估 {suggestion.clickRate}
                  </Badge>
                  <Badge variant="secondary">{getTitleStyleLabel(suggestion.style)}</Badge>
                  {suggestion.angle ? <Badge variant="outline">{suggestion.angle}</Badge> : null}
                  {isSelected ? <Badge variant="outline">当前选中</Badge> : null}
                </div>
                <div className="text-lg font-semibold text-foreground">{suggestion.title}</div>
                {suggestion.reason ? (
                  <div className="text-sm leading-6 text-muted-foreground">{suggestion.reason}</div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onPrimaryAction ? (
                  <Button type="button" size="sm" onClick={() => onPrimaryAction(suggestion)}>
                    {primaryActionLabel}
                  </Button>
                ) : null}
                {onCopy ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onCopy(suggestion)}>
                    复制
                  </Button>
                ) : null}
                {onSave ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={savingTitle === suggestion.title}
                    onClick={() => onSave(suggestion)}
                  >
                    {savingTitle === suggestion.title ? "保存中..." : "加入标题库"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
