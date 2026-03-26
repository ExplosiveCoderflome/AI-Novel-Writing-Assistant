import { z } from "zod";

export const toolRequiredTextSchema = z.string().trim().min(1);
export const toolOptionalTextSchema = z.string().trim().optional();
export const toolNullableTextSchema = z.string().trim().nullable();
export const toolRequiredIdSchema = toolRequiredTextSchema;
export const toolOptionalIdSchema = z.string().trim().optional();
export const toolListLimitSchema = z.number().int().min(1).max(50).optional();
export const toolTimestampSchema = toolRequiredTextSchema;
export const toolNullableTimestampSchema = toolTimestampSchema.nullable();
export const toolSummarySchema = toolRequiredTextSchema;
export const toolCountSchema = z.number().int();
export const toolProgressSchema = z.number();
export const toolDryRunSchema = z.boolean().optional();
