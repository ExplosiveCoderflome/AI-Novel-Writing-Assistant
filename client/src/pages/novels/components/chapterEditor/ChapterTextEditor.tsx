import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import type { ChapterEditorDiffChunk } from "@ai-novel/shared/types/novel";
import type { ChapterEditorSelectionRange, SelectionToolbarPosition } from "./chapterEditorTypes";
import {
  buildToolbarPosition,
  normalizeEditorText,
  normalizeValuePayload,
  toPlainText,
  toPlateValue,
} from "./chapterEditorUtils";

interface ChapterTextEditorProps {
  value: string;
  onChange: (next: string) => void;
  onSelectionChange: (selection: ChapterEditorSelectionRange | null, position: SelectionToolbarPosition | null) => void;
  preview?: {
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
  } | null;
}

function renderDiffChunk(chunk: ChapterEditorDiffChunk) {
  if (chunk.type === "equal") {
    return <span key={chunk.id}>{chunk.text}</span>;
  }
  if (chunk.type === "insert") {
    return (
      <span key={chunk.id} className="rounded bg-emerald-100/90 px-0.5 text-emerald-950">
        {chunk.text}
      </span>
    );
  }
  return (
    <span key={chunk.id} className="rounded bg-rose-100/80 px-0.5 text-rose-900 line-through">
      {chunk.text}
    </span>
  );
}

export default function ChapterTextEditor(props: ChapterTextEditorProps) {
  const { value, onChange, onSelectionChange, preview } = props;
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(value);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

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
    setEditorSeed((current) => current + 1);
  }, [internalText, value]);

  const updateSelection = useCallback(() => {
    if (!editor || preview) {
      onSelectionChange(null, null);
      return;
    }

    const selectionObject = globalThis.window?.getSelection?.();
    const surface = surfaceRef.current;
    if (!selectionObject || !surface || selectionObject.rangeCount === 0 || selectionObject.isCollapsed) {
      onSelectionChange(null, null);
      return;
    }

    const range = selectionObject.getRangeAt(0);
    if (!surface.contains(range.commonAncestorContainer)) {
      onSelectionChange(null, null);
      return;
    }

    const startRange = range.cloneRange();
    startRange.selectNodeContents(surface);
    startRange.setEnd(range.startContainer, range.startOffset);
    const from = normalizeEditorText(startRange.toString()).length;
    const text = normalizeEditorText(range.toString());
    const to = from + text.length;
    if (!text.trim()) {
      onSelectionChange(null, null);
      return;
    }

    const container = containerRef.current;
    const position = container
      ? buildToolbarPosition(container, range)
      : null;

    onSelectionChange(
      {
        from,
        to,
        text,
      },
      position,
    );
  }, [editor, onSelectionChange, preview]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = normalizeEditorText(toPlainText(normalizeValuePayload(payload)));
    setInternalText(nextText);
    onChange(nextText);
  }, [onChange]);

  const previewContent = useMemo(() => {
    if (!preview) {
      return null;
    }
    const normalized = normalizeEditorText(value);
    return {
      before: normalized.slice(0, preview.from),
      after: normalized.slice(preview.to),
    };
  }, [preview, value]);

  return (
    <div ref={containerRef} className="relative rounded-3xl border border-border/70 bg-background shadow-sm">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="text-sm font-medium text-foreground">正文</div>
        <div className="text-xs text-muted-foreground">
          {preview ? "待确认改写预览" : "可直接编辑正文，选中内容后可发起 AI 改写"}
        </div>
      </div>

      <div className="min-h-[480px] p-4">
        {preview && previewContent ? (
          <div
            ref={surfaceRef}
            className="min-h-[440px] whitespace-pre-wrap rounded-2xl bg-muted/15 p-4 text-[15px] leading-8 text-foreground"
          >
            {previewContent.before}
            {preview.diffChunks.map((chunk) => renderDiffChunk(chunk))}
            {previewContent.after}
          </div>
        ) : editor ? (
          <Plate editor={editor} onSelectionChange={updateSelection} onValueChange={handleValueChange}>
            <div ref={surfaceRef}>
              <PlateContent
                className="min-h-[440px] whitespace-pre-wrap rounded-2xl bg-muted/10 p-4 text-[15px] leading-8 outline-none"
                onMouseUp={updateSelection}
                onKeyUp={updateSelection}
              />
            </div>
          </Plate>
        ) : null}
      </div>
    </div>
  );
}
