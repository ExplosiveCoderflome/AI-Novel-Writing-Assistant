import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Value } from "platejs";
import { ParagraphPlugin, Plate, PlateContent, usePlateEditor } from "platejs/react";
import type { ChapterEditorDiffChunk, ChapterEditorOperation } from "@ai-novel/shared/types/novel";
import type { HumanStyleIssueTag } from "@ai-novel/shared/types/styleEngine";
import { applySelectedChapterEditorDiff, groupChapterEditorDiffChanges } from "@ai-novel/shared/types/chapterEditor/document";
import type { ChapterEditorDiffChange } from "@ai-novel/shared/types/chapterEditor/document";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ChapterEditorLayoutMode, ChapterEditorSelectionRange } from "./chapterEditorTypes";
import { QuickHumanFeedbackBar } from "./assistant/QuickHumanFeedbackBar";
import { buildDomRangeForAbsoluteOffsets } from "./document/selectionHighlight";
import {
  CHAPTER_EDITOR_OPERATION_LABELS,
  buildSelectionRangeFromValue,
  computeParagraphSpan,
  extractGhostSuggestion,
  getCursorOffsetFromValue,
  getParagraphIndicesForRange,
  getPointFromAbsoluteOffset,
  isParagraphEndOffset,
  normalizeChapterContent,
  normalizeEditorText,
  normalizeValuePayload,
  toPlainText,
  toPlateValue,
} from "./document";

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
    selectedChangeIds: ReadonlySet<string>;
    originalText: string;
    candidateText: string;
  }
  | {
    mode: "block";
    from: number;
    to: number;
    diffChunks: ChapterEditorDiffChunk[];
    selectedChangeIds: ReadonlySet<string>;
    originalText: string;
    candidateText: string;
  };

interface ChapterTextEditorProps {
  value: string;
  readOnly?: boolean;
  onChange: (next: string) => void;
  onSelectionChange: (selection: ChapterEditorSelectionRange | null) => void;
  onCursorChange: (offset: number | null) => void;
  preview?: ChapterEditorPreview | null;
  focusRange?: Pick<ChapterEditorSelectionRange, "from" | "to"> | null;
  focusSource?: "selection" | "diagnostic";
  focusRequestKey?: number;
  /** Changes only when the underlying document is wholesale replaced (e.g. another chapter). */
  documentKey?: string;
  /** Runs a preset AI operation on the current selection from the floating quick bar. */
  onQuickOperation?: (operation: ChapterEditorOperation) => void;
  onQuickInstruction?: (instruction: string) => void;
  onQuickHumanFeedback?: (input: {
    issueTags: HumanStyleIssueTag[];
    feedbackNote?: string;
    mode: "rewrite" | "record";
  }) => void;
  recordingHumanFeedback?: boolean;
  /** Fetches a continuation candidate for ghost text; resolves null when none. */
  onGhostSuggest?: (content: string, offset: number) => Promise<string | null>;
  /** When true, ghost suggestions are not requested (busy / candidate open). */
  ghostSuspended?: boolean;
  /** Editor layout mode, controlled by the host shell; shown in the settings dialog. */
  layoutMode?: ChapterEditorLayoutMode;
  onLayoutModeChange?: (mode: ChapterEditorLayoutMode) => void;
  /** Host-page actions rendered beside the 正文 title (standard layout only). */
  headerExtra?: React.ReactNode;
  /** Text ranges with open diagnostic cards; their paragraphs get a gutter marker. */
  diagnosticRanges?: Array<{ from: number; to: number }>;
}

const QUICK_OPERATIONS: ChapterEditorOperation[] = ["polish", "expand", "compress", "emotion", "conflict"];
const QUICK_BAR_WIDTH = 520;
const QUICK_BAR_HEIGHT = 44;

const EDITOR_BODY_CLASS_NAME = "prose prose-sm max-w-none min-w-0 overflow-hidden break-words text-[length:var(--cte-font-size,15px)] leading-[var(--cte-line-height,2.13)] dark:prose-invert [&_code]:break-all [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words";
const INLINE_PREVIEW_BODY_CLASS_NAME = `${EDITOR_BODY_CLASS_NAME} whitespace-pre-wrap`;
const READONLY_BODY_CLASS_NAME = "min-w-0 break-words text-[length:var(--cte-font-size,15px)] leading-[var(--cte-line-height,2.13)]";

interface EditorTypography {
  fontSize: number;
  lineHeight: number;
}

const FONT_SIZE_STEPS = [15, 17, 19];
const LINE_HEIGHT_STEPS = [1.9, 2.13, 2.4];
const TYPOGRAPHY_STORAGE_KEY = "ai-novel:chapter-editor:typography:v1";
const GHOST_STORAGE_KEY = "ai-novel:chapter-editor:ghost:v1";
const GHOST_DEBOUNCE_MS = 900;

function loadTypography(): EditorTypography & { focusMode: boolean } {
  const fallback = { fontSize: 15, lineHeight: 2.13, focusMode: false };
  try {
    const raw = globalThis.localStorage?.getItem(TYPOGRAPHY_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<EditorTypography & { focusMode: boolean }>;
    return {
      fontSize: FONT_SIZE_STEPS.includes(parsed.fontSize ?? 0) ? parsed.fontSize! : fallback.fontSize,
      lineHeight: LINE_HEIGHT_STEPS.includes(parsed.lineHeight ?? 0) ? parsed.lineHeight! : fallback.lineHeight,
      focusMode: parsed.focusMode === true,
    };
  } catch {
    return fallback;
  }
}
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

function renderDiffChunk(chunk: ChapterEditorDiffChunk, change: ChapterEditorDiffChange | undefined, selected: boolean) {
  if (chunk.type === "equal") {
    return <span key={chunk.id}>{chunk.text}</span>;
  }
  if (chunk.type === "insert") {
    return (
      <span key={chunk.id} className={`rounded px-0.5 ${selected ? "bg-emerald-100/90 text-emerald-950" : "bg-muted/40 text-muted-foreground"}`} data-diff-change-id={change?.id}>
        {chunk.text}
      </span>
    );
  }
  return (
    <span key={chunk.id} className={`rounded px-0.5 line-through ${selected ? "bg-rose-100/80 text-rose-900" : "bg-muted/40 text-muted-foreground"}`} data-diff-change-id={change?.id}>
      {chunk.text}
    </span>
  );
}

function renderLoadingPreview(
  preview: Extract<ChapterEditorPreview, { mode: "loading" }>,
  previewContent: { before: string; after: string },
  surfaceRef: React.RefObject<HTMLDivElement | null>,
) {
  const isInsertion = preview.from === preview.to && preview.originalText.length === 0;
  return (
    <div ref={surfaceRef} className={`space-y-4 rounded-2xl bg-muted/10 p-4 ${SURFACE_INNER_PADDING_CLASS_NAME}`}>
      <TextBlock text={previewContent.before} className="text-foreground" />

      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4">
          <div className="mb-2 text-xs font-medium text-amber-700">{isInsertion ? "待插入位置" : "待改写原文"}</div>
          {isInsertion ? <div className="text-sm text-amber-950">光标所在位置将插入 AI 候选正文。</div> : <TextBlock text={preview.originalText} className="text-amber-950" />}
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
  const isInsertion = preview.from === preview.to && preview.originalText.length === 0;
  let selectedText = preview.candidateText;
  try {
    selectedText = applySelectedChapterEditorDiff(preview.originalText, preview.candidateText, preview.diffChunks, preview.selectedChangeIds);
  } catch {
    // The review panel surfaces the validation error; keep the full candidate visible as context.
  }
  return (
    <div ref={surfaceRef} className={`space-y-4 rounded-2xl bg-muted/10 p-4 ${SURFACE_INNER_PADDING_CLASS_NAME}`}>
      <TextBlock text={previewContent.before} className="text-foreground" />

      <div className="space-y-3">
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-4">
          <div className="mb-2 text-xs font-medium text-rose-700">{isInsertion ? "插入位置" : "原文"}</div>
          {isInsertion ? <div className="text-sm text-rose-950">这里没有需要删除的原文，候选会作为新内容插入。</div> : <TextBlock text={preview.originalText} className="text-rose-950" />}
        </div>
        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4">
          <div className="mb-2 text-xs font-medium text-emerald-700">本次将写回</div>
          {selectedText === preview.originalText || !selectedText.trim() ? (
            <div className="text-sm text-emerald-950/70">当前没有选择要写回的改动。</div>
          ) : (
            <TextBlock text={selectedText} className="text-emerald-950" />
          )}
        </div>
      </div>

      <TextBlock text={previewContent.after} className="text-foreground" />
    </div>
  );
}

export default function ChapterTextEditor(props: ChapterTextEditorProps) {
  const { value, readOnly = false, onChange, onSelectionChange, onCursorChange, preview, focusRange = null, focusSource = "selection", focusRequestKey = 0, documentKey, onQuickOperation, onQuickInstruction, onQuickHumanFeedback, recordingHumanFeedback = false, onGhostSuggest, ghostSuspended = false, layoutMode, onLayoutModeChange, headerExtra, diagnosticRanges } = props;
  const [initialText] = useState(() => normalizeChapterContent(value));
  const [internalText, setInternalText] = useState(initialText);
  const [typography, setTypography] = useState(loadTypography);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);
  const keyboardNavRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const [caretOffset, setCaretOffset] = useState<number | null>(null);
  const [ghostEnabled, setGhostEnabled] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(GHOST_STORAGE_KEY) === "on";
    } catch {
      return false;
    }
  });
  const [ghost, setGhost] = useState<{ offset: number; text: string; top: number; left: number; width: number; indent: number } | null>(null);
  const ghostRequestRef = useRef(false);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(GHOST_STORAGE_KEY, ghostEnabled ? "on" : "off");
    } catch {
      // Best-effort persistence.
    }
    if (!ghostEnabled) {
      setGhost(null);
    }
  }, [ghostEnabled]);


  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(typography));
    } catch {
      // Persistence is best-effort; the in-memory setting still applies.
    }
  }, [typography]);

  const cycleTypography = useCallback((key: "fontSize" | "lineHeight", direction: 1 | -1) => {
    setTypography((current) => {
      const steps = key === "fontSize" ? FONT_SIZE_STEPS : LINE_HEIGHT_STEPS;
      const index = steps.indexOf(current[key]);
      const nextIndex = Math.min(Math.max(index + direction, 0), steps.length - 1);
      return { ...current, [key]: steps[nextIndex] };
    });
  }, []);
  const [paragraphMarkerOffsets, setParagraphMarkerOffsets] = useState<Array<{ index: number; top: number }>>([]);
  const [quickBar, setQuickBar] = useState<{ top: number; left: number; maxWidth: number } | null>(null);
  const [quickPromptOpen, setQuickPromptOpen] = useState(false);

  useEffect(() => {
    if (!quickBar) {
      setQuickPromptOpen(false);
    }
  }, [quickBar]);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const isUserEditingRef = useRef(false);
  const editorFocusedRef = useRef(false);
  const documentKeyRef = useRef(documentKey);
  const internalTextRef = useRef(initialText);
  internalTextRef.current = internalText;

  const editor = usePlateEditor(
    {
      plugins: [ParagraphPlugin],
      value: toPlateValue(initialText),
    },
    [],
  );

  const findMatches = useMemo(() => {
    if (!findOpen || !findQuery) {
      return [] as number[];
    }
    const offsets: number[] = [];
    let cursor = 0;
    for (;;) {
      const found = internalText.indexOf(findQuery, cursor);
      if (found === -1) {
        break;
      }
      offsets.push(found);
      cursor = found + Math.max(findQuery.length, 1);
    }
    return offsets;
  }, [findOpen, findQuery, internalText]);

  useEffect(() => {
    if (findOpen) {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }
  }, [findOpen]);

  const navigateToMatch = useCallback((index: number) => {
    if (!editor || findMatches.length === 0 || !findQuery) {
      return;
    }
    const clamped = Math.min(Math.max(index, 0), findMatches.length - 1);
    setMatchIndex(clamped);
    const from = findMatches[clamped];
    const to = from + findQuery.length;
    const value = editor.children as Value;
    const anchor = getPointFromAbsoluteOffset(value, from);
    const focus = getPointFromAbsoluteOffset(value, to);
    if (!anchor || !focus) {
      return;
    }
    editor.tf.focus();
    editor.tf.select({ anchor, focus });
    const indices = getParagraphIndicesForRange(internalTextRef.current, { from, to });
    if (indices) {
      setActiveParagraphIndex(indices.startIndex);
    }
  }, [editor, findMatches, findQuery]);

  useEffect(() => {
    if (findOpen && findQuery && findMatches.length > 0) {
      navigateToMatch(0);
    }
    // Only re-anchor when the query itself changes; match list shifts from
    // replacements keep the current index (clamped by navigateToMatch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findQuery, findOpen]);

  const replaceCurrentMatch = useCallback(() => {
    if (findMatches.length === 0 || !findQuery) {
      return;
    }
    const from = findMatches[Math.min(matchIndex, findMatches.length - 1)];
    const nextText = internalText.slice(0, from) + replaceValue + internalText.slice(from + findQuery.length);
    onChange(nextText);
  }, [findMatches, findQuery, internalText, matchIndex, onChange, replaceValue]);

  const replaceAllMatches = useCallback(() => {
    if (findMatches.length === 0 || !findQuery) {
      return;
    }
    onChange(internalText.split(findQuery).join(replaceValue));
    setMatchIndex(0);
  }, [findMatches.length, findQuery, internalText, onChange, replaceValue]);

  // External content changes (AI write-back, snapshot load, saved-version
  // refresh) patch only the changed paragraph span inside one history batch,
  // so the editor instance, its undo history and the caret survive. A
  // documentKey change means a wholesale document switch: replace everything
  // and drop history so undo can never restore another chapter's text.
  const applyExternalText = useCallback((nextText: string, wholesale: boolean) => {
    if (!editor) {
      return;
    }
    if (wholesale) {
      editor.tf.setValue(toPlateValue(nextText));
      const history = (editor as unknown as { history?: { undos: unknown[]; redos: unknown[] } }).history;
      if (history) {
        history.undos = [];
        history.redos = [];
      }
      setInternalText(nextText);
      onSelectionChange(null);
      onCursorChange(null);
      setQuickBar(null);
      return;
    }
    const currentValue = editor.children as Value;
    const currentText = toPlainText(currentValue);
    if (currentText === nextText) {
      setInternalText(nextText);
      return;
    }
    const hadFocus = editorFocusedRef.current;
    const anchorOffset = hadFocus ? getCursorOffsetFromValue(currentValue, editor.selection?.anchor) : null;
    const focusOffset = hadFocus ? getCursorOffsetFromValue(currentValue, editor.selection?.focus) : null;
    const oldParagraphs = currentText ? currentText.split("\n\n") : [];
    const newParagraphs = nextText ? nextText.split("\n\n") : [];
    const span = computeParagraphSpan(oldParagraphs, newParagraphs);
    editor.tf.withNewBatch(() => {
      for (let index = span.oldEnd - 1; index >= span.start; index -= 1) {
        editor.tf.removeNodes({ at: [index] });
      }
      if (span.newEnd > span.start) {
        editor.tf.insertNodes(toPlateValue(newParagraphs.slice(span.start, span.newEnd).join("\n\n")), { at: [span.start] });
      }
      if (editor.children.length === 0) {
        editor.tf.insertNodes(toPlateValue(""), { at: [0] });
      }
    });
    if (hadFocus && anchorOffset !== null && focusOffset !== null) {
      const nextValue = editor.children as Value;
      const anchor = getPointFromAbsoluteOffset(nextValue, anchorOffset);
      const focus = getPointFromAbsoluteOffset(nextValue, focusOffset);
      if (anchor && focus) {
        editor.tf.select({ anchor, focus });
      }
    } else {
      onSelectionChange(null);
      onCursorChange(null);
    }
    setInternalText(nextText);
    setQuickBar(null);
  }, [editor, onCursorChange, onSelectionChange]);

  useEffect(() => {
    const nextText = normalizeChapterContent(value);
    const wholesale = documentKey !== undefined && documentKeyRef.current !== documentKey;
    if (wholesale) {
      documentKeyRef.current = documentKey;
    }
    if (!wholesale && nextText === internalTextRef.current) {
      return;
    }
    applyExternalText(nextText, wholesale);
  }, [applyExternalText, documentKey, value]);

  useEffect(() => {
    if (preview || readOnly) {
      onSelectionChange(null);
      onCursorChange(null);
      setQuickBar(null);
    }
  }, [onCursorChange, onSelectionChange, preview, readOnly]);

  // Floating quick bar placement: below the selection when the visible area
  // leaves room, above it otherwise, clamped inside the text column so it
  // never covers the selected lines themselves (the #178 positioning rule).
  const updateQuickBar = useCallback(() => {
    if (!onQuickOperation || preview || readOnly) {
      setQuickBar(null);
      return;
    }
    const wrap = wrapRef.current;
    const container = scrollContainerRef.current;
    const selectionObject = globalThis.window?.getSelection?.();
    if (!wrap || !container || !selectionObject || selectionObject.isCollapsed || selectionObject.rangeCount === 0) {
      setQuickBar(null);
      return;
    }
    const rect = selectionObject.getRangeAt(0).getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const spaceBelow = containerRect.bottom - rect.bottom;
    const top = spaceBelow >= QUICK_BAR_HEIGHT + 20
      ? rect.bottom - wrapRect.top + 8
      : rect.top - wrapRect.top - QUICK_BAR_HEIGHT - 8;
    // The bar sizes to its content and wraps inside the text column; in the
    // three-column layout the column can be narrower than the full button
    // row, so never let the bar stick out of the wrap.
    const barWidth = Math.min(QUICK_BAR_WIDTH, Math.max(wrapRect.width - 16, 120));
    const left = Math.min(
      Math.max(rect.left - wrapRect.left, 8),
      Math.max(wrapRect.width - barWidth - 8, 8),
    );
    setQuickBar({ top: Math.max(top, 8), left, maxWidth: barWidth });
  }, [onQuickOperation, preview, readOnly]);

  const updateSelection = useCallback(() => {
    if (!editor || preview || readOnly) {
      onSelectionChange(null);
      onCursorChange(null);
      setQuickBar(null);
      return;
    }

    const surface = surfaceRef.current;
    // Keep the last prose target while the author uses the AI controls.
    if (!surface || !surface.contains(surface.ownerDocument.activeElement)) {
      return;
    }
    const selectionObject = globalThis.window?.getSelection?.();
    if (!selectionObject || selectionObject.rangeCount === 0
      || !surface.contains(selectionObject.anchorNode) || !surface.contains(selectionObject.focusNode)) {
      setQuickBar(null);
      return;
    }
    if (selectionObject.isCollapsed) {
      const point = editor.selection?.anchor as { path: number[]; offset: number } | undefined;
      const offset = getCursorOffsetFromValue(editor.children as Value, point);
      onSelectionChange(null);
      onCursorChange(offset);
      setQuickBar(null);
      setCaretOffset(offset);
      if (offset !== null) {
        const indices = getParagraphIndicesForRange(internalTextRef.current, { from: offset, to: offset });
        setActiveParagraphIndex(indices ? indices.startIndex : null);
      }
      return;
    }

    const selectionRange = buildSelectionRangeFromValue(editor.children as Value, editor.selection as {
      anchor: { path: number[]; offset: number };
      focus: { path: number[]; offset: number };
    } | null);
    if (!selectionRange) {
      onSelectionChange(null);
      onCursorChange(null);
      setQuickBar(null);
      return;
    }

    onSelectionChange(selectionRange);
    onCursorChange(null);
    setCaretOffset(null);
    const rangeIndices = getParagraphIndicesForRange(internalTextRef.current, selectionRange);
    setActiveParagraphIndex(rangeIndices ? rangeIndices.startIndex : null);
    updateQuickBar();
  }, [editor, onCursorChange, onSelectionChange, preview, readOnly, updateQuickBar]);

  useEffect(() => {
    if (!quickBar) {
      return;
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickBar(null);
      }
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [quickBar]);

  // Ghost text: after the author pauses at a paragraph end, fetch one short
  // continuation suggestion and show it in grey at the caret. Any typing,
  // caret move, or suspension discards it; Tab accepts it as a normal edit.
  useEffect(() => {
    if (!ghostEnabled || ghostSuspended || !onGhostSuggest || readOnly || preview) {
      return;
    }
    if (caretOffset === null || !isParagraphEndOffset(internalText, caretOffset)) {
      return;
    }
    const snapshotText = internalText;
    const snapshotOffset = caretOffset;
    const timer = globalThis.setTimeout(() => {
      if (ghostRequestRef.current || !editorFocusedRef.current) {
        return;
      }
      if (internalTextRef.current !== snapshotText) {
        return;
      }
      ghostRequestRef.current = true;
      void onGhostSuggest(snapshotText, snapshotOffset)
        .then((candidate) => {
          ghostRequestRef.current = false;
          if (!candidate || internalTextRef.current !== snapshotText) {
            return;
          }
          const suggestion = extractGhostSuggestion(candidate);
          if (!suggestion) {
            return;
          }
          const wrap = wrapRef.current;
          const selectionObject = globalThis.window?.getSelection?.();
          if (!wrap || !selectionObject || selectionObject.rangeCount === 0 || !selectionObject.isCollapsed) {
            return;
          }
          const rect = selectionObject.getRangeAt(0).getBoundingClientRect();
          const wrapRect = wrap.getBoundingClientRect();
          // Lay the suggestion out as a paragraph-width block whose first
          // line is indented to the caret: a shrink-to-fit span at the
          // caret would collapse to a one-character-wide column whenever
          // the caret sits near the right edge.
          const anchorNode = selectionObject.anchorNode;
          const paragraphElement = anchorNode instanceof Element
            ? anchorNode.closest('[data-slate-node="element"]')
            : anchorNode?.parentElement?.closest('[data-slate-node="element"]');
          const paragraphRect = paragraphElement?.getBoundingClientRect();
          const blockLeft = paragraphRect ? paragraphRect.left - wrapRect.left : rect.left - wrapRect.left;
          const blockWidth = paragraphRect ? paragraphRect.width : 240;
          setGhost({
            offset: snapshotOffset,
            text: suggestion,
            top: rect.top - wrapRect.top,
            left: blockLeft,
            width: blockWidth,
            indent: Math.max(rect.left - (paragraphRect?.left ?? rect.left), 0),
          });
        })
        .catch(() => {
          ghostRequestRef.current = false;
        });
    }, GHOST_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [ghostEnabled, ghostSuspended, onGhostSuggest, readOnly, preview, caretOffset, internalText]);

  useEffect(() => {
    if (ghost && caretOffset !== ghost.offset) {
      setGhost(null);
    }
  }, [caretOffset, ghost]);

  const acceptGhost = useCallback(() => {
    if (!ghost) {
      return;
    }
    const text = internalTextRef.current;
    setGhost(null);
    onChange(text.slice(0, ghost.offset) + ghost.text + text.slice(ghost.offset));
  }, [ghost, onChange]);

  const handleValueChange = useCallback((payload: unknown) => {
    const nextText = normalizeEditorText(toPlainText(normalizeValuePayload(payload)));
    if (!isUserEditingRef.current || nextText === internalText) {
      return;
    }
    setGhost(null);
    setInternalText(nextText);
    onChange(nextText);
  }, [internalText, onChange]);

  const normalizedContent = useMemo(() => normalizeChapterContent(value), [value]);

  const previewChangeByChunkId = useMemo(() => {
    if (!preview || preview.mode === "loading") {
      return new Map<string, ChapterEditorDiffChange>();
    }
    return new Map(
      groupChapterEditorDiffChanges(preview.diffChunks)
        .flatMap((change) => change.chunkIds.map((chunkId) => [chunkId, change] as const)),
    );
  }, [preview]);

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

  const diagnosticParagraphs = useMemo(() => {
    const indices = new Set<number>();
    for (const range of diagnosticRanges ?? []) {
      const paragraphIndices = getParagraphIndicesForRange(normalizedContent, range);
      if (!paragraphIndices) {
        continue;
      }
      for (let index = paragraphIndices.startIndex; index <= paragraphIndices.endIndex; index += 1) {
        indices.add(index);
      }
    }
    return indices;
  }, [diagnosticRanges, normalizedContent]);

  const helperText = preview?.mode === "inline"
    ? "当前正在显示细节标记 diff，适合确认具体删改。"
    : preview?.mode === "loading"
      ? "AI 正在基于选中内容生成候选版本，原文位置会持续保留。"
      : preview?.mode === "block"
        ? "当前正在显示段落 patch 对比，原文和改写会在正文原位置并排落成红绿块。"
        : readOnly
          ? "当前有待确认候选，正文暂时锁定，可在右侧切换候选或接受、拒绝。"
      : "选中片段可用浮动工具条快速改写，也可在右侧 AI 操作区处理；点击定位光标可续写。";

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const registry = (globalThis as unknown as { CSS?: { highlights?: { set(name: string, h: unknown): void; delete(name: string): void } } }).CSS?.highlights;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!surface || preview) {
      registry?.delete("chapter-editor-selection");
      return;
    }
    const paragraphNodes = getParagraphElements(surface);
    paragraphNodes.forEach((node) => {
      node.classList.remove("bg-sky-100/90", "ring-1", "ring-sky-200", "rounded-xl");
    });
    registry?.delete("chapter-editor-selection");
    if (!focusRange) {
      return;
    }
    if (focusSource === "selection" && focusRequestKey === 0) {
      if (registry && HighlightCtor) {
        try {
          const exactRange = buildDomRangeForAbsoluteOffsets(paragraphNodes, splitDisplayParagraphs(normalizedContent), focusRange.from, focusRange.to);
          if (exactRange) {
            registry.set("chapter-editor-selection", new HighlightCtor(exactRange));
          }
        } catch {
          // Best-effort sub-paragraph visual highlight when focus moves to AI controls.
        }
      }
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
      behavior: focusRequestKey ? "instant" : "smooth",
    });
  }, [focusRange, focusRequestKey, focusSource, normalizedContent, preview]);

  // Focus mode: dim every paragraph except the one holding the caret, and
  // keep the caret paragraph centered while typing (typewriter scrolling).
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || preview) {
      return;
    }
    const paragraphNodes = getParagraphElements(surface);
    paragraphNodes.forEach((node, index) => {
      const dimmed = typography.focusMode && activeParagraphIndex !== null && index !== activeParagraphIndex;
      node.classList.toggle("opacity-40", dimmed);
      node.classList.toggle("transition-opacity", typography.focusMode);
    });
    if (typography.focusMode && keyboardNavRef.current && activeParagraphIndex !== null) {
      paragraphNodes[activeParagraphIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeParagraphIndex, internalText, preview, typography.focusMode]);

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

    // Only the surface needs observing: paragraph heights flow into the
    // surface's own size, so per-paragraph observers are redundant cost on
    // long chapters.
    const resizeObserver = new ResizeObserver(() => {
      updateParagraphMarkers();
    });

    resizeObserver.observe(surface);

    return () => {
      resizeObserver.disconnect();
    };
  }, [internalText, normalizedContent, preview, readOnly, updateParagraphMarkers]);

  const paragraphMarkers = paragraphMarkerOffsets.length > 0 ? (
    <div className="pointer-events-none absolute inset-y-0 left-0 top-0 z-10 w-12">
      {paragraphMarkerOffsets.map((marker) => {
        const isHighlighted = highlightedParagraphRange
          ? marker.index >= highlightedParagraphRange.startIndex && marker.index <= highlightedParagraphRange.endIndex
          : false;
        const hasDiagnostic = diagnosticParagraphs.has(marker.index);
        return (
          <div
            key={`marker:${marker.index}`}
            className={`absolute left-0 flex w-12 items-center justify-end pr-3 text-[11px] font-semibold ${
              isHighlighted ? "text-sky-700" : hasDiagnostic ? "text-amber-600" : "text-muted-foreground"
            }`}
            style={{ top: `${marker.top}px`, transform: "translateY(-50%)" }}
            title={hasDiagnostic ? "这一段有待处理的问题，可在左侧问题卡查看" : undefined}
          >
            {hasDiagnostic ? <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> : null}
            P{marker.index + 1}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      className="relative flex h-full min-h-[540px] flex-col overflow-hidden bg-background xl:min-h-0"
      style={{
        "--cte-font-size": `${typography.fontSize}px`,
        "--cte-line-height": String(typography.lineHeight),
      } as React.CSSProperties}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !readOnly && !preview) {
          event.preventDefault();
          setFindOpen(true);
        }
      }}
    >
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-sm font-medium text-foreground">正文</div>
          {headerExtra}
        </div>
        <div className="hidden min-w-0 flex-1 truncate text-right text-xs text-muted-foreground min-[1750px]:block">{helperText}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant={findOpen ? "default" : "ghost"}
            title="在本章内查找替换（Ctrl+F）"
            disabled={readOnly || Boolean(preview)}
            onClick={() => setFindOpen((current) => !current)}
          >
            查找
          </Button>
          <Button size="sm" variant="ghost" title="编辑器设置" onClick={() => setSettingsOpen(true)}>
            设置
          </Button>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑器设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {layoutMode && onLayoutModeChange ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">布局</div>
                  <div className="text-xs text-muted-foreground">宽正文收起左栏，沉浸只留正文</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {([["standard", "标准"], ["wide", "宽正文"], ["immersive", "沉浸"]] as const).map(([mode, label]) => (
                    <Button key={mode} size="sm" variant={layoutMode === mode ? "default" : "outline"} onClick={() => onLayoutModeChange(mode)}>
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">字号</div>
                <div className="text-xs text-muted-foreground">当前 {typography.fontSize}px</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" disabled={typography.fontSize <= FONT_SIZE_STEPS[0]} onClick={() => cycleTypography("fontSize", -1)}>A-</Button>
                <Button size="sm" variant="outline" disabled={typography.fontSize >= FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1]} onClick={() => cycleTypography("fontSize", 1)}>A+</Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">行距</div>
                <div className="text-xs text-muted-foreground">段落呼吸感</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {([["紧凑", 1.9], ["适中", 2.13], ["宽松", 2.4]] as const).map(([label, value]) => (
                  <Button
                    key={label}
                    size="sm"
                    variant={typography.lineHeight === value ? "default" : "outline"}
                    onClick={() => setTypography((current) => ({ ...current, lineHeight: value }))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">专注模式</div>
                <div className="text-xs text-muted-foreground">只突出正在编辑的段落</div>
              </div>
              <Button size="sm" variant={typography.focusMode ? "default" : "outline"} onClick={() => setTypography((current) => ({ ...current, focusMode: !current.focusMode }))}>
                {typography.focusMode ? "已开启" : "开启"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">续写建议</div>
                <div className="text-xs text-muted-foreground">停在段落末尾时给出灰字提示，Tab 接受</div>
              </div>
              <Button size="sm" variant={ghostEnabled ? "default" : "outline"} disabled={!onGhostSuggest} onClick={() => setGhostEnabled((current) => !current)}>
                {ghostEnabled ? "已开启" : "开启"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {findOpen && !readOnly && !preview ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2">
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                navigateToMatch(matchIndex + (event.shiftKey ? -1 : 1));
              }
              if (event.key === "Escape") {
                setFindOpen(false);
              }
            }}
            placeholder="查找本章文字"
            aria-label="查找本章文字"
            className="h-8 w-44 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
          <input
            value={replaceValue}
            onChange={(event) => setReplaceValue(event.target.value)}
            placeholder="替换为"
            aria-label="替换为"
            className="h-8 w-36 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
          <span className="text-xs text-muted-foreground">
            {findQuery ? (findMatches.length === 0 ? "无结果" : `${Math.min(matchIndex + 1, findMatches.length)}/${findMatches.length}`) : ""}
          </span>
          <Button size="sm" variant="ghost" disabled={findMatches.length === 0} onClick={() => navigateToMatch(matchIndex - 1)}>上一个</Button>
          <Button size="sm" variant="ghost" disabled={findMatches.length === 0} onClick={() => navigateToMatch(matchIndex + 1)}>下一个</Button>
          <Button size="sm" variant="outline" disabled={findMatches.length === 0} onClick={replaceCurrentMatch}>替换</Button>
          <Button size="sm" variant="outline" disabled={findMatches.length === 0} onClick={replaceAllMatches}>全部替换</Button>
          <Button size="sm" variant="ghost" onClick={() => setFindOpen(false)}>关闭</Button>
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto p-4"
        onScroll={() => setQuickBar(null)}
      >
        <div ref={wrapRef} className="relative min-h-full">
          {preview?.mode === "inline" && previewContent ? (
            <div
              ref={surfaceRef}
              className={`${INLINE_PREVIEW_BODY_CLASS_NAME} ${SURFACE_INNER_PADDING_CLASS_NAME} min-h-full rounded-2xl bg-muted/15 p-4 text-foreground`}
            >
              {previewContent.before}
              {preview.diffChunks.map((chunk) => renderDiffChunk(chunk, previewChangeByChunkId.get(chunk.id), preview.selectedChangeIds.has(previewChangeByChunkId.get(chunk.id)?.id ?? "")))}
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
                    editorFocusedRef.current = true;
                  }}
                  onBlur={() => {
                    isUserEditingRef.current = false;
                    editorFocusedRef.current = false;
                  }}
                  onMouseUp={() => {
                    keyboardNavRef.current = false;
                    updateSelection();
                  }}
                  onKeyUp={() => {
                    keyboardNavRef.current = true;
                    updateSelection();
                  }}
                  onKeyDown={(event) => {
                    if (!ghost) {
                      return;
                    }
                    if (event.key === "Tab") {
                      event.preventDefault();
                      acceptGhost();
                      return;
                    }
                    if (event.key !== "Shift" && event.key !== "Control" && event.key !== "Alt" && event.key !== "Meta") {
                      setGhost(null);
                    }
                  }}
                />
              </div>
            </Plate>
          ) : null}

          {paragraphMarkers}

          {ghost && !preview ? (
            <span
              aria-hidden
              className="pointer-events-none absolute z-10 rounded bg-background text-muted-foreground/60 shadow-sm"
              style={{
                top: ghost.top,
                left: ghost.left,
                width: ghost.width,
                textIndent: ghost.indent,
                fontSize: "var(--cte-font-size)",
                lineHeight: "var(--cte-line-height)",
                whiteSpace: "pre-wrap",
              }}
            >
              {ghost.text}
              <span className="ml-2 rounded border border-border/70 px-1 align-middle text-[10px] leading-none text-muted-foreground/80">Tab 接受</span>
            </span>
          ) : null}

          {quickBar && onQuickOperation && !preview && !readOnly ? (
            <div
              role="toolbar"
              aria-label="选段快捷 AI 操作"
              className="absolute z-20 rounded-2xl border border-border bg-background/95 p-1 shadow-md backdrop-blur"
              style={{ top: quickBar.top, left: quickBar.left, maxWidth: quickBar.maxWidth }}
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) {
                  event.preventDefault();
                }
              }}
            >
              <div className="flex flex-wrap items-center gap-1">
                {QUICK_OPERATIONS.map((operation) => (
                  <Button
                    key={operation}
                    size="sm"
                    variant={operation === "polish" ? "default" : "ghost"}
                    className="rounded-full"
                    onClick={() => {
                      setQuickBar(null);
                      setQuickPromptOpen(false);
                      onQuickOperation(operation);
                    }}
                  >
                    {operation === "polish" ? "AI 优化这段" : CHAPTER_EDITOR_OPERATION_LABELS[operation]}
                  </Button>
                ))}
                {(onQuickInstruction || onQuickHumanFeedback) ? (
                  <Button
                    size="sm"
                    variant={quickPromptOpen ? "default" : "ghost"}
                    className="rounded-full"
                    disabled={recordingHumanFeedback}
                    onClick={() => setQuickPromptOpen((current) => !current)}
                  >
                    AI 标识/改…
                  </Button>
                ) : null}
              </div>
              {quickPromptOpen && (onQuickInstruction || onQuickHumanFeedback) ? (
                <QuickHumanFeedbackBar
                  disabled={recordingHumanFeedback}
                  onInstruction={onQuickInstruction ? (instruction) => {
                    setQuickBar(null);
                    setQuickPromptOpen(false);
                    onQuickInstruction(instruction);
                  } : undefined}
                  onFeedback={onQuickHumanFeedback ? (payload) => {
                    setQuickBar(null);
                    setQuickPromptOpen(false);
                    onQuickHumanFeedback(payload);
                  } : undefined}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
