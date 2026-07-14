export const runtimeChapterSelect = {
  id: true,
  title: true,
  order: true,
  content: true,
  expectation: true,
  targetWordCount: true,
  conflictLevel: true,
  revealLevel: true,
  mustAvoid: true,
  taskSheet: true,
  sceneCards: true,
  hook: true,
} as const;

export function extractChapterOpening(content: string, maxLength: number): string {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function extractChapterTail(content: string | null | undefined, maxLength = 520): string {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(Math.max(0, normalized.length - maxLength));
}
