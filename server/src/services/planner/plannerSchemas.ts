import { z } from "zod";
import type { PlannerOutput } from "./plannerOutputNormalization";

// Planner 输出需要尽量宽容：不同模型可能在字段类型上有差异（字符串/数组等）。
// 但 top-level 必须是对象，且 scenes 必须是数组（或可修复为数组）。

const plannerSceneSchema = z.object({
  title: z.string().trim().optional(),
  objective: z.string().trim().optional(),
  conflict: z.string().trim().optional(),
  reveal: z.string().trim().optional(),
  emotionBeat: z.string().trim().optional(),
}).passthrough();

export const plannerOutputSchema = z.object({
  title: z.string().trim().optional(),
  objective: z.string().trim().optional(),
  participants: z.array(z.string().trim()).optional(),
  reveals: z.array(z.string().trim()).optional(),
  riskNotes: z.array(z.string().trim()).optional(),
  hookTarget: z.string().trim().optional(),
  planRole: z.enum(["setup", "progress", "pressure", "turn", "payoff", "cooldown"]).nullable().optional(),
  phaseLabel: z.string().trim().optional(),
  mustAdvance: z.array(z.string().trim()).optional(),
  mustPreserve: z.array(z.string().trim()).optional(),
  scenes: z.array(plannerSceneSchema).optional(),
}).passthrough();

export type PlannerOutputSchema = z.infer<typeof plannerOutputSchema> & Partial<PlannerOutput>;
