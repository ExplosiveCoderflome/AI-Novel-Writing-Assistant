import type { ChapterEditorOperation } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { CHAPTER_EDITOR_OPERATION_LABELS } from "./document";

interface Props {
  visible: boolean;
  targetLabel: string;
  disabled?: boolean;
  onRunOperation: (operation: ChapterEditorOperation, instruction?: string) => void;
}
const OPERATIONS: ChapterEditorOperation[] = ["polish", "expand", "compress", "emotion", "conflict"];

export default function SelectionAIToolbar({ visible, targetLabel, disabled, onRunOperation }: Props) {
  if (!visible) return null;
  return <div role="toolbar" aria-label="选段 AI 改写" className="space-y-3"
    onMouseDown={event => { if ((event.target as HTMLElement).closest("button")) event.preventDefault(); }}>
    <p className="text-xs text-muted-foreground">{targetLabel} · 候选确认后写入正文</p>
    <div className="flex flex-wrap gap-2">{OPERATIONS.map(operation => <Button key={operation} size="sm"
      variant={operation === "polish" ? "default" : "outline"} disabled={disabled} onClick={() => onRunOperation(operation)}>
      {operation === "polish" ? "AI 优化这段" : CHAPTER_EDITOR_OPERATION_LABELS[operation]}
    </Button>)}</div>
  </div>;
}
