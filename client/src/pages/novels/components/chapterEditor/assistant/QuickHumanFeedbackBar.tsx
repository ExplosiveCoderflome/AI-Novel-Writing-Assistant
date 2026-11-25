import { useState } from "react";
import { HUMAN_STYLE_ISSUE_TAGS, type HumanStyleIssueTag } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";

export function QuickHumanFeedbackBar({
  disabled = false,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (input: { issueTags: HumanStyleIssueTag[]; feedbackNote?: string; mode: "rewrite" | "record" }) => void;
}) {
  const [tags, setTags] = useState<HumanStyleIssueTag[]>([]);
  const [note, setNote] = useState("");
  const hasSignal = tags.length > 0 || note.trim().length > 0;

  return (
    <div className="space-y-2 border-t border-border/60 px-2 pb-1.5 pt-2">
      <div className="flex flex-wrap gap-1">
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
      <input
        value={note}
        disabled={disabled}
        onChange={(event) => setNote(event.target.value)}
        placeholder="补充意见（可选）：如改成具体动作与对话"
        aria-label="选段反例反馈意见"
        maxLength={400}
        className="h-8 w-full rounded-full border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring/30"
      />
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !hasSignal}
          onClick={() => onSubmit({ issueTags: tags, feedbackNote: note.trim() || undefined, mode: "record" })}
        >
          只记为本书反例
        </Button>
        <Button
          size="sm"
          disabled={disabled || !hasSignal}
          onClick={() => onSubmit({ issueTags: tags, feedbackNote: note.trim() || undefined, mode: "rewrite" })}
        >
          AI 按意见改这段
        </Button>
      </div>
    </div>
  );
}
