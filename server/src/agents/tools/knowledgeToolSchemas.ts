import { z } from "zod";
import type {
  KnowledgeDocumentStatus,
  KnowledgeIndexStatus,
} from "@ai-novel/shared/types/knowledge";
import {
  toolCountSchema,
  toolListLimitSchema,
  toolNullableTextSchema,
  toolRequiredIdSchema,
  toolSummarySchema,
  toolTimestampSchema,
} from "./toolSchemaPrimitives";

const KNOWLEDGE_DOCUMENT_STATUS_VALUES = [
  "enabled",
  "disabled",
  "archived",
] as const satisfies readonly KnowledgeDocumentStatus[];

const KNOWLEDGE_INDEX_STATUS_VALUES = [
  "idle",
  "queued",
  "running",
  "succeeded",
  "failed",
] as const satisfies readonly KnowledgeIndexStatus[];

export const knowledgeDocumentStatusSchema = z.enum(KNOWLEDGE_DOCUMENT_STATUS_VALUES);
export const knowledgeIndexStatusSchema = z.enum(KNOWLEDGE_INDEX_STATUS_VALUES);

export const listKnowledgeDocumentsInputSchema = z.object({
  status: knowledgeDocumentStatusSchema.optional(),
  limit: toolListLimitSchema,
});

export const knowledgeDocumentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  fileName: z.string(),
  status: knowledgeDocumentStatusSchema,
  latestIndexStatus: knowledgeIndexStatusSchema,
  lastIndexedAt: toolTimestampSchema.nullable(),
  latestIndexError: toolNullableTextSchema,
});

export const listKnowledgeDocumentsOutputSchema = z.object({
  items: z.array(knowledgeDocumentSummarySchema),
  summary: toolSummarySchema,
});

export const knowledgeDocumentIdInputSchema = z.object({
  documentId: toolRequiredIdSchema,
});

export const getKnowledgeDocumentDetailOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  fileName: z.string(),
  status: knowledgeDocumentStatusSchema,
  activeVersionNumber: toolCountSchema,
  latestIndexStatus: knowledgeIndexStatusSchema,
  lastIndexedAt: toolTimestampSchema.nullable(),
  latestIndexError: toolNullableTextSchema,
  versionCount: toolCountSchema,
  bindingCount: toolCountSchema,
  summary: toolSummarySchema,
});

export const getIndexFailureReasonOutputSchema = z.object({
  documentId: z.string(),
  status: knowledgeIndexStatusSchema,
  failureSummary: toolSummarySchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolSummarySchema,
  summary: toolSummarySchema,
});
