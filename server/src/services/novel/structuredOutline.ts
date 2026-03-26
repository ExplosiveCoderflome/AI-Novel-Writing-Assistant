export interface StructuredOutlineChapter {
  chapter: number;
  title: string;
  summary: string;
  key_events: string[];
  roles: string[];
}

export function stringifyStructuredOutline(chapters: StructuredOutlineChapter[]): string {
  return JSON.stringify(chapters, null, 2);
}

export function toOutlineChapterRows(chapters: StructuredOutlineChapter[]): Array<{ order: number; title: string; summary: string }> {
  return chapters.map((item) => ({
    order: item.chapter,
    title: item.title,
    summary: item.summary,
  }));
}
