import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { BookmarkPlus, Check, Copy } from "lucide-react";
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
  primaryActionLabel = t("gen.pages.titles.components.TitleSuggestionList.gen_6f3398e0"),
  onPrimaryAction,
  onCopy,
  onSave,
  savingTitle = "",
  emptyMessage = t("gen.pages.titles.components.TitleSuggestionList.gen_2b2c3000"),
}: TitleSuggestionListProps) {
  if (suggestions.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/55">
      {suggestions.map((suggestion) => {
        const isSelected = selectedTitle === suggestion.title;
        const showSecondaryCopy = Boolean(onCopy && primaryActionLabel !== t("gen.pages.titles.components.TitleSuggestionList.gen_6f3398e0"));
        const metadata = [
          getTitleStyleLabel(suggestion.style),
          suggestion.angle,
          isSelected ? t("gen.pages.titles.components.TitleSuggestionList.gen_bf94700b") : null,
        ].filter((item): item is string => Boolean(item));
        return (
          <div
            key={suggestion.title}
            className={`group py-4 transition ${
              isSelected ? "rounded-xl bg-primary/[0.045] px-4" : "px-2 hover:bg-muted/[0.18]"
            }`}
          >
            <div className="grid gap-3 lg:grid-cols-[64px_minmax(0,1fr)_auto] lg:items-start">
              <div className="text-xs leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">{t("gen.pages.titles.components.TitleSuggestionList.gen_4584c097")}</div>
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

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {onPrimaryAction ? (
                  <Button type="button" size="sm" className="gap-1.5" onClick={() => onPrimaryAction(suggestion)}>
                    {primaryActionLabel === t("gen.pages.titles.components.TitleSuggestionList.gen_6f3398e0") ? <Copy className="h-3.5 w-3.5" /> : null}
                    {primaryActionLabel}
                  </Button>
                ) : null}
                {showSecondaryCopy ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onCopy?.(suggestion)}>
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </Button>
                ) : null}
                {onSave ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
