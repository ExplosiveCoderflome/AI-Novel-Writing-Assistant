import type { RunContract, RunControl } from "../../../../modules/director";
import type { DirectorUnknownClaimsView } from "@ai-novel/shared/types/director/unknownClaims";
import { parseProductionUnitRun, type StageId } from "../../../../modules/production";
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

/** Writing and review stages call the model but expose no recover port, so an
 *  interrupted execute keeps its unit claim with no durable checkpoint to read.
 *  Commit is included because an installed post-generation review port may call a
 *  model there; its chapter write still shares the CAS, so a lost result leaves
 *  no half-saved manuscript. Only an explicit per-chapter confirmation may clear
 *  these claims. */
export const UNCONFIRMED_ACTIVE_STAGES: ReadonlySet<StageId> = new Set(["draft", "accept", "repair", "verify", "commit"]);

export function isUnconfirmedActiveStage(stage: StageId | null | undefined): boolean {
  return Boolean(stage && UNCONFIRMED_ACTIVE_STAGES.has(stage));
}

/** A prepare claim is an orphan only when the chapter has no prepare/reconcile
 *  checkpoint: recovery then has nothing durable to replay. A saved step means the
 *  normal recover can continue without asking the user to confirm anything. */
export async function isOrphanPrepareClaim(db: KernelBudgetReader, novelId: string, chapterId: string): Promise<boolean> {
  const saved = await db.chapterArtifactSyncCheckpoint.count({ where: {
    novelId, chapterId, sourceType: "production_kernel", ...UNKNOWN_MODEL_CLAIM_FILTER } });
  return saved === 0;
}

/** The first paused chapter (in book order) that still holds an unconfirmed step. */
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
    if (isUnconfirmedActiveStage(run.activeStage)
      || run.activeStage === "prepare" && await isOrphanPrepareClaim(db, contract.novelId, unit.chapterId)) {
      return { chapterId: unit.chapterId, chapterOrder: unit.order };
    }
  }
  return null;
}
