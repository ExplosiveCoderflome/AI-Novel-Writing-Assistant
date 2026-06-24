import { z } from "zod";

const evidenceItemSchema = z.object({
  label: z.string().trim().min(1).optional(),
  excerpt: z.string().trim().min(1).optional(),
  sourceLabel: z.string().trim().min(1).optional(),
  fieldKey: z.string().trim().min(1).optional(),
  fieldIndex: z.number().int().min(0).optional(),
  chapterIndex: z.number().int().min(0).optional(),
  excerptOffsetRange: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }).optional(),
}).passthrough();

export const bookAnalysisTimelineNodeSchema = z.object({
  label: z.string().trim().min(1),
  timeHint: z.string().trim().min(1).optional(),
  phase: z.string().trim().min(1).optional(),
  sourceRefs: z.array(z.string().trim().min(1)).optional(),
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

export const bookAnalysisChapterSplitOutputSchema = z.object({
  chapters: z.array(z.object({
    title: z.string().trim().min(1),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(0),
  }).passthrough()).default([]),
}).passthrough();

const bookAnalysisCharacterEvidenceSchema = evidenceItemSchema;

export const bookAnalysisCharacterGenerateOutputSchema = z.object({
  characters: z.array(z.object({
    name: z.string().trim().min(1),
    role: z.string().trim().min(1),
    profile: z.record(z.string(), z.unknown()).default({}),
    evidence: z.array(bookAnalysisCharacterEvidenceSchema).default([]),
    arcs: z.array(z.object({
      chapterIndex: z.number().int().min(0).optional(),
      stageLabel: z.string().trim().min(1),
      stateSnapshot: z.record(z.string(), z.unknown()).optional(),
      evidence: z.array(bookAnalysisCharacterEvidenceSchema).default([]),
    }).passthrough()).default([]),
    scenes: z.array(z.object({
      sceneLabel: z.string().trim().min(1),
      sceneType: z.string().trim().optional(),
      performance: z.record(z.string(), z.unknown()).optional(),
      evidence: z.array(bookAnalysisCharacterEvidenceSchema).default([]),
    }).passthrough()).default([]),
  }).passthrough()).default([]),
}).passthrough();
