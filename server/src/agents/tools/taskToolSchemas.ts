import { z } from "zod";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import {
  toolListLimitSchema,
  toolNullableTextSchema,
  toolOptionalTextSchema,
  toolProgressSchema,
  toolRequiredIdSchema,
  toolSummarySchema,
} from "./toolSchemaPrimitives";

const TASK_TOOL_KIND_VALUES = [
  "book_analysis",
  "novel_pipeline",
  "image_generation",
  "agent_run",
  "style_extraction",
] as const satisfies readonly Exclude<TaskKind, "knowledge_document">[];

const TASK_STATUS_VALUES = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const satisfies readonly TaskStatus[];

export const taskKindSchema = z.enum(TASK_TOOL_KIND_VALUES);
export const taskStatusSchema = z.enum(TASK_STATUS_VALUES);

export const listTasksInputSchema = z.object({
  kind: taskKindSchema.optional(),
  status: taskStatusSchema.optional(),
  keyword: toolOptionalTextSchema,
  limit: toolListLimitSchema,
});

export const taskSummarySchema = z.object({
  id: z.string(),
  kind: taskKindSchema,
  title: z.string(),
  status: taskStatusSchema,
  progress: toolProgressSchema,
  currentStage: toolNullableTextSchema,
  ownerLabel: z.string(),
  failureSummary: toolNullableTextSchema,
  recoveryHint: toolNullableTextSchema,
});

export const listTasksOutputSchema = z.object({
  items: z.array(taskSummarySchema),
  summary: toolSummarySchema,
});

export const taskIdentityInputSchema = z.object({
  kind: taskKindSchema,
  id: toolRequiredIdSchema,
});

export const getTaskDetailOutputSchema = z.object({
  id: z.string(),
  kind: taskKindSchema,
  title: z.string(),
  status: taskStatusSchema,
  currentStage: toolNullableTextSchema,
  ownerLabel: z.string(),
  sourceRoute: z.string(),
  failureSummary: toolNullableTextSchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolNullableTextSchema,
  summary: toolSummarySchema,
});

export const getTaskFailureReasonOutputSchema = z.object({
  kind: taskKindSchema,
  id: z.string(),
  status: taskStatusSchema,
  failureSummary: toolSummarySchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolSummarySchema,
  summary: toolSummarySchema,
});

export const getRunFailureReasonInputSchema = z.object({
  runId: toolRequiredIdSchema,
});

export const getRunFailureReasonOutputSchema = z.object({
  runId: z.string(),
  status: taskStatusSchema,
  failureSummary: toolSummarySchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolSummarySchema,
  lastFailedStep: toolNullableTextSchema,
  summary: toolSummarySchema,
});

export const taskMutationOutputSchema = z.object({
  kind: taskKindSchema,
  id: z.string(),
  status: taskStatusSchema,
  summary: toolSummarySchema,
});

export const explainGenerationBlockerInputSchema = z.object({
  novelId: toolRequiredIdSchema,
  chapterOrder: z.number().int().min(1).optional(),
  runId: toolOptionalTextSchema,
});

export const explainGenerationBlockerOutputSchema = z.object({
  novelId: z.string(),
  chapterOrder: z.number().int().nullable(),
  blockerType: z.enum(["pipeline_failed", "pipeline_running", "pipeline_waiting", "agent_run", "none"]),
  status: z.string().nullable(),
  failureSummary: toolSummarySchema,
  failureDetails: toolNullableTextSchema,
  recoveryHint: toolSummarySchema,
  summary: toolSummarySchema,
});
