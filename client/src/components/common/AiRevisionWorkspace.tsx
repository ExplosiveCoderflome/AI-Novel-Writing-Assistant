import { useCallback, useEffect, useRef, useState } from "react";
import type { Descendant, Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "@/components/ui/button";

function toPlateValue(text: string): Value {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const paragraphs = lines.map((line) => ({
    type: "p",
    children: [{ text: line }],
  }));
  if (paragraphs.length === 0) {
    return [{ type: "p", children: [{ text: "" }] }];
  }
  return paragraphs;
}

function nodeToText(node: Descendant): string {
  if ("text" in node && typeof node.text === "string") {
    return node.text;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToText(child as Descendant)).join("");
  }
  return "";
}

function toPlainText(value: Value): string {
  return (value as Descendant[]).map((node) => nodeToText(node)).join("\n");
}

function normalizeValuePayload(payload: unknown): Value {
  if (Array.isArray(payload)) {
    return payload as Value;
  }
  if (payload && typeof payload === "object" && "value" in payload) {
    const value = (payload as { value?: unknown }).value;
    if (Array.isArray(value)) {
      return value as Value;
    }
  }
  return [];
}

interface AiRevisionWorkspaceProps {
  value: string;
  onChange: (next: string) => void;
  instruction: string;
  onInstructionChange: (next: string) => void;
  onOptimizeFull: () => void;
  onOptimizeSelection: (selectedText: string) => void;
  isOptimizing: boolean;
  preview: string;
  onApplyPreview: () => void;
  onCancelPreview: () => void;
  leftLabel: string;
  rightLabel?: string;
  minHeightClassName?: string;
}

export default function AiRevisionWorkspace(props: AiRevisionWorkspaceProps) {
  const {
    value,
    onChange,
    instruction,
    onInstructionChange,
    onOptimizeFull,
    onOptimizeSelection,
    isOptimizing,
    preview,
    onApplyPreview,
    onCancelPreview,
    leftLabel,
    rightLabel = "AI 修正指令",
    minHeightClassName = "min-h-[320px]",
  } = props;
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(value);
  const [selectedText, setSelectedText] = useState("");
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin],
      value: toPlateValue(internalText),
    },
    [editorSeed],
  );

  useEffect(() => {
    if (value === internalText) {
      return;
    }
    setInternalText(value);
    setEditorSeed((prev) => prev + 1);
  }, [internalText, value]);

  const updateSelectedText = useCallback(() => {
    const selection = globalThis.window?.getSelection?.();
    const container = editorContainerRef.current;
    if (!container) {
      return;
    }
    const activeElement = globalThis.document?.activeElement;
    const isEditorFocused = Boolean(activeElement && container.contains(activeElement));
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (isEditorFocused) {
        setSelectedText("");
      }
      return;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode || !container.contains(anchorNode) || !container.contains(focusNode)) {
      if (isEditorFocused) {
        setSelectedText("");
      }
      return;
    }
    const selectionText = selection.toString().trim();
    if (selectionText) {
      setSelectedText(selectionText);
    }
  }, []);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = toPlainText(normalizeValuePayload(payload));
    setInternalText(nextText);
    onChange(nextText);
  }, [onChange]);

  return (
    <Group orientation="horizontal" className="rounded-md border">
      <Panel defaultSize={72} minSize={55}>
        <div className={`space-y-2 p-3 ${minHeightClassName}`}>
          <div className="text-sm font-medium">{leftLabel}</div>
          <div ref={editorContainerRef}>
            {editor ? (
              <Plate
                editor={editor}
                onSelectionChange={updateSelectedText}
                onValueChange={handleValueChange}
              >
                <PlateContent
                  className="min-h-[260px] rounded-md border bg-background p-3 text-sm outline-none"
                  onMouseUp={updateSelectedText}
                  onKeyUp={updateSelectedText}
                />
              </Plate>
            ) : null}
          </div>
        </div>
      </Panel>
      <Separator className="w-1 bg-border transition-colors hover:bg-muted-foreground/30" />
      <Panel defaultSize={28} minSize={20}>
        <div className={`space-y-3 border-l p-3 ${minHeightClassName}`}>
          <div className="text-sm font-medium">{rightLabel}</div>
          <textarea
            className="min-h-[120px] w-full rounded-md border bg-background p-2 text-sm"
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder="输入修正要求，例如：压缩冗余、加强冲突、保持既有设定不变。"
          />
          {selectedText ? (
            <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
              <div className="mb-1 font-medium">当前选中内容（将用于精准优化）</div>
              <div className="max-h-24 overflow-auto whitespace-pre-wrap">{selectedText}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">未选中内容时仅支持全文优化。</div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={onOptimizeFull}
              disabled={isOptimizing || instruction.trim().length === 0}
            >
              {isOptimizing ? "优化中..." : "全文优化预览"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onOptimizeSelection(selectedText)}
              disabled={isOptimizing || instruction.trim().length === 0 || selectedText.length === 0}
            >
              仅优化选中内容
            </Button>
          </div>
          {preview.trim() ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">优化预览</div>
              <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-2 text-xs">
                {preview}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={onApplyPreview}>应用预览</Button>
                <Button size="sm" variant="outline" onClick={onCancelPreview}>取消预览</Button>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>
    </Group>
  );
}
