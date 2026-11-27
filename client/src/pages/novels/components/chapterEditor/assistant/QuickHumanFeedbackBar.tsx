import { useState } from "react";
import { HUMAN_STYLE_ISSUE_TAGS, type HumanStyleIssueTag } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";

export function QuickHumanFeedbackBar({
  disabled = false,
  onInstruction,
  onFeedback,
}: {
  disabled?: boolean;
  onInstruction?: (instruction: string) => void;
  onFeedback?: (input: { issueTags: HumanStyleIssueTag[]; feedbackNote?: string; mode: "rewrite" | "record" }) => void;
}) {
  const [tags, setTags] = useState<HumanStyleIssueTag[]>([]);
  const [note, setNote] = useState("");
  const trimmedNote = note.trim();
  const hasSignal = tags.length > 0 || trimmedNote.length > 0;

  function handleRewrite() {
    if (!hasSignal) return;
    if (tags.length === 0 && trimmedNote && onInstruction) {
      onInstruction(trimmedNote);
      return;
    }
    onFeedback?.({ issueTags: tags, feedbackNote: trimmedNote || undefined, mode: "rewrite" });
  }

  return (
    <div className="space-y-2 border-t border-border/60 px-2 pb-1.5 pt-2">
      {onFeedback ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] text-muted-foreground">AI 标识：</span>
          {HUMAN_STYLE_ISSUE_TAGS.map((tag) => {
            const active = tags.includes(tag.key);
            return (
              <button
                key={tag.key}
                type="button"
                disabled={disabled}
                title={tag.hint}
                onClick={() => setTags((prev) => (prev.includes(tag.key) ? prev.filter((item) => item !== tag.key) : [...prev, tag.key]))}
                className={
                  active
                    ? "rounded-full border border-primary/60 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    : "rounded-full bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={note}
          disabled={disabled}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && hasSignal && !disabled) {
              event.preventDefault();
              handleRewrite();
            }
          }}
          placeholder="写一句修改要求，或结合上方 AI 标识回车改写"
          aria-label="自定义修改或 AI 标识意见"
          maxLength={400}
          className="h-8 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring/30"
        />
        {onFeedback ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !hasSignal}
            onClick={() => onFeedback({ issueTags: tags, feedbackNote: trimmedNote || undefined, mode: "record" })}
          >
            记为反例
          </Button>
        ) : null}
        <Button size="sm" disabled={disabled || !hasSignal} onClick={handleRewrite}>
          AI 改写
        </Button>
      </div>
    </div>
  );
}
