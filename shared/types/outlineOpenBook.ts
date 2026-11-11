import { z } from "zod";

export const outlineBookSettingsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  estimatedChapterCount: z.number().int().min(1).max(10000),
  defaultChapterLength: z.number().int().min(500).max(20000).default(3000),
  worldId: z.string().min(1).optional(),
  genreId: z.string().min(1).optional(),
});
export const outlineOpenBookInputSchema = z.object({
  revisionId: z.string().min(1),
  expectedProjectVersion: z.number().int().min(1),
  bookSettings: outlineBookSettingsSchema,
  volumeQuotas: z.record(z.string(), z.number().int().min(1)).default({}),
  allowOptimize: z.array(z.object({ nodeId: z.string().min(1), field: z.string().min(1) })).default([]),
});
export const outlineOpenBookConfirmSchema = outlineOpenBookInputSchema.extend({
  requestHash: z.string().min(1),
  idempotencyKey: z.string().min(1).max(200),
});
export type OutlineOpenBookInput = z.infer<typeof outlineOpenBookInputSchema>;
export type OutlineBookSettings = z.infer<typeof outlineBookSettingsSchema>;
export interface OutlineFieldRule {
  nodeId: string;
  field: string;
  mode: "preserve" | "fill_missing" | "hard_constraint" | "propose_change";
  value: unknown;
}
export interface OutlineBookPolicy { rules: OutlineFieldRule[] }
export interface OutlineVolumeSlot { volumeId: string; chapterQuota: number; from: number; to: number }
export interface OutlineBookMapping {
  runtimeVolumes?: OutlineVolumeSlot[];
  volumes: Array<{ nodeId: string; volumeId: string; chapterQuota: number; from: number; to: number }>;
  chapters: Array<{ nodeId: string; volumeId: string; planId: string; chapterId: string; chapterOrder: number }>;
  characters: Array<{ nodeId: string; characterId: string }>;
  payoffs: Array<{ nodeId: string; ledgerKey: string; ledgerItemId: string | null }>;
}
export interface OutlineBindingRef { bindingId: string; revisionId: string; sourceDocumentHash: string; policyVersion: number }
export interface OutlineOpenBookPreview {
  revisionId: string; revisionVersion: number; currentVersion: number;
  sourceDocumentHash: string; requestHash: string;
  settings: OutlineBookSettings;
  mapping: OutlineBookMapping;
  policy: OutlineBookPolicy;
  warnings: string[];
  counts: { volumes: number; chapters: number; characters: number; payoffs: number };
}
export interface OutlineBookBindingView extends OutlineBindingRef {
  projectId: string; novelId: string; title: string; revisionVersion: number; currentVersion: number;
  sourceRoute: string; mapping: OutlineBookMapping; policy: OutlineBookPolicy;
  setupState: { rag: "pending" | "queued"; error?: string };
}

export const outlineRetrySetupSchema = z.object({ expectedPolicyVersion: z.number().int().min(1), idempotencyKey: z.string().min(1).max(200) });
export type OutlineOpenBookResult = OutlineBookBindingView & { replayed: boolean };
