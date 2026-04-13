import { z } from "zod";
import {
  toolListLimitSchema,
  toolNullableTextSchema,
  toolOptionalTextSchema,
  toolRequiredIdSchema,
  toolSummarySchema,
  toolTimestampSchema,
} from "./toolSchemaPrimitives";

export const listWritingFormulasInputSchema = z.object({
  limit: toolListLimitSchema,
});

export const writingFormulaSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  genre: toolNullableTextSchema,
  style: toolNullableTextSchema,
  toneVoice: toolNullableTextSchema,
  updatedAt: toolTimestampSchema,
});

export const listWritingFormulasOutputSchema = z.object({
  items: z.array(writingFormulaSummarySchema),
  summary: toolSummarySchema,
});

export const writingFormulaIdInputSchema = z.object({
  formulaId: toolRequiredIdSchema,
});

export const getWritingFormulaDetailOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  genre: toolNullableTextSchema,
  style: toolNullableTextSchema,
  toneVoice: toolNullableTextSchema,
  formulaDescription: toolNullableTextSchema,
  formulaSteps: toolNullableTextSchema,
  applicationTips: toolNullableTextSchema,
  updatedAt: toolTimestampSchema,
  summary: toolSummarySchema,
});

export const explainFormulaMatchOutputSchema = z.object({
  formulaId: z.string(),
  basisType: z.enum(["sample_text", "chapter", "novel_outline", "formula_only"]),
  matchedSignals: z.array(z.string()),
  missingSignals: z.array(z.string()),
  summary: toolSummarySchema,
});

export type ExplainFormulaMatchOutput = z.infer<typeof explainFormulaMatchOutputSchema>;

export const explainFormulaMatchInputSchema = z.object({
  formulaId: toolRequiredIdSchema,
  novelId: toolOptionalTextSchema,
  chapterId: toolOptionalTextSchema,
  sampleText: toolOptionalTextSchema,
});
