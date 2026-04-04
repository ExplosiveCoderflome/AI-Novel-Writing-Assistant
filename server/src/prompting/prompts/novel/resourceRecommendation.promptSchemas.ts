import { z } from "zod";

export const novelCreateResourceRecommendationSchema = z.object({
  summary: z.string().trim().min(1),
  genreId: z.string().trim().min(1),
  genreReason: z.string().trim().min(1),
  primaryStoryModeId: z.string().trim().min(1),
  primaryStoryModeReason: z.string().trim().min(1),
  secondaryStoryModeId: z.string().trim().optional().nullable(),
  secondaryStoryModeReason: z.string().trim().optional().nullable(),
  caution: z.string().trim().optional().nullable(),
});
