export const STRUCTURED_CHAPTER_BOUNDS = {
  MIN_WORD_COUNT: 200,
  MAX_WORD_COUNT: 20000,
  DEFAULT_WORD_COUNT: 3000,
  MIN_PERCENTAGE: 0,
  MAX_PERCENTAGE: 100,
} as const;

export function clampScore(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(STRUCTURED_CHAPTER_BOUNDS.MIN_PERCENTAGE, Math.min(STRUCTURED_CHAPTER_BOUNDS.MAX_PERCENTAGE, Math.round(value)));
}

export function clampWordCount(value: unknown, fallback = STRUCTURED_CHAPTER_BOUNDS.DEFAULT_WORD_COUNT): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(STRUCTURED_CHAPTER_BOUNDS.MIN_WORD_COUNT, Math.min(STRUCTURED_CHAPTER_BOUNDS.MAX_WORD_COUNT, Math.round(value)));
}
