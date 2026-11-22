import { z } from "zod";

export interface FieldSuggestion<F extends string> { field: F; value: string; reason: string }
export interface ReviewChange<F extends string> extends FieldSuggestion<F> { before: string }
export interface ReviewProposal<F extends string> { id: string; status: "proposed"; changes: ReviewChange<F>[] }

export function fieldSuggestionSchemas<const F extends readonly [string, ...string[]]>(fields: F) {
  const suggestion = z.object({
    field: z.enum(fields), value: z.string().trim().min(1).max(12000), reason: z.string().trim().min(1).max(1200),
  }).strict();
  const reply = z.object({
    replyText: z.string().trim().min(1).max(8000),
    changes: z.array(suggestion).max(fields.length).refine(items =>
      new Set(items.map(item => item.field)).size === items.length, "每个字段只能提出一项修改。"),
  }).strict();
  return { reply, changes: z.array(suggestion.extend({ before: z.string() })).min(1).max(fields.length) };
}
