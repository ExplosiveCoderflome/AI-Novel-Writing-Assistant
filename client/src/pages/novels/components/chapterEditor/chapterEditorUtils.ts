import type { Descendant, Value } from "platejs";
import type { ChapterEditorOperation } from "@ai-novel/shared/types/novel";
import type {
  ChapterEditorRequestBuilderInput,
  ChapterEditorSelectionRange,
  SelectionToolbarPosition,
} from "./chapterEditorTypes";

export const CHAPTER_EDITOR_OPERATION_LABELS: Record<ChapterEditorOperation, string> = {
  polish: "优化表达",
  expand: "扩写",
  compress: "精简",
  emotion: "强化情绪",
  conflict: "强化冲突",
  custom: "自定义指令",
};

export function normalizeEditorText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function countEditorWords(text: string): number {
  return normalizeEditorText(text).replace(/\s+/g, "").length;
}

function normalizeParagraphText(text: string): string {
  return normalizeEditorText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParagraphs(text: string): string[] {
  const normalized = normalizeEditorText(text).trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => normalizeParagraphText(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

export function normalizeChapterContent(text: string): string {
  const paragraphs = splitParagraphs(text);
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : "";
}

export function toPlateValue(text: string): Value {
  const paragraphs = splitParagraphs(text).map((line) => ({
    type: "p",
    children: [{ text: line }],
  }));
  return paragraphs.length > 0 ? paragraphs : [{ type: "p", children: [{ text: "" }] }];
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

export function toPlainText(value: Value): string {
  const paragraphs = (value as Descendant[])
    .map((node) => nodeToText(node))
    .map((paragraph) => normalizeParagraphText(paragraph))
    .filter((paragraph) => paragraph.length > 0);

  return paragraphs.length > 0 ? paragraphs.join("\n\n") : "";
}

type EditorPointLike = {
  path: number[];
  offset: number;
};

type EditorSelectionLike = {
  anchor: EditorPointLike;
  focus: EditorPointLike;
};

function comparePaths(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return left.length - right.length;
}

function comparePoints(left: EditorPointLike, right: EditorPointLike): number {
  const pathDiff = comparePaths(left.path, right.path);
  if (pathDiff !== 0) {
    return pathDiff;
  }
  return left.offset - right.offset;
}

function getNodeTextLength(node: Descendant): number {
  return nodeToText(node).length;
}

function getOffsetWithinParagraph(node: Descendant, path: number[], depth: number, leafOffset: number): number | null {
  if ("text" in node && typeof node.text === "string") {
    return depth === path.length ? Math.max(0, Math.min(leafOffset, node.text.length)) : null;
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return null;
  }

  const childIndex = path[depth];
  if (typeof childIndex !== "number") {
    return null;
  }

  let total = 0;
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index] as Descendant;
    if (index < childIndex) {
      total += getNodeTextLength(child);
      continue;
    }
    if (index === childIndex) {
      const nestedOffset = getOffsetWithinParagraph(child, path, depth + 1, leafOffset);
      return nestedOffset === null ? null : total + nestedOffset;
    }
    break;
  }

  return null;
}

function getAbsoluteOffsetFromPoint(value: Value, point: EditorPointLike): number | null {
  const nodes = value as Descendant[];
  const paragraphIndex = point.path[0];
  if (typeof paragraphIndex !== "number" || paragraphIndex < 0 || paragraphIndex >= nodes.length) {
    return null;
  }

  let total = 0;
  for (let index = 0; index < paragraphIndex; index += 1) {
    total += normalizeParagraphText(nodeToText(nodes[index])).length + 2;
  }

  const paragraph = nodes[paragraphIndex];
  const paragraphOffset = getOffsetWithinParagraph(paragraph, point.path, 1, point.offset);
  if (paragraphOffset === null) {
    return null;
  }

  return total + paragraphOffset;
}

export function buildSelectionRangeFromValue(
  value: Value,
  selection: EditorSelectionLike | null | undefined,
): ChapterEditorSelectionRange | null {
  if (!selection) {
    return null;
  }

  const start = comparePoints(selection.anchor, selection.focus) <= 0 ? selection.anchor : selection.focus;
  const end = start === selection.anchor ? selection.focus : selection.anchor;

  const from = getAbsoluteOffsetFromPoint(value, start);
  const to = getAbsoluteOffsetFromPoint(value, end);
  const content = toPlainText(value);
  if (from === null || to === null || to <= from || to > content.length) {
    return null;
  }

  const text = content.slice(from, to);
  if (!text.trim()) {
    return null;
  }

  return {
    from,
    to,
    text,
  };
}

export function normalizeValuePayload(payload: unknown): Value {
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

export function buildToolbarPosition(container: HTMLElement, range: Range): SelectionToolbarPosition | null {
  const containerRect = container.getBoundingClientRect();
  const rangeRect = range.getBoundingClientRect();
  if (!rangeRect.width && !rangeRect.height) {
    return null;
  }

  const TOOLBAR_WIDTH = 320;
  const TOOLBAR_HEIGHT = 116;
  const EDGE_PADDING = 12;
  const VERTICAL_GAP = 10;
  const preferredLeft = rangeRect.left - containerRect.left + rangeRect.width / 2 - TOOLBAR_WIDTH / 2;
  const maxLeft = Math.max(EDGE_PADDING, containerRect.width - TOOLBAR_WIDTH - EDGE_PADDING);
  const left = Math.max(EDGE_PADDING, Math.min(preferredLeft, maxLeft));

  const topAbove = rangeRect.top - containerRect.top - TOOLBAR_HEIGHT - VERTICAL_GAP;
  const topBelow = rangeRect.bottom - containerRect.top + VERTICAL_GAP;
  const maxTop = Math.max(EDGE_PADDING, containerRect.height - TOOLBAR_HEIGHT - EDGE_PADDING);
  const preferredTop = topAbove >= EDGE_PADDING ? topAbove : topBelow;

  return {
    top: Math.max(EDGE_PADDING, Math.min(preferredTop, maxTop)),
    left,
  };
}

type ParagraphWindow = {
  beforeParagraphs: string[];
  afterParagraphs: string[];
};

export function getParagraphWindow(content: string, selection: ChapterEditorSelectionRange): ParagraphWindow {
  const paragraphs = splitParagraphs(content);
  const paragraphRanges: Array<{ text: string; start: number; end: number }> = [];
  let cursor = 0;

  for (const text of paragraphs) {
    const start = cursor;
    const end = start + text.length;
    paragraphRanges.push({
      text,
      start,
      end,
    });
    cursor = end + 2;
  }

  if (paragraphRanges.length === 0) {
    return { beforeParagraphs: [], afterParagraphs: [] };
  }

  const startIndex = paragraphRanges.findIndex((paragraph) => selection.from >= paragraph.start && selection.from <= paragraph.end);
  const endIndex = paragraphRanges.findIndex((paragraph) => selection.to >= paragraph.start && selection.to <= paragraph.end);
  const fallbackStartIndex = paragraphRanges.findIndex((paragraph) => paragraph.end >= selection.from);
  const resolvedStart = startIndex >= 0 ? startIndex : fallbackStartIndex >= 0 ? fallbackStartIndex : 0;
  const resolvedEnd = endIndex >= 0 ? endIndex : resolvedStart;

  return {
    beforeParagraphs: paragraphRanges.slice(Math.max(0, resolvedStart - 3), resolvedStart).map((paragraph) => paragraph.text),
    afterParagraphs: paragraphRanges.slice(resolvedEnd + 1, resolvedEnd + 3).map((paragraph) => paragraph.text),
  };
}

export function applyCandidateToContent(content: string, selection: ChapterEditorSelectionRange, replacement: string): string {
  const normalized = normalizeEditorText(content);
  return `${normalized.slice(0, selection.from)}${replacement}${normalized.slice(selection.to)}`;
}

export function getParagraphIndicesForRange(content: string, selection: Pick<ChapterEditorSelectionRange, "from" | "to">) {
  const paragraphs = splitParagraphs(content);
  const paragraphRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const text of paragraphs) {
    const start = cursor;
    const end = start + text.length;
    paragraphRanges.push({ start, end });
    cursor = end + 2;
  }

  if (paragraphRanges.length === 0) {
    return null;
  }

  const startIndex = paragraphRanges.findIndex((paragraph) => selection.from >= paragraph.start && selection.from <= paragraph.end);
  const endIndex = paragraphRanges.findIndex((paragraph) => selection.to >= paragraph.start && selection.to <= paragraph.end);
  const resolvedStart = startIndex >= 0 ? startIndex : paragraphRanges.findIndex((paragraph) => paragraph.end >= selection.from);
  const resolvedEnd = endIndex >= 0 ? endIndex : resolvedStart;
  if (resolvedStart < 0 || resolvedEnd < 0) {
    return null;
  }

  return {
    startIndex: resolvedStart,
    endIndex: resolvedEnd,
  };
}

export function buildAiRevisionRequest(input: ChapterEditorRequestBuilderInput) {
  const contentSnapshot = normalizeChapterContent(input.content);
  const selection = input.scope === "selection" ? input.selection ?? null : null;
  return {
    source: input.source,
    scope: input.scope,
    presetOperation: input.presetOperation,
    instruction: input.instruction?.trim() || undefined,
    contentSnapshot,
    selection: selection
      ? {
        from: selection.from,
        to: selection.to,
        text: selection.text,
      }
      : undefined,
    context: selection ? getParagraphWindow(contentSnapshot, selection) : undefined,
    constraints: {
      keepFacts: true,
      keepPov: true,
      noUnauthorizedSetting: true,
      preserveCoreInfo: true,
    },
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
  };
}

export function getSaveStatusLabel(status: "idle" | "saving" | "saved" | "error", isDirty: boolean): string {
  if (status === "saving") {
    return "保存中";
  }
  if (status === "saved") {
    return "已保存";
  }
  if (status === "error") {
    return "保存失败";
  }
  return isDirty ? "待保存" : "已同步";
}
