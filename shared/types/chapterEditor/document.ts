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
