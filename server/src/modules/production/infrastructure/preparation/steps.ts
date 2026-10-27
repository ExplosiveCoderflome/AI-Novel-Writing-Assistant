import { canonicalProductionJson, cloneProductionData, isKnownPromptQualityFailure, isRetryableModelOutputError, ProductionBudgetNotDispatchedError, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError, ProductionSnapshotConflictError, type UnitRun } from "../../application";
import type { ArtifactStepIdentity } from "../checkpoints";
import type { ChapterBaseline } from "../stages";
import { PreparationRequestUnresolvedError, type KernelPreparationStageDependencies, type PreparationSteps, type PreparedPreparationRequest } from "./types";

export function createPreparationSteps(deps: KernelPreparationStageDependencies, run: UnitRun, baseline: ChapterBaseline,
  requestKey: string, inputFingerprint: string, recoverOnly: boolean) {
  const identity = (key: string, kind: ArtifactStepIdentity["kind"]): ArtifactStepIdentity => ({
    runId: run.id, ownerKey: run.ownerKey, novelId: run.progress.unit.novelId, chapterId: run.progress.unit.chapterId,
    contentHash: hashProductionContent(baseline.content ?? ""), unitRequestKey: requestKey,
    stepKey: hashProductionContent(canonicalProductionJson({ requestKey, key, kind, inputFingerprint, snapshots: run.snapshots })),
    step: `prepare:${key}`, executionToken: deps.executionToken(run), kind,
  });
  const steps: PreparationSteps = {
    async committed(key) {
      const saved = await deps.checkpoints.claim(identity(`commit:${key}`, "consumer"), { existingOnly: true });
      return saved.status === "cached" ? cloneProductionData(saved.value) : undefined;
    },
    async read(key, load) {
      const claim = await deps.checkpoints.claim(identity(`input:${key}`, "consumer"));
      if (claim.status === "cached") return cloneProductionData(claim.value);
      if (claim.status !== "claimed") throw new PreparationRequestUnresolvedError();
      try {
        await deps.fence(run);
        const value = cloneProductionData(await load());
        await deps.fence(run);
        await deps.checkpoints.succeed(claim.claim, value);
        return value;
      } catch (error) {
        await deps.fence(run); await deps.checkpoints.fail(claim.claim); throw error;
      }
    },
    async model(key, request, invoke) {
      if (!request.identity || !Number.isSafeInteger(request.outputTokens) || request.outputTokens < 1) {
        throw new InvalidProductionRequestError("Preparation requires a complete request snapshot and output allowance");
      }
      const candidate = cloneProductionData(request);
      const saved = await steps.read(`request:${key}`, async () => candidate as unknown as ProductionJson) as unknown as PreparedPreparationRequest;
      if (canonicalProductionJson(saved) !== canonicalProductionJson(candidate)) throw new ProductionSnapshotConflictError();
      const id = identity(`model:${key}`, "model");
      let claim = await deps.checkpoints.claim(id, { existingOnly: recoverOnly });
      if (claim.status === "cached") return cloneProductionData(claim.value);
      if (claim.status === "not_started" && recoverOnly) {
        // Recovery may start work that is known never to have been dispatched:
        // no row yet (a rebuilt request legitimately carries a new key), or a
        // row released after a known-safe failure. A running row still reports
        // unknown and blocks below, so an outcome that may have executed is
        // never re-dispatched.
        const fresh = await deps.checkpoints.claim(id);
        if (fresh.status === "claimed") claim = fresh;
      }
      if (claim.status !== "claimed") throw new PreparationRequestUnresolvedError();
      try {
        await deps.fence(run);
        const value = cloneProductionData(await invoke(saved, id.stepKey));
        await deps.fence(run);
        await deps.checkpoints.succeed(claim.claim, value);
        return value;
      } catch (error) {
        if (error instanceof ProductionBudgetNotDispatchedError) {
          await deps.fence(run); await deps.checkpoints.release(claim.claim);
        } else if (isRetryableModelOutputError(error) || isKnownPromptQualityFailure(error)) {
          // The model answered but its output could not be used, and the port
          // wrote nothing for this call. Release the claim so a fresh execution
          // can run the step again instead of finding it claimed forever.
          await deps.fence(run); await deps.checkpoints.release(claim.claim);
        }
        // Every other model failure may have been dispatched. Its claim stays durable.
        throw error;
      }
    },
    async commit(key, write) {
      const claim = await deps.checkpoints.claim(identity(`commit:${key}`, "consumer"));
      if (claim.status === "cached") return cloneProductionData(claim.value);
      if (claim.status !== "claimed") throw new PreparationRequestUnresolvedError();
      try { return await deps.checkpoints.applyConsumer(claim.claim, write); }
      catch (error) { await deps.fence(run); await deps.checkpoints.fail(claim.claim); throw error; }
    },
  };
  return { steps, finalIdentity: identity("input:stage_result", "consumer") };
}
