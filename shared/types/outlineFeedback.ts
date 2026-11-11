import { z } from "zod";
import type { LLMProvider } from "./llm";

export const outlineFeedbackSettingsSchema = z.object({
  mode: z.enum(["chapter", "every_n", "volume", "off"]).default("chapter"),
  everyN: z.number().int().min(1).max(100).default(5),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).max(200).optional(),
});
export type OutlineFeedbackSettings = z.infer<typeof outlineFeedbackSettingsSchema>;
export const outlineFeedbackAnalyzeSchema = z.object({ chapterId: z.string().min(1), requestKey: z.string().min(1).max(200) });
export const outlineFeedbackDecisionSchema = z.object({ operationIds: z.array(z.string().min(1)).min(1).max(12) });
export const outlineFeedbackOutputSchema = z.object({ operations: z.array(z.object({
  operationId: z.string().min(1).max(100),
  kind: z.literal("update_fields"),
  nodeId: z.string().min(1),
  fields: z.record(z.string(), z.string().max(1600)),
  reason: z.string().min(1).max(600),
  dependsOn: z.array(z.string()).max(0),
})).max(12) });
export type OutlineFeedbackOutput = z.infer<typeof outlineFeedbackOutputSchema>;
export interface OutlineFeedbackRunView {
  id: string; chapterId: string; chapterOrder: number;
  sourceSummary?: string; baseVersion?: number; stale?: boolean; canRetry?: boolean;
  sourceNodes?: Array<{ nodeId: string; type: string; fields: Record<string, string> }>;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null; attempt: number; createdAt: string;
  items: Array<{ operationId: string; proposalId: string; nodeId: string; fields: Record<string, string>; reason: string; status: "pending" | "adopted" | "rejected"; revisionId?: string; revisionVersion?: number }>;
}
export interface OutlineFeedbackStatus {
  projectId: string; novelId: string; sourceRoute: string;
  settings: OutlineFeedbackSettings; runs: OutlineFeedbackRunView[];
}
export interface OutlineFeedbackRunReceipt {
  id: string; status: OutlineFeedbackRunView["status"]; chapterId: string; chapterOrder: number;
}
export interface OutlineFeedbackDecisionResult { id: string; items: OutlineFeedbackRunView["items"] }
export type OutlineFeedbackModelOptions = { provider?: LLMProvider; model?: string };
