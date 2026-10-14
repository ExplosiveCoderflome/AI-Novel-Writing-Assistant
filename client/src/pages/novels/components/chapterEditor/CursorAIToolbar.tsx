import type { ChapterEditorCursorOperation } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { CHAPTER_EDITOR_CURSOR_OPERATION_LABELS } from "./document";

interface Props {
  visible: boolean;
  targetLabel: string;
  disabled?: boolean;
  onRunOperation: (operation: ChapterEditorCursorOperation, instruction?: string) => void;
}
const OPERATIONS: ChapterEditorCursorOperation[] = ["continue", "transition", "dialogue", "description", "inner_thought", "conflict"];

export default function CursorAIToolbar({ visible, targetLabel, disabled, onRunOperation }: Props) {
  if (!visible) return null;
  return <div role="toolbar" aria-label="光标 AI 续写" className="space-y-3"
    onMouseDown={event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}>
    <p className="text-xs text-muted-foreground">{targetLabel} · 候选确认后插入正文</p>
    <div className="flex flex-wrap gap-2">{OPERATIONS.map(operation => <Button key={operation} size="sm"
      variant={operation === "continue" ? "default" : "outline"} disabled={disabled} onClick={() => onRunOperation(operation)}>
      {CHAPTER_EDITOR_CURSOR_OPERATION_LABELS[operation]}
    </Button>)}</div>
  </div>;
}
