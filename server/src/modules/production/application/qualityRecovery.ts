import { cloneProductionData, ProductionVersionConflictError } from "../common";
import { applyUnitAction } from "../domain";
import type { UnitProgressStore, UnitRun } from "./ports";

/** Only a source-page recovery command may supply this authorization; polling never calls it. */
export async function acknowledgeUnitQualityPause(input: { run: UnitRun; contentHash: string }, ports: {
  store: UnitProgressStore;
  /** Check explicit command, current ownership, control state and unchanged saved manuscript. */
  authorizeExplicitRecovery(run: UnitRun): Promise<void>;
}): Promise<UnitRun> {
  const run = cloneProductionData(input.run);
  await ports.authorizeExplicitRecovery(run);
  const progress = applyUnitAction(run.progress, { kind: "acknowledge_quality_pause", contentHash: input.contentHash });
  const saved = await ports.store.compareAndSwap(run, { progress, artifacts: run.artifacts,
    activeStage: run.activeStage, activeRequestKey: run.activeRequestKey });
  if (!saved) throw new ProductionVersionConflictError();
  return saved;
}
