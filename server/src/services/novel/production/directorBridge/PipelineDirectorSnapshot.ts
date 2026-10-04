import { z } from "zod";
import { directorIssueDecisionSchema } from "@ai-novel/shared/types/directorIssue";

export const pipelineDirectorSnapshotSchema = z.object({
  runId: z.string().trim().min(1),
  decisions: z.array(directorIssueDecisionSchema.extend({chapterOrder: z.number().int().positive().optional()})),
  resolvedDecisionCount: z.number().int().nonnegative().optional(),
  chapterUsage: z.array(z.object({
    chapterId:z.string().trim().min(1), chapterOrder:z.number().int().positive(),
    startJobTokens:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalTokens:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    endJobTokens:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  }).refine(row => row.endJobTokens === undefined
    || row.endJobTokens - row.startJobTokens === row.totalTokens))
    .refine(rows=>new Set(rows.map(row=>row.chapterId)).size === rows.length && new Set(rows.map(row=>row.chapterOrder)).size === rows.length).optional(),
}).refine(value => (value.resolvedDecisionCount ?? 0) <= value.decisions.length);
export type PipelineDirectorSnapshot = z.infer<typeof pipelineDirectorSnapshotSchema>;
export class InvalidPipelineDirectorSnapshotError extends Error {
  constructor() {super("invalid director pipeline snapshot"); this.name = "InvalidPipelineDirectorSnapshotError";}
}
export function parsePipelineDirectorSnapshot(value: unknown): PipelineDirectorSnapshot | undefined {
  if (value === undefined) return undefined;
  const parsed = pipelineDirectorSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new InvalidPipelineDirectorSnapshotError();
  return parsed.data;
}
