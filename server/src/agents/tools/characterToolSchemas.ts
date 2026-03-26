import { z } from "zod";
import {
  toolListLimitSchema,
  toolNullableTextSchema,
  toolOptionalTextSchema,
  toolRequiredIdSchema,
  toolSummarySchema,
  toolTimestampSchema,
} from "./toolSchemaPrimitives";

export const listBaseCharactersInputSchema = z.object({
  category: toolOptionalTextSchema,
  search: toolOptionalTextSchema,
  limit: toolListLimitSchema,
});

export const baseCharacterSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  category: z.string(),
  tags: z.string(),
  updatedAt: toolTimestampSchema,
});

export const listBaseCharactersOutputSchema = z.object({
  items: z.array(baseCharacterSummarySchema),
  summary: toolSummarySchema,
});

export const baseCharacterIdInputSchema = z.object({
  characterId: toolRequiredIdSchema,
});

export const getBaseCharacterDetailOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  category: z.string(),
  personality: z.string(),
  background: z.string(),
  development: z.string(),
  appearance: toolNullableTextSchema,
  weaknesses: toolNullableTextSchema,
  interests: toolNullableTextSchema,
  keyEvents: toolNullableTextSchema,
  tags: z.string(),
  updatedAt: toolTimestampSchema,
  summary: toolSummarySchema,
});
