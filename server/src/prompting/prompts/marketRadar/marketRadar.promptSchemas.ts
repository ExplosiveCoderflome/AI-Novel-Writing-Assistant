import { z } from "zod";

export const marketSignalKindSchema = z.enum([
  "genre", "protagonist", "advantage", "opening", "relationship", "title_pattern", "opportunity", "crowding",
]);

export const marketSignalSchema = z.object({
  id: z.string().trim().min(1).max(48),
  kind: marketSignalKindSchema,
  label: z.string().trim().min(2).max(24),
  summary: z.string().trim().min(12).max(180),
  direction: z.enum(["current", "rising", "stable", "falling"]),
  heat: z.number().int().min(0).max(100),
  crowding: z.number().int().min(0).max(100),
  evidenceItemIds: z.array(z.string().trim().min(1)).min(1).max(12),
  recommended: z.boolean(),
});

export const marketPlatformDigestSchema = z.object({
  platformSummary: z.string().trim().min(20).max(500),
  signals: z.array(marketSignalSchema).min(5).max(18),
});

export const marketTrendReportSchema = z.object({
  summary: z.string().trim().min(30).max(800),
  signals: z.array(marketSignalSchema).min(8).max(28),
});

export const marketCreativeBriefSchema = z.object({
  summary: z.string().trim().min(30).max(400),
  promptBlock: z.string().trim().min(100).max(1800),
});
