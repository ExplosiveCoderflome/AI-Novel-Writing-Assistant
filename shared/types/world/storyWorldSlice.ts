import { z } from "zod";

export const storyWorldSliceBuilderModeSchema = z.enum([
  "story_macro",
  "outline",
  "structured_outline",
  "bible",
  "beats",
  "runtime",
  "manual_refresh",
]);

export const storyWorldSliceRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  whyItMatters: z.string(),
});

export const storyWorldSliceForceSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  roleInStory: z.string(),
  pressure: z.string(),
});

export const storyWorldSliceLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  storyUse: z.string(),
  risk: z.string(),
});

export const storyWorldSliceElementSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.string(),
  summary: z.string(),
});

export const storyWorldSliceMetaSchema = z.object({
  schemaVersion: z.number().int().min(1),
  builtAt: z.string(),
  sourceWorldUpdatedAt: z.string(),
  storyInputDigest: z.string(),
  builtFromStructuredData: z.boolean(),
  builderMode: storyWorldSliceBuilderModeSchema,
});

export const storyWorldSliceSchema = z.object({
  storyId: z.string(),
  worldId: z.string(),
  coreWorldFrame: z.string(),
  appliedRules: z.array(storyWorldSliceRuleSchema),
  activeForces: z.array(storyWorldSliceForceSchema),
  activeLocations: z.array(storyWorldSliceLocationSchema),
  activeElements: z.array(storyWorldSliceElementSchema),
  conflictCandidates: z.array(z.string()),
  pressureSources: z.array(z.string()),
  mysterySources: z.array(z.string()),
  suggestedStoryAxes: z.array(z.string()),
  recommendedEntryPoints: z.array(z.string()),
  forbiddenCombinations: z.array(z.string()),
  storyScopeBoundary: z.string(),
  metadata: storyWorldSliceMetaSchema,
});

export const storyWorldSliceOverridesSchema = z.object({
  primaryLocationId: z.string().trim().min(1).nullable().optional(),
  requiredForceIds: z.array(z.string().trim().min(1)).max(8).optional(),
  requiredLocationIds: z.array(z.string().trim().min(1)).max(8).optional(),
  requiredRuleIds: z.array(z.string().trim().min(1)).max(8).optional(),
  scopeNote: z.string().trim().max(400).nullable().optional(),
});

export const storyWorldSliceOptionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
});

export const storyWorldSliceViewSchema = z.object({
  hasWorld: z.boolean(),
  worldId: z.string().nullable(),
  worldName: z.string().nullable(),
  slice: storyWorldSliceSchema.nullable(),
  overrides: storyWorldSliceOverridesSchema,
  availableRules: z.array(storyWorldSliceOptionItemSchema),
  availableForces: z.array(storyWorldSliceOptionItemSchema),
  availableLocations: z.array(storyWorldSliceOptionItemSchema),
  storyInputSource: z.string().nullable(),
  isStale: z.boolean(),
});

export type StoryWorldSliceBuilderMode = z.infer<typeof storyWorldSliceBuilderModeSchema>;
export type StoryWorldSliceRule = z.infer<typeof storyWorldSliceRuleSchema>;
export type StoryWorldSliceForce = z.infer<typeof storyWorldSliceForceSchema>;
export type StoryWorldSliceLocation = z.infer<typeof storyWorldSliceLocationSchema>;
export type StoryWorldSliceElement = z.infer<typeof storyWorldSliceElementSchema>;
export type StoryWorldSliceMeta = z.infer<typeof storyWorldSliceMetaSchema>;
export type StoryWorldSlice = z.infer<typeof storyWorldSliceSchema>;
export type StoryWorldSliceOverrides = z.infer<typeof storyWorldSliceOverridesSchema>;
export type StoryWorldSliceOptionItem = z.infer<typeof storyWorldSliceOptionItemSchema>;
export type StoryWorldSliceView = z.infer<typeof storyWorldSliceViewSchema>;
