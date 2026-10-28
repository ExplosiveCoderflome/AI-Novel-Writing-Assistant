import { canonicalProductionJson, cloneProductionData, ProductionBudgetNotDispatchedError } from "../common";
import { applyUnitAction, decideNext, type StageId } from "../domain";
import type { StageReply, UnitOutcome, UnitPorts, UnitRequest, UnitRun, UnitRunUpdate } from "./ports";
import { assertRunMatches, createStageRequestKey, InvalidProductionRequestError, validateStageDescriptor, validateUnitRequest } from "./requestIdentity";
import { selectionReply, stageResultUpdate } from "./stageResults";

const outcome = (status: UnitOutcome["status"], run: UnitRun, reason?: string): UnitOutcome => ({
  status, progress: cloneProductionData(run.progress), ...(reason ? { reason } : {}),
});
async function save(ports: UnitPorts, run: UnitRun, next: UnitRunUpdate, reply?: StageReply): Promise<UnitRun | null> {
  await ports.fence(cloneProductionData(run), "before_save");
  return ports.store.compareAndSwap(run, next, reply?.chapterWrite);
}

/** No caller/module routing: decisions, claims, effects, fenced durable results. */
export async function runUnit(input: UnitRequest, ports: UnitPorts): Promise<UnitOutcome> {
  const request = validateUnitRequest(input);
  let run = await ports.store.loadOrCreate(request);
  assertRunMatches(request, run);
  await ports.fence(cloneProductionData(run), "loaded");
  for (let steps = 0; steps < 128; steps++) {
    if (run.activeStage) {
      const stage = run.activeStage;
      const descriptor = run.artifacts.activeDescriptor && validateStageDescriptor(run.artifacts.activeDescriptor);
      const contentHash = stage === "verify" ? run.progress.candidate?.contentHash : run.progress.original?.contentHash;
      if (!descriptor || createStageRequestKey(request, stage, descriptor, contentHash ?? null) !== run.activeRequestKey) {
        throw new InvalidProductionRequestError("Saved active request input identity differs");
      }
      const port = stage === "select" ? undefined : ports.stages[stage];
      const recovered = stage === "select" ? selectionReply(run)
        : await port?.recover?.(cloneProductionData(run), run.activeRequestKey!);
      if (!recovered) return outcome("unknown", run, "request_outcome_unknown");
      await ports.fence(cloneProductionData(run), "after_execute");
      const next = await save(ports, run, stageResultUpdate(run, recovered), recovered);
      if (!next) return outcome("busy", run, "progress_version_changed");
      run = next;
      if (recovered.result.stage === "reconcile" && recovered.result.status === "pending") return outcome("pending", run, "reconciliation_pending");
      continue;
    }
    const action = decideNext({ unit: run.progress, profile: request.profile, policy: request.policy });
    if (action.kind === "done") return outcome("completed", run);
    if (action.kind === "pause_for_manual") return outcome("paused", run, action.reason);
    if (action.kind === "stop_for_replan") return outcome("stopped", run, action.scope);
    if (action.kind === "fail") return outcome("failed", run, action.reason);
    if (action.kind !== "run_stage") {
      const next = await save(ports, run, { ...run, progress: applyUnitAction(run.progress, action) });
      if (!next) return outcome("busy", run, "progress_version_changed");
      run = next;
      continue;
    }
    const stage: StageId = action.stage;
    const port = stage === "select" ? undefined : ports.stages[stage];
    if (!port && stage !== "select") throw new Error(`Production stage port missing: ${stage}`);
    const deferred = run.artifacts.deferredDescriptor;
    if (deferred && deferred.stage !== stage) throw new InvalidProductionRequestError("Deferred request stage differs");
    const described = deferred?.descriptor ?? (stage === "select" ? {
      callsModel: false, inputFingerprint: canonicalProductionJson({ original: run.progress.original!, candidate: run.progress.candidate! }),
      promptVersion: "pure-selection-v1", configVersion: request.model.configVersion,
    } : await port!.describe(cloneProductionData(run)));
    const descriptor = validateStageDescriptor({ ...described, ...(described.callsModel
      ? { outputTokens: described.outputTokens ?? request.profile.outputBudgets[stage] } : {}) });
    const cap = request.profile.outputBudgets[stage];
    if (descriptor.callsModel && cap !== undefined && descriptor.outputTokens! > cap) {
      throw new InvalidProductionRequestError("Actual stage output exceeds the saved profile budget");
    }
    const contentHash = stage === "verify" ? run.progress.candidate?.contentHash : run.progress.original?.contentHash;
    const requestKey = createStageRequestKey(request, stage, descriptor, contentHash ?? null);
    await ports.fence(cloneProductionData(run), "before_claim");
    const claimed = await save(ports, run, { progress: run.progress,
      artifacts: { ...run.artifacts, activeDescriptor: descriptor }, activeStage: stage, activeRequestKey: requestKey });
    if (!claimed) return outcome("busy", run, "progress_version_changed");
    run = claimed;
    if (descriptor.callsModel) {
      const reservation = await ports.budget.reserve({ runId: run.id, stage, requestKey, outputTokens: descriptor.outputTokens! });
      if (reservation.reservationKey !== requestKey) throw new Error("Production budget reservation identity mismatch");
      if (!reservation.accepted) {
        const artifacts = { ...run.artifacts, deferredDescriptor:{stage,descriptor} }; delete artifacts.activeDescriptor;
        const released = await save(ports, run, { progress: run.progress, artifacts, activeStage: null, activeRequestKey: null });
        return outcome(released ? "budget_exhausted" : "busy", released ?? run, "budget_reservation_denied");
      }
    }
    await ports.fence(cloneProductionData(run), "before_execute");
    let reply: StageReply;
    try { reply = stage === "select" ? selectionReply(run) : await port!.execute(cloneProductionData(run), { ...descriptor, requestKey }); }
    catch (error) {
      if (error instanceof ProductionBudgetNotDispatchedError) {
        const artifacts = {...run.artifacts,deferredDescriptor:{stage,descriptor}}; delete artifacts.activeDescriptor;
        const released = await save(ports, run, {progress:run.progress,artifacts,activeStage:null,activeRequestKey:null});
        return outcome(released ? "budget_exhausted" : "busy",released ?? run,"budget_reservation_denied");
      }
      return outcome("unknown", run, "request_outcome_unknown");
    }
    await ports.fence(cloneProductionData(run), "after_execute");
    const next = await save(ports, run, stageResultUpdate(run, reply), reply);
    if (!next) return outcome("busy", run, "progress_version_changed");
    run = next;
    if (reply.result.stage === "reconcile" && reply.result.status === "pending") return outcome("pending", run, "reconciliation_pending");
  }
  throw new Error("Production execution exceeded its transition bound");
}
