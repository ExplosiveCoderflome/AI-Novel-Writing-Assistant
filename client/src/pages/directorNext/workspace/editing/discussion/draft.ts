import type { ReviewChange } from "@ai-novel/shared/types/director/review/fieldSuggestions";

export const reviewFieldKey = (id: string, field: string) => JSON.stringify([id, field]);

export function acceptReviewSuggestions<F extends string>(drafts: Record<string, string>, id: string, base: Record<string,string>, selected: ReviewChange<F>[]) {
  const next = {...drafts};
  for (const change of selected) {
    const key = reviewFieldKey(id, change.field);
    if ((drafts[key] ?? base[change.field]) === change.before) next[key] = change.value;
  }
  return next;
}
