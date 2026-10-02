import { z } from "zod";
import { directorIssueDecisionSchema } from "@ai-novel/shared/types/directorIssue";

export const pipelineDirectorSnapshotSchema = z.object({
  runId: z.string().trim().min(1),
  decisions: z.array(directorIssueDecisionSchema.extend({chapterOrder: z.number().int().positive().optional()})),
  resolvedDecisionCount: z.number().int().nonnegative().optional(),
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
