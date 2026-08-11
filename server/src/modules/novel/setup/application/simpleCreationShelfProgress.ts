interface SimpleCreationChapterFact {
  id?: string;
  order: number;
  content?: string | null;
}

export interface SimpleCreationRemainingRange {
  startOrder: number;
  endOrder: number;
  totalChapterCount: number;
  savedChapterCount: number;
  remainingChapterCount: number;
  nextChapterId: string | null;
}

export function resolveSimpleCreationRemainingRange(input: {
  chapters: SimpleCreationChapterFact[];
  estimatedChapterCount?: number | null;
}): SimpleCreationRemainingRange | null {
  const maxChapterOrder = input.chapters.reduce(
    (maximum, chapter) => Math.max(maximum, Math.round(chapter.order)),
    0,
  );
  const totalChapterCount = Math.max(
    maxChapterOrder,
    Math.round(input.estimatedChapterCount ?? 0),
  );
  if (totalChapterCount <= 0) return null;

  const savedOrders = new Set(
    input.chapters
      .filter((chapter) => chapter.content?.trim())
      .map((chapter) => Math.round(chapter.order)),
  );
  const startOrder = Array.from(
    { length: totalChapterCount },
    (_item, index) => index + 1,
  ).find((order) => !savedOrders.has(order));
  if (!startOrder) return null;

  return {
    startOrder,
    endOrder: totalChapterCount,
    totalChapterCount,
    savedChapterCount: savedOrders.size,
    remainingChapterCount: totalChapterCount - savedOrders.size,
    nextChapterId: input.chapters.find((chapter) => chapter.order === startOrder)?.id ?? null,
  };
}
