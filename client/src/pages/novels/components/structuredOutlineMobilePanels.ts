export function formatMobileStructuredPanelSummary(input: {
  beatLabel?: string | null;
  visibleChapterCount: number;
  selectedChapterOrder?: number | null;
}): string {
  const parts = [input.beatLabel?.trim() || "全部节奏", `${input.visibleChapterCount}章`];
  if (typeof input.selectedChapterOrder === "number") {
    parts.push(`当前第${input.selectedChapterOrder}章`);
  }
  return parts.join(" · ");
}
