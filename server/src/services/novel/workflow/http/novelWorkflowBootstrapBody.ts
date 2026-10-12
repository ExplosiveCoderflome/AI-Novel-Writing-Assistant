import { z } from "zod";

export const novelWorkflowBootstrapBodySchema = z.object({
  workflowTaskId: z.string().trim().optional(),
  novelId: z.string().trim().optional(),
  lane: z.enum(["manual_create", "auto_director"]),
  title: z.string().trim().optional(),
  seedPayload: z.record(z.string(), z.unknown()).optional(),
  directorState: z.record(z.string(), z.unknown()).optional(),
});

export type NovelWorkflowBootstrapBody = Omit<
  z.infer<typeof novelWorkflowBootstrapBodySchema>,
  "seedPayload" | "directorState"
> & {
  directorState?: Record<string, unknown>;
};

export function parseNovelWorkflowBootstrapBody(input: unknown): NovelWorkflowBootstrapBody {
  const { seedPayload, directorState, ...bootstrapInput } = novelWorkflowBootstrapBodySchema.parse(input);
  return {
    ...bootstrapInput,
    directorState: directorState ?? seedPayload,
  };
}
