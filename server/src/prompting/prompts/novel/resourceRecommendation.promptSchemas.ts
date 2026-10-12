import { z } from "zod";

function normalizeResourceSelectionId(value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : value;
}

const requiredResourceSelectionIdSchema = z.preprocess(
  normalizeResourceSelectionId,
  z.string().trim().min(1),
);

const optionalResourceSelectionIdSchema = z.preprocess(
  normalizeResourceSelectionId,
  z.string().trim().optional().nullable(),
);

export const novelCreateResourceRecommendationSchema = z.object({
  summary: z.string().trim().min(1),
  genreId: requiredResourceSelectionIdSchema,
  genreReason: z.string().trim().min(1),
  primaryStoryModeId: requiredResourceSelectionIdSchema,
  primaryStoryModeReason: z.string().trim().min(1),
  secondaryStoryModeId: optionalResourceSelectionIdSchema,
  secondaryStoryModeReason: z.string().trim().optional().nullable(),
  powerSystemMode: z.enum(["none", "soft", "ranked"]),
  powerSystemReason: z.string().trim().min(1),
  caution: z.string().trim().optional().nullable(),
});
