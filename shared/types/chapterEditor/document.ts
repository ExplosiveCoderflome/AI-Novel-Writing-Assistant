import type { ChapterEditorDiffChunk } from "../novel";

/** Editor coordinates are UTF-16 offsets in this exact text, never a trimmed copy. */
export function normalizeChapterText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n");
}

export function chapterParagraphs(text: string | null | undefined) {
  const normalized = normalizeChapterText(text);
  let cursor = 0;
  return normalized.split("\n\n").map((text, index) => {
    const from = cursor;
    cursor += text.length + 2;
    return { index: index + 1, text, from, to: from + text.length };
  });
}

export function replaceChapterSelection(
  content: string,
  selection: { from: number; to: number; text: string },
  replacement: string,
): string {
  const text = normalizeChapterText(content);
  if (!Number.isInteger(selection.from) || !Number.isInteger(selection.to)
    || selection.from < 0 || selection.to <= selection.from || selection.to > text.length
    || text.slice(selection.from, selection.to) !== selection.text) {
    throw new Error("正文片段已变化，请重新选中内容并生成修改建议。");
  }
  return text.slice(0, selection.from) + normalizeChapterText(replacement) + text.slice(selection.to);
}

export function insertChapterContinuation(content: string, offset: number, insertion: string): string {
  const text = normalizeChapterText(content);
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    throw new Error("正文光标位置已变化，请重新定位光标并生成续写建议。");
  }
  return text.slice(0, offset) + normalizeChapterText(insertion) + text.slice(offset);
}

export interface ChapterEditorDiffChange {
  id: string;
  kind: "insert" | "delete" | "replace";
  from: number;
  to: number;
  originalText: string;
  candidateText: string;
  chunkIds: string[];
}

/**
 * Adjacent insert/delete chunks are one replacement, so accepting a rewrite
 * never leaves duplicated source text behind.
 */
export function groupChapterEditorDiffChanges(chunks: readonly ChapterEditorDiffChunk[]): ChapterEditorDiffChange[] {
  const changes: ChapterEditorDiffChange[] = [];
  let cursor = 0;
  let pending: ChapterEditorDiffChunk[] = [];
  let pendingFrom = 0;
  const flush = () => {
    if (!pending.length) return;
    const originalText = pending.filter((chunk) => chunk.type === "delete").map((chunk) => chunk.text).join("");
    const candidateText = pending.filter((chunk) => chunk.type === "insert").map((chunk) => chunk.text).join("");
    changes.push({
      id: `change-${changes.length + 1}`,
      kind: originalText && candidateText ? "replace" : originalText ? "delete" : "insert",
      from: pendingFrom,
      to: cursor,
      originalText,
      candidateText,
      chunkIds: pending.map((chunk) => chunk.id),
    });
    pending = [];
  };
  for (const chunk of chunks) {
    if (chunk.type === "equal") {
      flush();
      cursor += chunk.text.length;
      continue;
    }
    if (!pending.length) pendingFrom = cursor;
    pending.push(chunk);
    if (chunk.type === "delete") cursor += chunk.text.length;
  }
  flush();
  return changes;
}

export function applySelectedChapterEditorDiff(
  originalText: string,
  candidateText: string,
  chunks: readonly ChapterEditorDiffChunk[],
  selectedChangeIds: ReadonlySet<string>,
): string {
  if (chunks.some((chunk) => !["equal", "insert", "delete"].includes(chunk.type))
    || chunks.filter((chunk) => chunk.type !== "insert").map((chunk) => chunk.text).join("") !== originalText
    || chunks.filter((chunk) => chunk.type !== "delete").map((chunk) => chunk.text).join("") !== candidateText) {
    throw new Error("候选与原文的对比不完整，请重新生成后再采纳。");
  }
  const changes = groupChapterEditorDiffChanges(chunks);
  if ([...selectedChangeIds].some((id) => !changes.some((change) => change.id === id))) {
    throw new Error("候选选择已变化，请重新选择要采纳的修改。");
  }
  const changesByChunkId = new Map(changes.flatMap((change) => change.chunkIds.map((chunkId) => [chunkId, change] as const)));
  const renderedChanges = new Set<string>();
  return chunks.map((chunk) => {
    if (chunk.type === "equal") return chunk.text;
    const change = changesByChunkId.get(chunk.id);
    if (!change || renderedChanges.has(change.id)) return "";
    renderedChanges.add(change.id);
    return selectedChangeIds.has(change.id) ? change.candidateText : change.originalText;
  }).join("");
}
