import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { Button } from "@/components/ui/button";
import { getTitleStyleLabel } from "../titleStudio.shared";

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
      <div className="py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {suggestions.map((suggestion) => {
        const isSelected = selectedTitle === suggestion.title;
        const metadata = [
          `预估 ${suggestion.clickRate}`,
          getTitleStyleLabel(suggestion.style),
          suggestion.angle,
          isSelected ? "当前选中" : null,
        ].filter((item): item is string => Boolean(item));
        return (
          <div
            key={suggestion.title}
            className={`group py-4 transition ${
              isSelected ? "rounded-lg bg-primary/5 px-3" : "px-1"
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {metadata.map((item, index) => (
                    <span
                      key={`${suggestion.title}-${item}`}
                      className={index === 0 ? "font-medium text-foreground" : undefined}
                    >
                      {item}
                    </span>
                  ))}
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
