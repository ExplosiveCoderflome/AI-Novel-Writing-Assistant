/** First unwritten gap, bounded by the frozen book target and the existing batch size. */
export function nextProseBatchRange(
  rows: readonly { order: number; content: string | null }[],
  target: number,
  singleChapter = false,
) {
  const written = new Set(rows.filter((row) => row.content?.trim()).map((row) => row.order));
  let from = 1;
  while (from <= target && written.has(from)) from++;
  if (from > target) return null;
  let to = from;
  while (!singleChapter && to < Math.min(target, from + 2) && !written.has(to + 1)) to++;
  return { from, to };
}
