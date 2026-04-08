import { z } from "zod";

const evidenceItemSchema = z.object({
  label: z.string().trim().min(1).optional(),
  excerpt: z.string().trim().min(1).optional(),
  sourceLabel: z.string().trim().min(1).optional(),
}).passthrough();

export const bookAnalysisSourceNoteOutputSchema = z.object({
  summary: z.string().trim().min(1),
  plotPoints: z.array(z.string().trim().min(1)).max(5).default([]),
  timelineEvents: z.array(z.string().trim().min(1)).max(5).default([]),
  characters: z.array(z.string().trim().min(1)).max(5).default([]),
  worldbuilding: z.array(z.string().trim().min(1)).max(5).default([]),
  themes: z.array(z.string().trim().min(1)).max(5).default([]),
  styleTechniques: z.array(z.string().trim().min(1)).max(5).default([]),
  marketHighlights: z.array(z.string().trim().min(1)).max(5).default([]),
  readerSignals: z.array(z.string().trim().min(1)).max(5).default([]),
  weaknessSignals: z.array(z.string().trim().min(1)).max(5).default([]),
  evidence: z.array(evidenceItemSchema).max(3).default([]),
}).passthrough();

export const bookAnalysisSectionOutputSchema = z.object({
  markdown: z.string().trim().min(1),
  structuredData: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(evidenceItemSchema).default([]),
}).passthrough();

export const bookAnalysisOptimizeDraftOutputSchema = z.object({
  optimizedDraft: z.string().trim().min(1),
}).passthrough();
