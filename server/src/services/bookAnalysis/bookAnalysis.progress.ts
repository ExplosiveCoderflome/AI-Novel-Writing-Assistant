import {
  LOADING_CACHE_PROGRESS,
  NOTES_PROGRESS_SHARE,
  SECTION_PROGRESS_SHARE,
} from "./bookAnalysis.config";

export function getLoadingCacheProgress(): number {
  return LOADING_CACHE_PROGRESS;
}

export function getCacheHitProgress(): number {
  return NOTES_PROGRESS_SHARE;
}

export function getNotesStageProgress(completed: number, total: number): number {
  if (total <= 0) {
    return NOTES_PROGRESS_SHARE;
  }
  return Number((NOTES_PROGRESS_SHARE * (completed / total)).toFixed(4));
}

export function getSectionStageProgress(completed: number, total: number): number {
  if (total <= 0) {
    return 1;
  }
  return Number((NOTES_PROGRESS_SHARE + SECTION_PROGRESS_SHARE * (completed / total)).toFixed(4));
}

export function formatCacheLookupLabel(): string {
  return "查找 source notes 缓存";
}

export function formatCacheHitLabel(segmentCount: number): string {
  return `片段缓存命中 · 共 ${segmentCount} 段`;
}

export function formatSegmentProgressLabel(index: number, total: number, label: string): string {
  return `片段 ${index}/${total} · ${label}`;
}

export function formatSectionProgressLabel(index: number, total: number, label: string): string {
  return `section ${index}/${total} · ${label}`;
}
