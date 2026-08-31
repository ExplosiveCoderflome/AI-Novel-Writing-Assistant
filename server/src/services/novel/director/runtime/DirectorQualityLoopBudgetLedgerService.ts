import type { DirectorQualityLoopBudgetEntry } from "@ai-novel/shared/types/novelDirector";

type ResolvedDirectorQualityLoopBudgetAction = "auto_patch_repair" | "defer_and_continue";

/** Historical projection compatibility; current execution no longer writes this ledger. */
export function resolveDirectorQualityLoopBudgetNextAction(
  entry: DirectorQualityLoopBudgetEntry | null | undefined,
): ResolvedDirectorQualityLoopBudgetAction {
  return (
    (entry?.deferredCount ?? 0) > 0
    || (entry?.windowReplanCount ?? 0) > 0
    || (entry?.chapterRewriteCount ?? 0) > 0
    || (entry?.patchRepairCount ?? 0) > 0
  )
    ? "defer_and_continue"
    : "auto_patch_repair";
}
