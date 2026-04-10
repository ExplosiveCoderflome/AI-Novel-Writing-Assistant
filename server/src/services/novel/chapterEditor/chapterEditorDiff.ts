import type { ChapterEditorDiffChunk } from "@ai-novel/shared/types/novel";

type DiffToken = {
  key: string;
  text: string;
};

function tokenize(text: string): DiffToken[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const parts = normalized.match(/[\u4e00-\u9fff]|[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_\u4e00-\u9fff]/g) ?? [];
  return parts.map((part, index) => ({
    key: `${index}:${part}`,
    text: part,
  }));
}

function pushChunk(chunks: ChapterEditorDiffChunk[], type: ChapterEditorDiffChunk["type"], text: string): void {
  if (!text) {
    return;
  }
  const last = chunks[chunks.length - 1];
  if (last && last.type === type) {
    last.text += text;
    return;
  }
  chunks.push({
    id: `chunk-${chunks.length + 1}`,
    type,
    text,
  });
}

export function buildChapterEditorDiffChunks(original: string, rewritten: string): ChapterEditorDiffChunk[] {
  const source = tokenize(original);
  const target = tokenize(rewritten);
  const sourceLength = source.length;
  const targetLength = target.length;
  const lcs: number[][] = Array.from({ length: sourceLength + 1 }, () => Array<number>(targetLength + 1).fill(0));

  for (let sourceIndex = sourceLength - 1; sourceIndex >= 0; sourceIndex -= 1) {
    for (let targetIndex = targetLength - 1; targetIndex >= 0; targetIndex -= 1) {
      if (source[sourceIndex].text === target[targetIndex].text) {
        lcs[sourceIndex][targetIndex] = lcs[sourceIndex + 1][targetIndex + 1] + 1;
      } else {
        lcs[sourceIndex][targetIndex] = Math.max(
          lcs[sourceIndex + 1][targetIndex],
          lcs[sourceIndex][targetIndex + 1],
        );
      }
    }
  }

  const chunks: ChapterEditorDiffChunk[] = [];
  let sourceIndex = 0;
  let targetIndex = 0;

  while (sourceIndex < sourceLength && targetIndex < targetLength) {
    if (source[sourceIndex].text === target[targetIndex].text) {
      pushChunk(chunks, "equal", source[sourceIndex].text);
      sourceIndex += 1;
      targetIndex += 1;
      continue;
    }
    if (lcs[sourceIndex + 1][targetIndex] >= lcs[sourceIndex][targetIndex + 1]) {
      pushChunk(chunks, "delete", source[sourceIndex].text);
      sourceIndex += 1;
      continue;
    }
    pushChunk(chunks, "insert", target[targetIndex].text);
    targetIndex += 1;
  }

  while (sourceIndex < sourceLength) {
    pushChunk(chunks, "delete", source[sourceIndex].text);
    sourceIndex += 1;
  }

  while (targetIndex < targetLength) {
    pushChunk(chunks, "insert", target[targetIndex].text);
    targetIndex += 1;
  }

  return chunks;
}
