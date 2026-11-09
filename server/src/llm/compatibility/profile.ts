import { z } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";

export const structuredModeSchema = z.enum(["json_schema", "json_object", "tool_calling", "prompt_only"]);
export type StructuredMode = z.infer<typeof structuredModeSchema>;
export const capabilityProfileSchema = z.object({
  structuredModes: z.array(structuredModeSchema).min(1),
  failedModes: z.array(structuredModeSchema).default([]),
  thinkingToggle: z.object({ supported: z.boolean(), control: z.enum(["none", "thinking", "thinking_boolean", "enable_thinking", "reasoning_effort"]), effort: z.boolean().default(false) }),
  reasoningField: z.enum(["none", "reasoning_content", "reasoning", "think_tags", "reasoning_details"]),
  maxContext: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().max(1048576).optional(),
  source: z.enum(["builtin_default", "probed", "user_override"]),
  probedAt: z.string().optional(),
  updatedAt: z.string(),
  family: z.string(),
});
export type ModelCapabilityProfile = z.infer<typeof capabilityProfileSchema>;
export interface ModelIdentity { provider: LLMProvider; model?: string; baseURL?: string; requestProtocol?: ModelRouteRequestProtocol }
export function modelId(model?: string): string { return (model ?? "").trim().toLowerCase().split("/").at(-1) ?? ""; }
export function modelHost(baseURL?: string): string { return baseURL ? new URL(baseURL).host.toLowerCase() : ""; }
export function identityKey(input: ModelIdentity): string {
  return encodeURIComponent(JSON.stringify([input.provider, (input.model ?? "").trim().toLowerCase(), modelHost(input.baseURL)]));
}
