import { z } from "zod";
import { storyModeProfileSchema } from "../../../services/storyMode/storyModeProfile";

export const marketSignalKindSchema = z.enum([
  "genre", "protagonist", "advantage", "opening", "relationship", "title_pattern", "opportunity", "crowding",
]);

export const marketSignalSchema = z.object({
  id: z.string().trim().min(1).max(48),
  kind: marketSignalKindSchema,
  label: z.string().trim().min(2).max(24),
  summary: z.string().trim().min(12).max(120),
  direction: z.enum(["current", "rising", "stable", "falling"]),
  heat: z.number().int().min(0).max(100),
  crowding: z.number().int().min(0).max(100),
  evidenceItemIds: z.array(z.string().trim().min(1)).min(1).max(12),
  recommended: z.boolean(),
});

export const marketPlatformDigestSchema = z.object({
  platformSummary: z.string().trim().min(20).max(320),
  signals: z.array(marketSignalSchema).min(5).max(10),
});

const marketFoundationAssetBaseSchema = z.object({
  existingId: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(2).max(32),
  description: z.string().trim().min(12).max(240),
  template: z.string().trim().min(12).max(600),
  reason: z.string().trim().min(12).max(240),
  evidenceItemIds: z.array(z.string().trim().min(1)).min(1).max(12),
});

export const marketProductionFoundationDraftSchema = z.object({
  genre: marketFoundationAssetBaseSchema,
  primaryStoryMode: marketFoundationAssetBaseSchema.extend({
    profile: storyModeProfileSchema,
  }),
  secondaryStoryMode: marketFoundationAssetBaseSchema.extend({
    profile: storyModeProfileSchema,
  }).nullable(),
}).superRefine((value, context) => {
  if (
    value.secondaryStoryMode?.existingId
    && value.secondaryStoryMode.existingId === value.primaryStoryMode.existingId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["secondaryStoryMode", "existingId"],
      message: "主推进模式和辅助推进模式不能引用同一个资源。",
    });
  }
});

export type MarketProductionFoundationDraft = z.infer<typeof marketProductionFoundationDraftSchema>;

export const marketTrendReportSchema = z.object({
  summary: z.string().trim().min(30).max(500),
  signals: z.array(marketSignalSchema).min(8).max(12),
  productionFoundation: marketProductionFoundationDraftSchema,
});

export const marketCreativeBriefSchema = z.object({
  summary: z.string().trim().min(30).max(400),
  promptBlock: z.string().trim().min(100).max(1800),
});
