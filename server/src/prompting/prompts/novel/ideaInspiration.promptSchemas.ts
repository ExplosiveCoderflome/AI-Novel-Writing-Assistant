import { z } from "zod";

export const directorIdeaInspirationSchema = z.object({
  ideas: z.array(z.object({
    angle: z.string().trim().min(1),
    text: z.string().trim().min(20).max(180),
    tags: z.array(z.string().trim().min(1).max(12)).min(1).max(4),
  })).length(5),
});
