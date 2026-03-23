import { z } from "zod";

export const styleDetectionViolationSchema = z.object({
  ruleId: z.string().trim().optional(),
  ruleName: z.string().trim().min(1),
  ruleType: z.enum(["forbidden", "risk", "encourage"]),
  severity: z.enum(["low", "medium", "high"]),
  excerpt: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
  canAutoRewrite: z.boolean(),
});

export const styleDetectionPayloadSchema = z.object({
  riskScore: z.coerce.number().min(0).max(100).optional(),
  summary: z.string().trim().optional(),
  violations: z.array(styleDetectionViolationSchema).optional().default([]),
  canAutoRewrite: z.boolean().optional().default(false),
});

