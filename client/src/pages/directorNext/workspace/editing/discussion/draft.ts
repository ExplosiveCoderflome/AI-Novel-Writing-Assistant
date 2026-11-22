import type { ReviewChange } from "@ai-novel/shared/types/director/review/fieldSuggestions";

export const reviewFieldKey = (id: string, field: string) => JSON.stringify([id, field]);

export function acceptReviewSuggestions<F extends string>(drafts: Record<string, string>, id: string, base: Record<string,string>, selected: ReviewChange<F>[]) {
  return applyReviewSuggestions(drafts, base, selected, field => reviewFieldKey(id, field));
}

export function applyReviewSuggestions<F extends string>(drafts: Record<string,string>, base: Record<string,string>,
  selected: ReviewChange<F>[], keyFor: (field:F)=>string = field=>field) {
  const next = {...drafts};
  for (const change of selected) {
    const key = keyFor(change.field);
    if ((drafts[key] ?? base[change.field]) === change.before) next[key] = change.value;
  }
  return next;
}
