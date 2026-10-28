import { z } from "zod";
import { STAGES, type ProductionProfile, type StageId } from "./types";

const outputBudget = z.number().int().positive().optional();
export const productionProfileSchema = z.object({
  id: z.string().trim().min(1),
  stages: z.array(z.enum(STAGES)).min(3),
  repair: z.object({ maxAttempts: z.union([z.literal(0), z.literal(1)]),
    mode: z.enum(["light_repair", "heavy_repair", "detect_only"]) }).strict(),
  context: z.string().trim().min(1),
  reconcile: z.enum(["adaptive", "deferred", "strict"]),
  outputBudgets: z.object({prepare:outputBudget,draft:outputBudget,accept:outputBudget,repair:outputBudget,
    verify:outputBudget,select:outputBudget,commit:outputBudget,reconcile:outputBudget}).strict(),
  capabilities: z.array(z.string().trim().min(1)),
}).strict().superRefine((profile, ctx) => {
  const stages = profile.stages;
  const invalid = (message: string) => ctx.addIssue({code:"custom",message,path:["stages"]});
  if (stages.some((stage, index) => index > 0 && STAGES.indexOf(stage) <= STAGES.indexOf(stages[index - 1]))) {
    invalid("Stages must occur once in production order.");
  }
  for (const stage of ["prepare","draft","commit"] as const) {
    if (!stages.includes(stage)) invalid(`Missing required stage: ${stage}`);
  }
  if (stages.includes("repair") && (!stages.includes("accept") || !stages.includes("verify") || !stages.includes("select"))) {
    invalid("Repair requires acceptance, verification and selection.");
  }
  if ((stages.includes("verify") || stages.includes("select")) && !stages.includes("repair")) {
    invalid("Candidate stages require repair.");
  }
});

export class InvalidProductionProfileError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidProductionProfileError"; }
}
export function defineProfile(value: unknown, knownIds: readonly string[] = []): ProductionProfile {
  const parsed = productionProfileSchema.safeParse(value);
  if (!parsed.success) throw new InvalidProductionProfileError(parsed.error.message);
  if (knownIds.includes(parsed.data.id)) throw new InvalidProductionProfileError("Profile ID is already defined.");
  return parsed.data;
}
export function isStageEnabled(profile: ProductionProfile, stage: StageId): boolean {
  return profile.stages.includes(stage);
}
