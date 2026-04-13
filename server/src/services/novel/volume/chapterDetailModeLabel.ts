import type { ChapterDetailMode } from "./volumeModels";

export function formatChapterDetailModeLabel(detailMode: ChapterDetailMode): string {
  if (detailMode === "purpose") {
    return "章节目标";
  }
  if (detailMode === "boundary") {
    return "执行边界";
  }
  return "任务单";
}
