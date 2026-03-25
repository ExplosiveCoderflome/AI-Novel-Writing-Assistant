import { z } from "zod";

const generatedVolumeSkeletonSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().optional().nullable(),
  mainPromise: z.string().trim().min(1),
  escalationMode: z.string().trim().min(1),
  protagonistChange: z.string().trim().min(1),
  climax: z.string().trim().min(1),
  nextVolumeHook: z.string().trim().min(1),
  resetPoint: z.string().trim().optional().nullable(),
  openPayoffs: z.array(z.string().trim().min(1)).default([]),
});

const generatedChapterListItemSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export function createBookVolumeSkeletonSchema(exactVolumeCount?: number) {
  return z.object({
    volumes: typeof exactVolumeCount === "number"
      ? z.array(generatedVolumeSkeletonSchema).length(exactVolumeCount)
      : z.array(generatedVolumeSkeletonSchema).min(1).max(12),
  });
}

export function createVolumeChapterListSchema(exactChapterCount?: number) {
  return z.object({
    chapters: typeof exactChapterCount === "number"
      ? z.array(generatedChapterListItemSchema).length(exactChapterCount)
      : z.array(generatedChapterListItemSchema).min(1).max(80),
  });
}

export function createChapterPurposeSchema() {
  return z.object({
    purpose: z.string().trim().min(1),
  });
}

export function createChapterBoundarySchema() {
  return z.object({
    conflictLevel: z.number().int().min(0).max(100),
    revealLevel: z.number().int().min(0).max(100),
    targetWordCount: z.number().int().min(200).max(20000),
    mustAvoid: z.string().trim().min(1),
    payoffRefs: z.array(z.string().trim().min(1)).default([]),
  });
}

export function createChapterTaskSheetSchema() {
  return z.object({
    taskSheet: z.string().trim().min(1),
  });
}
