import { DEFAULT_BOOK_ANALYSIS_BUDGET_TOKENS } from "@ai-novel/shared/types/bookAnalysis";

function readInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  return Math.max(min, Math.min(max, normalized));
}

export const NOTES_PROGRESS_SHARE = 0.45;
export const SECTION_PROGRESS_SHARE = 0.55;
export const LOADING_CACHE_PROGRESS = 0.02;

export function getBookAnalysisMaxConcurrentTasks(): number {
  return readInt(process.env.BOOK_ANALYSIS_MAX_CONCURRENT_TASKS, 2, 1, 8);
}

export function getBookAnalysisNotesConcurrency(): number {
  return readInt(process.env.BOOK_ANALYSIS_NOTES_CONCURRENCY, 2, 1, 8);
}

export function getBookAnalysisSectionConcurrency(): number {
  return readInt(process.env.BOOK_ANALYSIS_SECTION_CONCURRENCY, 2, 1, 8);
}

export function getBookAnalysisAppearanceScanConcurrency(): number {
  return readInt(process.env.BOOK_ANALYSIS_APPEARANCE_SCAN_CONCURRENCY, 2, 1, 8);
}

export function getBookAnalysisAppearanceChapterConcurrency(): number {
  return readInt(process.env.BOOK_ANALYSIS_APPEARANCE_CHAPTER_CONCURRENCY, 6, 1, 8);
}

export function getBookAnalysisDefaultBudgetTokens(): number {
  return readInt(process.env.BOOK_ANALYSIS_BUDGET_TOKENS, DEFAULT_BOOK_ANALYSIS_BUDGET_TOKENS, 1_000, 10_000_000);
}

export function getBookAnalysisCacheSegmentVersion(): number {
  return readInt(process.env.BOOK_ANALYSIS_CACHE_SEGMENT_VERSION, 1, 1, 1000);
}
