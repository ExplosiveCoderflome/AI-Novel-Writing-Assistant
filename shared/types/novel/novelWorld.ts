import { z } from "zod";

export const novelWorldSourceTypeSchema = z.enum(["imported", "generated", "manual"]);
export const novelWorldSyncDirectionSchema = z.enum(["push", "pull", "bidirectional", "none"]);
export const novelWorldSyncSectionSchema = z.enum(["profile", "rules", "factions", "forces", "locations", "relations"]);
export const worldAssetTypeSchema = z.enum([
  "map",
  "faction_diagram",
  "timeline",
  "character_network",
  "power_system_tree",
]);
export const worldAssetStatusSchema = z.enum(["placeholder", "draft", "ready", "archived"]);

export const worldMapDataSchema = z.object({
  regions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    summary: z.string().optional(),
    regionType: z.string().optional(),
    parentRegionId: z.string().nullable().optional(),
    factionId: z.string().nullable().optional(),
    storyRelevance: z.string().optional(),
  })).default([]),
  connections: z.array(z.object({
    id: z.string(),
    sourceRegionId: z.string(),
    targetRegionId: z.string(),
    connectionType: z.string(),
    summary: z.string().optional(),
  })).default([]),
  factionControlZones: z.array(z.object({
    factionId: z.string(),
    regionIds: z.array(z.string()).default([]),
    controlLevel: z.string().optional(),
  })).default([]),
  storyLocations: z.array(z.object({
    locationId: z.string(),
    chapterRange: z.string().optional(),
    storyUse: z.string().optional(),
  })).default([]),
  heatmap: z.array(z.object({
    regionId: z.string(),
    level: z.number().min(0).max(1),
    reason: z.string().optional(),
  })).optional(),
});

export const factionDiagramDataSchema = z.object({
  factions: z.array(z.object({
    id: z.string(),
    name: z.string(),
    summary: z.string().optional(),
    storyRelevance: z.string().optional(),
  })).default([]),
  relations: z.array(z.object({
    id: z.string(),
    sourceFactionId: z.string(),
    targetFactionId: z.string(),
    relation: z.string(),
    tension: z.string().optional(),
  })).default([]),
  powerBalance: z.array(z.object({
    factionId: z.string(),
    metric: z.string(),
    value: z.number(),
    note: z.string().optional(),
  })).default([]),
});

export const worldAssetSchema = z.object({
  id: z.string(),
  worldId: z.string().nullable().optional(),
  novelWorldId: z.string().nullable().optional(),
  assetType: worldAssetTypeSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  generationPrompt: z.string().nullable().optional(),
  renderData: z.unknown().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  version: z.number().int(),
  status: worldAssetStatusSchema.or(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const novelWorldAssetSummarySchema = z.object({
  id: z.string().nullable(),
  assetType: worldAssetTypeSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: worldAssetStatusSchema.or(z.string()),
  thumbnailUrl: z.string().nullable(),
  version: z.number().int().nullable(),
  updatedAt: z.string().nullable(),
  hasRenderData: z.boolean(),
});

export const novelWorldSyncRecordSummarySchema = z.object({
  id: z.string(),
  direction: z.enum(["push", "pull"]).or(z.string()),
  syncedSections: z.array(novelWorldSyncSectionSchema),
  diffSummary: z.string().nullable(),
  triggeredBy: z.string(),
  createdAt: z.string(),
});

export const novelWorldSummarySchema = z.object({
  id: z.string(),
  novelId: z.string(),
  sourceWorldId: z.string().nullable(),
  sourceType: novelWorldSourceTypeSchema.or(z.string()),
  title: z.string().nullable(),
  coverSummary: z.string().nullable(),
  syncEnabled: z.boolean(),
  syncDirection: novelWorldSyncDirectionSchema.or(z.string()),
  syncBaseVersion: z.number().int().nullable(),
  lastSyncedAt: z.string().nullable(),
  syncPendingChangeCount: z.number().int(),
  syncPendingSections: z.array(novelWorldSyncSectionSchema),
  syncPendingSummary: z.string().nullable(),
  hasStructuredData: z.boolean(),
  hasStorySlice: z.boolean(),
  storySliceBuiltAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const novelWorldHandbookSchema = z.object({
  title: z.string().nullable(),
  summary: z.string().nullable(),
  identity: z.string().nullable(),
  tone: z.string().nullable(),
  themes: z.array(z.string()),
  coreRules: z.array(z.object({
    name: z.string(),
    summary: z.string(),
    cost: z.string().nullable(),
    boundary: z.string().nullable(),
  })),
  factions: z.array(z.object({
    name: z.string(),
    position: z.string().nullable(),
    doctrine: z.string().nullable(),
  })),
  forces: z.array(z.object({
    name: z.string(),
    summary: z.string().nullable(),
    pressure: z.string().nullable(),
    narrativeRole: z.string().nullable(),
  })),
  locations: z.array(z.object({
    name: z.string(),
    summary: z.string().nullable(),
    narrativeFunction: z.string().nullable(),
    risk: z.string().nullable(),
  })),
  tensions: z.array(z.string()),
  generationGuidance: z.object({
    characterUses: z.array(z.string()),
    outlineUses: z.array(z.string()),
    chapterUses: z.array(z.string()),
    avoidUses: z.array(z.string()),
  }).optional(),
});

export const novelWorldViewSchema = z.object({
  hasNovelWorld: z.boolean(),
  novelWorld: novelWorldSummarySchema.nullable(),
  handbook: novelWorldHandbookSchema.nullable().optional(),
  assets: z.array(novelWorldAssetSummarySchema).default([]),
  syncHistory: z.array(novelWorldSyncRecordSummarySchema).default([]),
});

export const novelWorldImportInputSchema = z.object({
  worldId: z.string().trim().min(1),
  syncEnabled: z.boolean().optional(),
  syncDirection: novelWorldSyncDirectionSchema.optional(),
});

export const novelWorldGenerateInputSchema = z.object({
  saveToLibrary: z.boolean().optional(),
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const novelWorldSaveToLibraryInputSchema = z.object({
  syncEnabled: z.boolean().optional(),
});

export const novelWorldManualInputSchema = z.object({
  title: z.string().trim().max(80).optional(),
  coverSummary: z.string().trim().max(300).optional(),
});

export const novelWorldSyncDiffItemSchema = z.object({
  section: novelWorldSyncSectionSchema,
  label: z.string(),
  status: z.enum(["same", "changed", "local_only", "library_only"]),
  summary: z.string(),
});

export const novelWorldSyncDiffSchema = z.object({
  canSync: z.boolean(),
  reason: z.string().nullable(),
  novelWorldId: z.string().nullable(),
  sourceWorldId: z.string().nullable(),
  sourceWorldName: z.string().nullable(),
  differenceCount: z.number().int(),
  differences: z.array(novelWorldSyncDiffItemSchema),
});

export const novelWorldSyncInputSchema = z.object({
  direction: z.enum(["push", "pull", "none"]),
  sections: z.array(novelWorldSyncSectionSchema).optional(),
});

export type NovelWorldSourceType = z.infer<typeof novelWorldSourceTypeSchema>;
export type NovelWorldSyncDirection = z.infer<typeof novelWorldSyncDirectionSchema>;
export type NovelWorldSyncSection = z.infer<typeof novelWorldSyncSectionSchema>;
export type WorldAssetType = z.infer<typeof worldAssetTypeSchema>;
export type WorldAssetStatus = z.infer<typeof worldAssetStatusSchema>;
export type WorldMapData = z.infer<typeof worldMapDataSchema>;
export type FactionDiagramData = z.infer<typeof factionDiagramDataSchema>;
export type WorldAsset = z.infer<typeof worldAssetSchema>;
export type NovelWorldAssetSummary = z.infer<typeof novelWorldAssetSummarySchema>;
export type NovelWorldSyncRecordSummary = z.infer<typeof novelWorldSyncRecordSummarySchema>;
export type NovelWorldSummary = z.infer<typeof novelWorldSummarySchema>;
export type NovelWorldHandbook = z.infer<typeof novelWorldHandbookSchema>;
export type NovelWorldView = z.infer<typeof novelWorldViewSchema>;
export type NovelWorldImportInput = z.infer<typeof novelWorldImportInputSchema>;
export type NovelWorldGenerateInput = z.infer<typeof novelWorldGenerateInputSchema>;
export type NovelWorldSaveToLibraryInput = z.infer<typeof novelWorldSaveToLibraryInputSchema>;
export type NovelWorldManualInput = z.infer<typeof novelWorldManualInputSchema>;
export type NovelWorldSyncDiff = z.infer<typeof novelWorldSyncDiffSchema>;
export type NovelWorldSyncInput = z.infer<typeof novelWorldSyncInputSchema>;
