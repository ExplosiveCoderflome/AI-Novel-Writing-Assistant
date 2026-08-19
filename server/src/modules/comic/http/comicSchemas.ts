import { z } from "zod";

export const assetIdParams = z.object({ assetId: z.string().trim().min(1) });
export const sceneIdParams = z.object({ sceneId: z.string().trim().min(1) });
export const idParams = z.object({ id: z.string().trim().min(1) });
export const episodeIdParams = z.object({ episodeId: z.string().trim().min(1) });
export const panelIdParams = z.object({ panelId: z.string().trim().min(1) });
export const charIdParams = z.object({ charId: z.string().trim().min(1) });
export const charSheetVersionParams = z.object({ charId: z.string().trim().min(1), version: z.coerce.number().int().min(1) });
export const factIdParams = z.object({ factId: z.string().trim().min(1) });

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceType: z.enum(["novel_import", "original", "text_import", "comic_import"]),
  sourceRef: z.string().trim().min(1).optional(),
  trackId: z.string().trim().max(40).optional(),
  inspiration: z.string().trim().max(4000).optional(),
  rawText: z.string().trim().max(200000).optional(),
  stylePreset: z.string().trim().max(1000).optional(),
});

export const styleUpdateSchema = z.object({
  style: z.string().trim().min(1).max(120),
});

export const presetUpdateSchema = z.object({
  format: z.string().trim().min(1).max(60).optional(),
  style: z.string().trim().max(120).optional(),
  promptKeywords: z.string().trim().max(400).optional(),
  imageSize: z.string().trim().max(20).optional(),
});
