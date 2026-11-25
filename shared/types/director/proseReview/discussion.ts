import { z } from "zod";

/** Keep exact separators and indentation when replacing individual reviewed paragraphs. */
export function proseParagraphs(content: string) {
  const fields: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const parts = content.split(/(\r\n|\r|\n)/);
  const positions: { index: number; key: string; prefix: string; suffix: string }[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index];
    const text = line.trim();
    if (!text) continue;
    const key = String(positions.length + 1);
    const start = line.indexOf(text);
    fields[key] = text;
    labels[key] = `第 ${key} 段`;
    positions.push({ index, key, prefix: line.slice(0, start), suffix: line.slice(start + text.length) });
  }
  return {
    fields,
    labels,
    render(draft: Record<string, string>) {
      const result = [...parts];
      for (const { index, key, prefix, suffix } of positions)
        result[index] = prefix + (draft[key] ?? fields[key]) + suffix;
      return result.join("");
    },
  };
}

const value = z.string().min(1).max(12000);
const reason = z.string().trim().min(1).max(1200);
const suggestion = z.object({ field: z.string(), value, reason }).strict();
export const proseDraftSchema = z.record(z.string(), z.string());
export const proseChanges = z
  .array(suggestion.extend({ before: z.string() }))
  .min(1)
  .max(30);
export const proseReply = z
  .object({ replyText: z.string().trim().min(1).max(8000), changes: z.array(suggestion).max(30) })
  .strict();
export const proseDialogueOutput = z
  .object({
    replyText: proseReply.shape.replyText,
    changes: z
      .array(z.object({ paragraph: z.number().int().positive(), value: value.trim().min(1), reason }).strict())
      .max(30)
      .refine(
        (items) => new Set(items.map((item) => item.paragraph)).size === items.length,
        "每段只提供一项替换建议。",
      ),
  })
  .strict();

export { batchProseReviewSchema, type BatchProseReview } from "../revision.js";
