import { z } from "zod";

export const genreTreeDraftNodeSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    // children 会在 sanitize 阶段进一步递归归一化
    children: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type GenreTreeDraftNode = z.infer<typeof genreTreeDraftNodeSchema>;
