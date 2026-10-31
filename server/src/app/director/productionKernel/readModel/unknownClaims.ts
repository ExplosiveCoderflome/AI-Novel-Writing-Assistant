import type { RunContract, RunControl } from "../../../../modules/director";
import type { DirectorUnknownClaimsView } from "@ai-novel/shared/types/director/unknownClaims";
import { parseProductionUnitRun } from "../../../../modules/production";
import type { KernelBudgetReader } from "../execution/budgetReader";
import { productionBatchOwnerKey } from "../execution/ownership";

/** Model-step claims whose outcome stays unknown after an interruption. Consumer
 *  claims are local writes and recover on their own; budget and usage receipts are
 *  accounting rows, not steps. Shared by the read model and the explicit resolution
 *  in recovery/commands.ts so both sides always agree on what may be released. */
export const UNKNOWN_MODEL_CLAIM_FILTER: import("@prisma/client").Prisma.ChapterArtifactSyncCheckpointWhereInput = {
  OR: [
    { artifactType: { in: ["production_kernel@1:extraction", "production_kernel@1:timeline_extraction", "production_kernel@1:payoff_full_reconcile"] } },
    { artifactType: { startsWith: "production_kernel@1:prepare:model:" } },
  ],
};

/** The first paused chapter (in book order) that still holds an unconfirmed model step. */
export async function readKernelPausedUnknownClaims(db: KernelBudgetReader, contract: RunContract,
  control: Pick<RunControl, "status" | "pause">): Promise<DirectorUnknownClaimsView | null> {
  if (control.status !== "paused" || control.pause?.kind !== "manual_recovery") return null;
  const rows = await db.productionUnitRun.findMany({ where: { ownerKey: productionBatchOwnerKey(contract.runId) } });
  const runs = rows.map(parseProductionUnitRun).sort((a, b) => a.progress.unit.order - b.progress.unit.order);
  for (const run of runs) {
    const unit = run.progress.unit;
    const claims = await db.chapterArtifactSyncCheckpoint.count({ where: {
      novelId: contract.novelId, chapterId: unit.chapterId, status: "running", sourceType: "production_kernel",
      ...UNKNOWN_MODEL_CLAIM_FILTER } });
    if (claims > 0) return { chapterId: unit.chapterId, chapterOrder: unit.order };
  }
  return null;
}
