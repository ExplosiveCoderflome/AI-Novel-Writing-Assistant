export function formatMobileVolumeOptionLabel(input: {
  sortOrder: number;
  title?: string | null;
  chapterCount: number;
  refinedCount: number;
}) {
  const parts = [`第${input.sortOrder}卷`];
  const title = input.title?.trim();
  if (title) {
    parts.push(title);
  }
  parts.push(`${input.chapterCount}章`, `${input.refinedCount}章已细化`);
  return parts.join(" · ");
}
