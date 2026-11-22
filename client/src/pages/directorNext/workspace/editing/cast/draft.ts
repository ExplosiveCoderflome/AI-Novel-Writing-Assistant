import type {CastChange, CastDraft} from "@ai-novel/shared/types/director/castReview/discussion";

export const reviewFieldKey = (id: string, field: string) => JSON.stringify([id, field]);

export function acceptCastSuggestions(drafts: Record<string, string>, id: string, base: CastDraft, selected: CastChange[]) {
  const next = {...drafts};
  for (const change of selected) {
    const key = reviewFieldKey(id, change.field);
    if ((drafts[key] ?? base[change.field]) === change.before) next[key] = change.value;
  }
  return next;
}
