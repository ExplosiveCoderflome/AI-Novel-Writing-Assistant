import { z } from "zod";

export const replanRepairIntentSchema = z.enum([
  "patch_repair",
  "state_realign",
  "payoff_rebalance",
  "chapter_rewrite",
  "continue",
]);

export const aiReplanWindowDecisionSchema = z.object({
  recommended: z.boolean().default(true),
  triggerReason: z.string().trim().min(1),
  windowReason: z.string().trim().min(1),
  whyTheseChapters: z.string().trim().min(1),
  anchorChapterOrder: z.number().int().positive().nullable().optional(),
  affectedChapterOrders: z.array(z.number().int().positive()).min(1).max(8),
  blockingIssueIds: z.array(z.string().trim().min(1)).max(20).default([]),
  blockingLedgerKeys: z.array(z.string().trim().min(1)).max(20).default([]),
  repairIntent: replanRepairIntentSchema.default("state_realign"),
  confidence: z.number().min(0).max(1).default(0.7),
});

export type AiReplanWindowDecision = z.infer<typeof aiReplanWindowDecisionSchema>;
export type ReplanRepairIntent = z.infer<typeof replanRepairIntentSchema>;

export interface SanitizedReplanWindowDecision extends AiReplanWindowDecision {
  anchorChapterOrder: number | null;
  affectedChapterOrders: number[];
}

function uniqueNumbers(items: number[]): number[] {
  return Array.from(new Set(
    items
      .filter((item) => Number.isInteger(item) && item > 0)
      .map((item) => Number(item)),
  )).sort((left, right) => left - right);
}

function nearestAvailableOrder(value: number | null | undefined, availableChapterOrders: number[]): number | null {
  if (!value || availableChapterOrders.length === 0) {
    return null;
  }
  let best = availableChapterOrders[0];
  let bestDistance = Math.abs(best - value);
  for (const order of availableChapterOrders) {
    const distance = Math.abs(order - value);
    if (distance < bestDistance) {
      best = order;
      bestDistance = distance;
    }
  }
  return best;
}

export function sanitizeAiReplanWindowDecision(input: {
  decision: AiReplanWindowDecision;
  availableChapterOrders: number[];
  targetChapterOrder: number;
  maxWindowSize?: number;
}): SanitizedReplanWindowDecision {
  const available = uniqueNumbers(input.availableChapterOrders);
  const availableSet = new Set(available);
  const maxWindowSize = Math.max(1, Math.min(input.maxWindowSize ?? 5, 5));
  const filteredOrders = uniqueNumbers(input.decision.affectedChapterOrders)
    .filter((order) => availableSet.has(order))
    .slice(0, maxWindowSize);
  if (filteredOrders.length === 0) {
    throw new Error("AI replan window did not select any available chapter.");
  }
  const anchorChapterOrder = availableSet.has(input.decision.anchorChapterOrder ?? 0)
    ? input.decision.anchorChapterOrder ?? null
    : nearestAvailableOrder(input.decision.anchorChapterOrder ?? input.targetChapterOrder, available);
  return {
    ...input.decision,
    anchorChapterOrder,
    affectedChapterOrders: filteredOrders,
    blockingIssueIds: Array.from(new Set(input.decision.blockingIssueIds)),
    blockingLedgerKeys: Array.from(new Set(input.decision.blockingLedgerKeys)),
  };
}
