export const PROJECTION_SOURCE_TYPES = ["volume_projection", "cast_option_projection", "rebuild_projection"];
export const MANUAL_SOURCE_TYPE = "manual_override";
export const CHAPTER_EXTRACT_SOURCE_TYPE = "chapter_draft_extract";

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function sourcePriority(sourceType: string): number {
  switch (sourceType) {
    case MANUAL_SOURCE_TYPE:
      return 4;
    case CHAPTER_EXTRACT_SOURCE_TYPE:
      return 3;
    case "cast_option_projection":
      return 2;
    case "volume_projection":
    case "rebuild_projection":
      return 1;
    default:
      return 0;
  }
}

export function compareDynamicRows(
  left: { sourceType: string; chapterOrder?: number | null; updatedAt: string },
  right: { sourceType: string; chapterOrder?: number | null; updatedAt: string },
): number {
  const byPriority = sourcePriority(right.sourceType) - sourcePriority(left.sourceType);
  if (byPriority !== 0) {
    return byPriority;
  }
  const byChapterOrder = (right.chapterOrder ?? -1) - (left.chapterOrder ?? -1);
  if (byChapterOrder !== 0) {
    return byChapterOrder;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}
