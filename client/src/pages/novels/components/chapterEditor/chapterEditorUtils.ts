import type { Descendant, Value } from "platejs";
import type { ChapterEditorOperation, StoryPlan, StoryStateSnapshot } from "@ai-novel/shared/types/novel";
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

export function toPlateValue(text: string): Value {
  const normalized = normalizeEditorText(text);
  const lines = normalized.split("\n");
  const paragraphs = lines.map((line) => ({
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
  return (value as Descendant[]).map((node) => nodeToText(node)).join("\n");
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
  return {
    top: rangeRect.top - containerRect.top - 44,
    left: Math.max(12, Math.min(rangeRect.left - containerRect.left, containerRect.width - 220)),
  };
}

type ParagraphWindow = {
  beforeParagraphs: string[];
  afterParagraphs: string[];
};

export function getParagraphWindow(content: string, selection: ChapterEditorSelectionRange): ParagraphWindow {
  const normalized = normalizeEditorText(content);
  const paragraphs: Array<{ text: string; start: number; end: number }> = [];
  const matcher = /[^\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(normalized)) !== null) {
    paragraphs.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (paragraphs.length === 0) {
    return { beforeParagraphs: [], afterParagraphs: [] };
  }

  const startIndex = paragraphs.findIndex((paragraph) => selection.from >= paragraph.start && selection.from <= paragraph.end);
  const endIndex = paragraphs.findIndex((paragraph) => selection.to >= paragraph.start && selection.to <= paragraph.end);
  const resolvedStart = startIndex >= 0 ? startIndex : Math.max(0, paragraphs.findIndex((paragraph) => paragraph.end >= selection.from));
  const resolvedEnd = endIndex >= 0 ? endIndex : resolvedStart;

  return {
    beforeParagraphs: paragraphs.slice(Math.max(0, resolvedStart - 3), resolvedStart).map((paragraph) => paragraph.text),
    afterParagraphs: paragraphs.slice(resolvedEnd + 1, resolvedEnd + 3).map((paragraph) => paragraph.text),
  };
}

export function applyCandidateToContent(content: string, selection: ChapterEditorSelectionRange, replacement: string): string {
  const normalized = normalizeEditorText(content);
  return `${normalized.slice(0, selection.from)}${replacement}${normalized.slice(selection.to)}`;
}

export function buildCharacterStateSummary(snapshot?: StoryStateSnapshot | null): string | null {
  if (!snapshot || snapshot.characterStates.length === 0) {
    return null;
  }
  return snapshot.characterStates
    .slice(0, 6)
    .map((state) => {
      const parts = [
        state.summary?.trim(),
        state.currentGoal?.trim(),
        state.emotion?.trim(),
      ].filter(Boolean);
      return parts.length > 0 ? `- ${parts.join(" / ")}` : null;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

export function buildGoalSummary(chapterPlan?: StoryPlan | null, fallback?: string | null): string | null {
  return chapterPlan?.objective?.trim() || fallback?.trim() || null;
}

export function buildChapterSummary(fallbackSummary?: string | null, content?: string | null): string | null {
  const explicit = fallbackSummary?.trim();
  if (explicit) {
    return explicit;
  }
  const snippet = normalizeEditorText(content ?? "").trim().slice(0, 180);
  return snippet || null;
}

export function buildRewritePreviewRequest(input: ChapterEditorRequestBuilderInput) {
  const contextWindow = getParagraphWindow(input.content, input.selection);
  return {
    operation: input.operation,
    customInstruction: input.customInstruction?.trim() || undefined,
    targetRange: {
      from: input.selection.from,
      to: input.selection.to,
      text: input.selection.text,
    },
    context: contextWindow,
    chapterContext: {
      goalSummary: input.goalSummary?.trim() || undefined,
      chapterSummary: input.chapterSummary?.trim() || undefined,
      styleSummary: input.styleSummary?.trim() || undefined,
      characterStateSummary: input.characterStateSummary?.trim() || undefined,
      worldConstraintSummary: input.worldConstraintSummary?.trim() || undefined,
    },
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
