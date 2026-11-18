export interface ContinuationBudget {
  minAdditionalCharacters: number;
  targetAdditionalCharacters: number;
  maxAdditionalCharacters: number;
  maxOutputTokens: number;
}

/** Resource allowance only: narrative fulfillment remains an AI acceptance decision. */
export function buildContinuationBudget(
  currentCharacters: number,
  range: { targetWordCount: number | null; minWordCount: number | null; maxWordCount: number | null },
): ContinuationBudget | null {
  const { targetWordCount: target, minWordCount: min, maxWordCount: max } = range;
  if (!Number.isFinite(currentCharacters) || currentCharacters < 0
    || target == null || min == null || max == null
    || ![target, min, max].every(Number.isFinite) || min <= 0 || min > target || target > max
    || currentCharacters >= min) return null;
  const maxAdditionalCharacters = Math.floor(max - currentCharacters);
  return {
    minAdditionalCharacters: Math.ceil(min - currentCharacters),
    targetAdditionalCharacters: Math.ceil(target - currentCharacters),
    maxAdditionalCharacters,
    // This is a bounded estimate for one continuation call, not a tokenizer.
    // Actual characters are checked before the continuation is merged.
    maxOutputTokens: Math.max(256, Math.ceil(maxAdditionalCharacters * 1.25) + 64),
  };
}
