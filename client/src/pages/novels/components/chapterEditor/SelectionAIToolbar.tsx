import type { ChapterEditorOperation } from "@ai-novel/shared/types/novel";
import { HUMAN_STYLE_ISSUE_TAGS, type HumanStyleIssueTag } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import { CHAPTER_EDITOR_OPERATION_LABELS } from "./document";

interface Props {
  visible: boolean;
  targetLabel: string;
  selectionPreview?: string;
  selectedIssueTags?: HumanStyleIssueTag[];
  disabled?: boolean;
  recordingFeedback?: boolean;
  onRunOperation: (operation: ChapterEditorOperation, instruction?: string) => void;
  onToggleIssueTag?: (tag: HumanStyleIssueTag) => void;
  onRecordHumanFeedback?: () => void;
}
const OPERATIONS: ChapterEditorOperation[] = ["polish", "expand", "compress", "emotion", "conflict"];

export default function SelectionAIToolbar({
  visible,
  targetLabel,
  selectionPreview,
  selectedIssueTags = [],
  disabled,
  recordingFeedback = false,
  onRunOperation,
  onToggleIssueTag,
  onRecordHumanFeedback,
}: Props) {
  if (!visible) return null;
  const compactQuote = selectionPreview?.trim().replace(/\s+/g, " ");
  return <div role="toolbar" aria-label="选段 AI 改写" className="space-y-3"
    onMouseDown={event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}>
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{targetLabel} · 候选确认后写入正文</p>
      {compactQuote ? <p className="line-clamp-2 text-xs leading-5 text-foreground/80">“{compactQuote}”</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">{OPERATIONS.map(operation => <Button key={operation} size="sm"
      variant={operation === "polish" ? "default" : "outline"} disabled={disabled} onClick={() => onRunOperation(operation)}>
      {operation === "polish" ? "AI 优化这段" : CHAPTER_EDITOR_OPERATION_LABELS[operation]}
    </Button>)}</div>
    {onToggleIssueTag ? (
      <div className="space-y-2 border-t border-border/50 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">哪里像 AI / 需要避坑？</span>
          {onRecordHumanFeedback ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || recordingFeedback}
              onClick={onRecordHumanFeedback}
              className="h-7 px-2 text-xs"
            >
              {recordingFeedback ? "记录中…" : "记为本书反例"}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HUMAN_STYLE_ISSUE_TAGS.map((tag) => {
            const active = selectedIssueTags.includes(tag.key);
            return (
              <button
                key={tag.key}
                type="button"
                disabled={disabled}
                title={tag.hint}
                aria-pressed={active}
                onClick={() => onToggleIssueTag(tag.key)}
                className={
                  active
                    ? "rounded-md border border-primary/60 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    : "rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                }
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>
    ) : null}
  </div>;
}
