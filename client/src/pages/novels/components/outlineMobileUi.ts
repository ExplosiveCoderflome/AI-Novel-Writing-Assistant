export function formatMobileOutlineVolumeOptionLabel(input: {
  sortOrder: number;
  title?: string | null;
  planningModeLabel?: string | null;
  chapterCount: number;
}): string {
  const parts = [`第${input.sortOrder}卷`];
  const title = input.title?.trim();
  if (title) {
    parts.push(title);
  }
  const planningModeLabel = input.planningModeLabel?.trim();
  if (planningModeLabel) {
    parts.push(planningModeLabel);
  }
  parts.push(input.chapterCount > 0 ? `${input.chapterCount}章` : "未拆章");
  return parts.join(" · ");
}
