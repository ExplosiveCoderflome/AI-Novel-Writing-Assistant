import { defineProfile, InvalidProductionProfileError, STAGES, type ProductionProfile } from "../domain";

export type LongChapterVariant = "standard" | "fast" | "strict";

/** Detached profile data. A strict profile does not override the caller's saved issue policy. */
export function createLongChapterProfile(variant: LongChapterVariant = "standard"): ProductionProfile {
  if (!["standard", "fast", "strict"].includes(variant)) throw new InvalidProductionProfileError("Unknown long chapter variant");
  return defineProfile({
    id: variant === "standard" ? "long_chapter@1" : `long_chapter_${variant}@1`,
    stages: variant === "fast" ? ["prepare", "draft", "accept", "commit", "reconcile"] : [...STAGES],
    repair: variant === "fast" ? { maxAttempts: 0, mode: "detect_only" } : { maxAttempts: 1, mode: "light_repair" },
    context: "long_chapter@1",
    reconcile: variant === "fast" ? "deferred" : variant === "strict" ? "strict" : "adaptive",
    // Existing writer (6000), acceptance (4096/6144) and patch repair (4200) budgets.
    // Preparation/reconciliation use their fully resolved stage descriptors, not an invented fixed limit.
    outputBudgets: { draft: 6000, accept: 4096, repair: 4200, verify: 6144 },
    capabilities: ["fact_consistency", "character_state", "promise_fulfillment", "causal_closure",
      "information_boundaries", "expression_quality", "edit_protection"],
  });
}
