import { z } from "zod";
import type { BookAnalysisSectionKey } from "./bookAnalysis";

export const CREATIVE_CARRYOVER_CONTRACT_SCHEMA_VERSION = 1 as const;

export const creativeCarryoverModeSchema = z.enum(["continuation", "adaptation"]);

export const creativeCarryoverSectionKeySchema = z.enum([
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
]);

export const creativeCarryoverBasisItemSchema = z.object({
  sectionKey: creativeCarryoverSectionKeySchema,
  fieldKeys: z.array(z.string().trim().min(1)).max(12).default([]),
  summary: z.string().trim().min(1).max(240),
});

export const creativeCarryoverOpeningChapterSchema = z.object({
  chapterNumber: z.number().int().min(1).max(3),
  direction: z.string().trim().min(1).max(280),
});

export const creativeCarryoverContinuationFocusSchema = z.object({
  finalCharacterStates: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  unfinishedThreads: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
});

export const creativeCarryoverAdaptationFocusSchema = z.object({
  hooks: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  conflictLoops: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  payoffRhythm: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  conversionPlan: z.string().trim().min(1).max(400),
});

/** LLM structured draft before source metadata is attached. */
export const creativeCarryoverContractDraftSchema = z.object({
  sourceTraits: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  bookRealization: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  openingChapters: z.array(creativeCarryoverOpeningChapterSchema).length(3),
  basis: z.array(creativeCarryoverBasisItemSchema).min(1).max(12),
  continuationFocus: creativeCarryoverContinuationFocusSchema.nullable().optional(),
  adaptationFocus: creativeCarryoverAdaptationFocusSchema.nullable().optional(),
});

export const creativeCarryoverContractSchema = creativeCarryoverContractDraftSchema.extend({
  schemaVersion: z.literal(CREATIVE_CARRYOVER_CONTRACT_SCHEMA_VERSION),
  mode: creativeCarryoverModeSchema,
  bookAnalysisId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  documentVersionId: z.string().trim().min(1),
  documentVersionNumber: z.number().int().min(1),
  documentTitle: z.string().trim().min(1).max(200).optional(),
  usedSectionKeys: z.array(creativeCarryoverSectionKeySchema).min(1).max(8),
  generatedAt: z.string().trim().min(1),
  adopted: z.boolean().optional(),
});

export type CreativeCarryoverMode = z.infer<typeof creativeCarryoverModeSchema>;
export type CreativeCarryoverContractDraft = z.infer<typeof creativeCarryoverContractDraftSchema>;
export type CreativeCarryoverContract = z.infer<typeof creativeCarryoverContractSchema>;
export type CreativeCarryoverBasisItem = z.infer<typeof creativeCarryoverBasisItemSchema>;
export type CreativeCarryoverContinuationFocus = z.infer<typeof creativeCarryoverContinuationFocusSchema>;
export type CreativeCarryoverAdaptationFocus = z.infer<typeof creativeCarryoverAdaptationFocusSchema>;

export const REQUIRED_SECTIONS_BY_CARRYOVER_MODE: Readonly<Record<CreativeCarryoverMode, readonly BookAnalysisSectionKey[]>> = {
  continuation: ["character_system", "plot_structure"],
  adaptation: ["plot_structure", "style_technique", "market_highlights"],
};

export const OPTIONAL_SECTIONS_BY_CARRYOVER_MODE: Readonly<Record<CreativeCarryoverMode, readonly BookAnalysisSectionKey[]>> = {
  continuation: ["timeline", "overview", "worldbuilding", "themes", "style_technique", "market_highlights"],
  adaptation: ["overview", "themes", "timeline", "character_system", "worldbuilding"],
};

export function assertCreativeCarryoverFocusForMode(
  mode: CreativeCarryoverMode,
  draft: Pick<CreativeCarryoverContractDraft, "continuationFocus" | "adaptationFocus" | "openingChapters">,
): void {
  const chapterNumbers = draft.openingChapters.map((item) => item.chapterNumber).sort((a, b) => a - b);
  if (chapterNumbers.join(",") !== "1,2,3") {
    throw new Error("开篇方向必须覆盖第 1、2、3 章，且不能重复。");
  }

  if (mode === "continuation") {
    if (!draft.continuationFocus) {
      throw new Error("续写方案必须包含终局人物状态与未完线索。");
    }
    if (draft.adaptationFocus) {
      throw new Error("续写方案不应包含参考创作转换字段。");
    }
    return;
  }

  if (!draft.adaptationFocus) {
    throw new Error("参考创作方案必须包含钩子、冲突循环、爽点节奏与新书转换方案。");
  }
  if (draft.continuationFocus) {
    throw new Error("参考创作方案不应包含续写终局字段。");
  }
}

export function parseCreativeCarryoverContract(value: unknown): CreativeCarryoverContract | null {
  const parsed = creativeCarryoverContractSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function serializeCreativeCarryoverContract(contract: CreativeCarryoverContract): string {
  return JSON.stringify(contract);
}

export function buildOpeningIdeaFromCarryoverContract(contract: CreativeCarryoverContract): string {
  const opening = contract.openingChapters
    .slice()
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .map((item) => `第${item.chapterNumber}章：${item.direction}`)
    .join("；");
  const realization = contract.bookRealization.slice(0, 2).join("；");
  if (contract.mode === "continuation") {
    return `续写开篇：${opening}。本书实现：${realization}`;
  }
  return `参考创作开篇：${opening}。本书实现：${realization}`;
}
