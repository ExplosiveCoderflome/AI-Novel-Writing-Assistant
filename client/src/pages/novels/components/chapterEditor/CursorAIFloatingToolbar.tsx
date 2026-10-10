import { useEffect, useState } from "react";
import type { ChapterEditorCursorOperation } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { SelectionToolbarPosition } from "./chapterEditorTypes";
import { CHAPTER_EDITOR_CURSOR_OPERATION_LABELS } from "./document";

interface CursorAIFloatingToolbarProps {
  visible: boolean;
  position: SelectionToolbarPosition | null;
  disabled?: boolean;
  onRunOperation: (operation: ChapterEditorCursorOperation, instruction?: string) => void;
}

const OPERATIONS: ChapterEditorCursorOperation[] = [
  "continue",
  "transition",
  "dialogue",
  "description",
  "inner_thought",
  "conflict",
];

export default function CursorAIFloatingToolbar(props: CursorAIFloatingToolbarProps) {
  const { visible, position, disabled = false, onRunOperation } = props;
  const [instruction, setInstruction] = useState("");
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  useEffect(() => {
    if (!visible) {
      setInstruction("");
      setIsCustomOpen(false);
    }
  }, [visible]);

  if (!visible || !position) {
    return null;
  }

  return (
    <div
      className="absolute z-20 w-[360px] rounded-2xl border border-border/70 bg-background/95 p-2 shadow-xl backdrop-blur"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="mb-1 text-xs text-muted-foreground">在光标处让 AI 接着写</div>
      <div className="flex flex-wrap gap-2">
        {OPERATIONS.map((operation) => (
          <Button
            key={operation}
            size="sm"
            variant={operation === "continue" ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onRunOperation(operation)}
          >
            {CHAPTER_EDITOR_CURSOR_OPERATION_LABELS[operation]}
          </Button>
        ))}
        <Button
          size="sm"
          variant={isCustomOpen ? "default" : "outline"}
          disabled={disabled}
          onClick={() => setIsCustomOpen((current) => !current)}
        >
          自定义方向
        </Button>
      </div>
      {isCustomOpen ? (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
          <textarea
            className="min-h-[72px] w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            placeholder="例如：让人物先犹豫，再用一句短对话把冲突推向门外。"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={disabled || instruction.trim().length === 0}
              onClick={() => onRunOperation("continue", instruction.trim())}
            >
              按这句话续写
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
