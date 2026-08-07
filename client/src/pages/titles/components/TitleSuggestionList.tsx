import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { BookmarkPlus, Check, Copy, Sparkles } from "lucide-react";
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
  layout?: "list" | "grid";
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
  layout = "list",
}: TitleSuggestionListProps) {
  if (suggestions.length === 0) {
    if (layout === "grid") {
      return (
        <div className="rounded-3xl bg-muted/[0.16] px-6 py-14 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="mt-4 text-sm font-medium text-foreground">等待第一批标题灵感</div>
          <div className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{emptyMessage}</div>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={layout === "grid" ? "grid gap-3 md:grid-cols-2" : "divide-y divide-border/55"}>
      {suggestions.map((suggestion) => {
        const isSelected = selectedTitle === suggestion.title;
        const showSecondaryCopy = Boolean(onCopy && primaryActionLabel !== "复制标题");
        const metadata = [
          getTitleStyleLabel(suggestion.style),
          suggestion.angle,
          isSelected ? "当前选中" : null,
        ].filter((item): item is string => Boolean(item));
        const actions = (
          <div className="flex flex-wrap items-center gap-2">
            {onPrimaryAction ? (
              <Button type="button" size="sm" className="gap-1.5 rounded-full" onClick={() => onPrimaryAction(suggestion)}>
                {primaryActionLabel === "复制标题" ? <Copy className="h-3.5 w-3.5" /> : null}
                {primaryActionLabel}
              </Button>
            ) : null}
            {showSecondaryCopy ? (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-full" onClick={() => onCopy?.(suggestion)}>
                <Copy className="h-3.5 w-3.5" />
                复制
              </Button>
            ) : null}
            {onSave ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5 rounded-full"
                disabled={savingTitle === suggestion.title}
                onClick={() => onSave(suggestion)}
              >
                {savingTitle === suggestion.title ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    保存中
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    入库
                  </>
                )}
              </Button>
            ) : null}
          </div>
        );

        if (layout === "grid") {
          return (
            <article
              key={suggestion.title}
              className={`flex min-h-56 flex-col rounded-2xl border p-5 transition-all ${
                isSelected
                  ? "border-primary/30 bg-primary/[0.04] shadow-[inset_3px_0_0_hsl(var(--primary))]"
                  : "border-border/35 bg-card/70 hover:border-border/65 hover:shadow-[0_12px_32px_rgba(15,23,42,0.035)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {metadata.map((item) => <span key={`${suggestion.title}-${item}`}>{item}</span>)}
                </div>
                <span className="shrink-0 rounded-full bg-muted/60 px-2.5 py-1 font-medium tabular-nums text-foreground">
                  潜力 {suggestion.clickRate}
                </span>
              </div>
              <h4 className="mt-4 text-xl font-semibold leading-8 tracking-normal text-foreground">{suggestion.title}</h4>
              {suggestion.reason ? (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{suggestion.reason}</p>
              ) : null}
              <div className="mt-auto pt-5">{actions}</div>
            </article>
          );
        }

        return (
          <div
            key={suggestion.title}
            className={`group py-4 transition ${
              isSelected ? "rounded-xl bg-primary/[0.045] px-4" : "px-2 hover:bg-muted/[0.18]"
            }`}
          >
            <div className="grid gap-3 lg:grid-cols-[64px_minmax(0,1fr)_auto] lg:items-start">
              <div className="text-xs leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">预估</div>
                <div className="text-lg font-semibold tabular-nums text-foreground">{suggestion.clickRate}</div>
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {metadata.map((item) => (
                    <span key={`${suggestion.title}-${item}`}>{item}</span>
                  ))}
                </div>
                <div className="text-xl font-semibold tracking-normal text-foreground">{suggestion.title}</div>
                {suggestion.reason ? (
                  <div className="max-w-3xl text-sm leading-6 text-muted-foreground">{suggestion.reason}</div>
                ) : null}
              </div>

              <div className="lg:justify-self-end">{actions}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
