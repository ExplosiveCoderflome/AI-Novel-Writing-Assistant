import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { PatchRepairMode } from "../../chapterPatchRepairService";

/** Apply the existing AI decision before claiming a repair attempt. Historical results remain compatible. */
export function shouldAttemptAutomaticRepair(
  runtimePackage: ChapterRuntimePackage,
  repairMode: PatchRepairMode,
): boolean {
  const meta = runtimePackage.meta;
  const hasIntegrityFinding = runtimePackage.audit?.hasBlockingIssues
    || runtimePackage.timelineCheck?.status === "failed";
  if (!hasIntegrityFinding
    && meta?.continuePolicy === "continue"
    && (meta.acceptanceStatus === "accepted" || meta.acceptanceStatus === "continue_with_risk")) {
    return false;
  }

  const directives = meta?.repairDirectives ?? [];
  if (repairMode !== "heavy_repair" && directives.length > 0
    && directives.every(directive => directive.mode !== "patch")) {
    return false;
  }
  return true;
}
