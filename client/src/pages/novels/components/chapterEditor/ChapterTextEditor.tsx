import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import type { ChapterEditorDiffChunk } from "@ai-novel/shared/types/novel";
import type { ChapterEditorSelectionRange, SelectionToolbarPosition } from "./chapterEditorTypes";
import {
  buildSelectionRangeFromValue,
  buildToolbarPosition,
  getParagraphIndicesForRange,
  normalizeChapterContent,
  normalizeEditorText,
  normalizeValuePayload,
  toPlainText,
  toPlateValue,
} from "./chapterEditorUtils";

type ChapterEditorPreview =
  | {
    mode: "loading";
    from: number;
    to: number;
    originalText: string;
  }
  | {
    mode: "inline";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    originalText: string;
    candidateText: string;
  }
  | {
    mode: "block";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    originalText: string;
    candidateText: string;
  };

interface ChapterTextEditorProps {
  value: string;
  readOnly?: boolean;
  onChange: (next: string) => void;
  onSelectionChange: (selection: ChapterEditorSelectionRange | null, position: SelectionToolbarPosition | null) => void;
  preview?: ChapterEditorPreview | null;
  focusRange?: Pick<ChapterEditorSelectionRange, "from" | "to"> | null;
}

const EDITOR_BODY_CLASS_NAME = "prose prose-sm max-w-none min-w-0 overflow-hidden break-words text-[15px] leading-8 dark:prose-invert [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words";
const INLINE_PREVIEW_BODY_CLASS_NAME = `${EDITOR_BODY_CLASS_NAME} whitespace-pre-wrap`;
const READONLY_BODY_CLASS_NAME = "min-w-0 break-words text-[15px] leading-8";
const SURFACE_INNER_PADDING_CLASS_NAME = "pl-14";

function splitDisplayParagraphs(text: string): string[] {
  const normalized = normalizeChapterContent(text);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function TextBlock(props: { text: string; className?: string }) {
  const { text, className } = props;
  const paragraphs = splitDisplayParagraphs(text);
  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <div className={`${READONLY_BODY_CLASS_NAME} ${className ?? ""}`.trim()}>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 16)}`} className="mb-6 last:mb-0">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function getParagraphElements(surface: HTMLDivElement): HTMLElement[] {
  const richTextRoot = surface.querySelector('[contenteditable="true"]') as HTMLDivElement | null;
  const searchRoot = richTextRoot ?? surface;
  const candidates = Array.from(
    searchRoot.querySelectorAll<HTMLElement>('[data-slate-node="element"], p'),
  );

  return candidates.filter((node) => node.textContent?.trim());
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

function renderLoadingPreview(
  preview: Extract<ChapterEditorPreview, { mode: "loading" }>,
  previewContent: { before: string; after: string },
  surfaceRef: React.RefObject<HTMLDivElement | null>,
) {
  return (
    <div ref={surfaceRef} className={`space-y-4 rounded-2xl bg-muted/10 p-4 ${SURFACE_INNER_PADDING_CLASS_NAME}`}>
      <TextBlock text={previewContent.before} className="text-foreground" />

      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
          <div className="mb-2 text-xs font-medium text-amber-700">待改写原文</div>
          <TextBlock text={preview.originalText} className="text-amber-950" />
        </div>
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 p-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">AI 正在生成候选版本</div>
          <div className="space-y-2">
            <div className="h-4 w-11/12 rounded-full bg-muted/70" />
            <div className="h-4 w-full rounded-full bg-muted/60" />
            <div className="h-4 w-4/5 rounded-full bg-muted/50" />
          </div>
        </div>
      </div>

      <TextBlock text={previewContent.after} className="text-foreground" />
    </div>
  );
}

function renderBlockPreview(
  preview: Extract<ChapterEditorPreview, { mode: "block" }>,
  previewContent: { before: string; after: string },
  surfaceRef: React.RefObject<HTMLDivElement | null>,
) {
  return (
    <div ref={surfaceRef} className={`space-y-4 rounded-2xl bg-muted/10 p-4 ${SURFACE_INNER_PADDING_CLASS_NAME}`}>
      <TextBlock text={previewContent.before} className="text-foreground" />

      <div className="space-y-3">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-4">
          <div className="mb-2 text-xs font-medium text-rose-700">原文</div>
          <TextBlock text={preview.originalText} className="text-rose-950" />
        </div>
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4">
          <div className="mb-2 text-xs font-medium text-emerald-700">改写</div>
          <TextBlock text={preview.candidateText} className="text-emerald-950" />
        </div>
      </div>

      <TextBlock text={previewContent.after} className="text-foreground" />
    </div>
  );
}

export default function ChapterTextEditor(props: ChapterTextEditorProps) {
  const { value, readOnly = false, onChange, onSelectionChange, preview, focusRange = null } = props;
  const [editorSeed, setEditorSeed] = useState(0);
  const [internalText, setInternalText] = useState(() => normalizeChapterContent(value));
  const [paragraphMarkerOffsets, setParagraphMarkerOffsets] = useState<Array<{ index: number; top: number }>>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const isUserEditingRef = useRef(false);

  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin],
      value: toPlateValue(internalText),
    },
    [editorSeed],
  );

  useEffect(() => {
    const nextValue = normalizeChapterContent(value);
    if (nextValue === internalText) {
      return;
    }
    setInternalText(nextValue);
    setEditorSeed((current) => current + 1);
  }, [internalText, value]);

  useEffect(() => {
    if (preview || readOnly) {
      onSelectionChange(null, null);
    }
  }, [onSelectionChange, preview, readOnly]);

  const updateSelection = useCallback(() => {
    if (!editor || preview || readOnly) {
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

    const selectionRange = buildSelectionRangeFromValue(editor.children as Value, editor.selection as {
      anchor: { path: number[]; offset: number };
      focus: { path: number[]; offset: number };
    } | null);
    if (!selectionRange) {
      onSelectionChange(null, null);
      return;
    }

    const container = containerRef.current;
    const position = container ? buildToolbarPosition(container, range) : null;

    onSelectionChange(selectionRange, position);
  }, [editor, onSelectionChange, preview, readOnly]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = normalizeEditorText(toPlainText(normalizeValuePayload(payload)));
    if (!isUserEditingRef.current || nextText === internalText) {
      return;
    }
    setInternalText(nextText);
    onChange(nextText);
  }, [internalText, onChange]);

  const normalizedContent = useMemo(() => normalizeChapterContent(value), [value]);

  const previewContent = useMemo(() => {
    if (!preview) {
      return null;
    }
    return {
      before: normalizedContent.slice(0, preview.from),
      after: normalizedContent.slice(preview.to),
    };
  }, [normalizedContent, preview]);

  const highlightedParagraphRange = useMemo(
    () => (focusRange ? getParagraphIndicesForRange(normalizedContent, focusRange) : null),
    [focusRange, normalizedContent],
  );

  const helperText = preview?.mode === "inline"
    ? "当前正在显示细节标记 diff，适合确认具体删改。"
    : preview?.mode === "loading"
      ? "AI 正在基于选中内容生成候选版本，原文位置会持续保留。"
      : preview?.mode === "block"
        ? "当前正在显示段落 patch 对比，原文和改写会在正文原位置并排落成红绿块。"
        : readOnly
          ? "当前有待确认候选，正文暂时锁定，可在右侧切换候选或接受、拒绝。"
      : "可直接编辑正文，选中内容后可发起 AI 改写。";

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || preview) {
      return;
    }
    const paragraphNodes = getParagraphElements(surface);
    paragraphNodes.forEach((node) => {
      node.classList.remove("bg-sky-100/90", "ring-1", "ring-sky-200", "rounded-xl");
    });
    if (!focusRange) {
      return;
    }
    const paragraphIndices = getParagraphIndicesForRange(normalizedContent, focusRange);
    if (!paragraphIndices) {
      return;
    }
    for (let index = paragraphIndices.startIndex; index <= paragraphIndices.endIndex; index += 1) {
      const node = paragraphNodes[index];
      node?.classList.add("bg-sky-100/90", "ring-1", "ring-sky-200", "rounded-xl");
    }
    paragraphNodes[paragraphIndices.startIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [highlightedParagraphRange, preview]);

  const updateParagraphMarkers = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      setParagraphMarkerOffsets([]);
      return;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const paragraphNodes = getParagraphElements(surface);
    const nextOffsets = paragraphNodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        index,
        top: rect.top - surfaceRect.top + rect.height / 2,
      };
    });

    setParagraphMarkerOffsets((current) => {
      if (
        current.length === nextOffsets.length
        && current.every((item, index) => item.index === nextOffsets[index]?.index && Math.abs(item.top - nextOffsets[index]!.top) < 1)
      ) {
        return current;
      }
      return nextOffsets;
    });
  }, []);

  useLayoutEffect(() => {
    updateParagraphMarkers();

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateParagraphMarkers();
    });

    resizeObserver.observe(surface);
    getParagraphElements(surface).forEach((node) => resizeObserver.observe(node));

    return () => {
      resizeObserver.disconnect();
    };
  }, [editorSeed, normalizedContent, preview, readOnly, updateParagraphMarkers]);

  const paragraphMarkers = paragraphMarkerOffsets.length > 0 ? (
    <div className="pointer-events-none absolute inset-y-0 left-0 top-0 z-10 w-12">
      {paragraphMarkerOffsets.map((marker) => {
        const isHighlighted = highlightedParagraphRange
          ? marker.index >= highlightedParagraphRange.startIndex && marker.index <= highlightedParagraphRange.endIndex
          : false;
        return (
          <div
            key={`marker:${marker.index}`}
            className={`absolute left-0 flex w-12 justify-end pr-3 text-[11px] font-semibold ${
              isHighlighted ? "text-sky-700" : "text-muted-foreground"
            }`}
            style={{ top: `${marker.top}px`, transform: "translateY(-50%)" }}
          >
            P{marker.index + 1}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative flex h-full min-h-[540px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm xl:min-h-0">
      <div className="shrink-0 flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="text-sm font-medium text-foreground">正文</div>
        <div className="text-xs text-muted-foreground">{helperText}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="relative min-h-full">
          {preview?.mode === "inline" && previewContent ? (
            <div
              ref={surfaceRef}
              className={`${INLINE_PREVIEW_BODY_CLASS_NAME} ${SURFACE_INNER_PADDING_CLASS_NAME} min-h-full rounded-2xl bg-muted/15 p-4 text-foreground`}
            >
              {previewContent.before}
              {preview.diffChunks.map((chunk) => renderDiffChunk(chunk))}
              {previewContent.after}
            </div>
          ) : preview?.mode === "loading" && previewContent ? (
            renderLoadingPreview(preview, previewContent, surfaceRef)
          ) : preview?.mode === "block" && previewContent ? (
            renderBlockPreview(preview, previewContent, surfaceRef)
          ) : readOnly ? (
            <div
              ref={surfaceRef}
              className={`min-h-full rounded-2xl bg-muted/10 p-4 text-foreground ${SURFACE_INNER_PADDING_CLASS_NAME}`}
            >
              <TextBlock text={normalizedContent} />
            </div>
          ) : editor ? (
            <Plate editor={editor} onSelectionChange={updateSelection} onValueChange={handleValueChange}>
              <div ref={surfaceRef} className="min-h-full">
                <PlateContent
                  className={`${EDITOR_BODY_CLASS_NAME} ${SURFACE_INNER_PADDING_CLASS_NAME} min-h-full rounded-2xl bg-muted/10 p-4 outline-none [&_p]:text-foreground`}
                  onFocus={() => {
                    isUserEditingRef.current = true;
                  }}
                  onBlur={() => {
                    isUserEditingRef.current = false;
                  }}
                  onMouseUp={updateSelection}
                  onKeyUp={updateSelection}
                />
              </div>
            </Plate>
          ) : null}

          {paragraphMarkers}
        </div>
      </div>
    </div>
  );
}
