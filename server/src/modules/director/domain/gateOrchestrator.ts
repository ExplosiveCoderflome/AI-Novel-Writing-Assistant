import { latestArtifact, readySteps, remainingSteps } from "./plan";
import type { Orchestrator } from "./types";

/** Assisted driving is a separate policy; it shares dependency facts, never the automatic orchestrator. */
export function createGateOrchestrator(): Orchestrator {
  return {next({plan, contract, facts}) {
    const signal = facts.stopSignal;
    if (signal) {
      if (signal.kind === "replan") return {kind: "pause", pause: {kind: "replan", reason: signal.reason}};
      if (signal.kind === "manual_recovery") return {kind: "pause", pause: {kind: "manual_recovery", reason: signal.reason}};
      if (signal.action === "fail_task") return {kind: "fail", reason: signal.reason};
      return {kind: "pause", pause: {kind: "safety", reason: signal.reason}};
    }
    const pending = plan.steps.filter(step => step.gateable && (!contract.stepIdsInScope || contract.stepIdsInScope.includes(step.id)))
      .filter(step => latestArtifact(facts, step.produces, contract.scope)?.status === "draft");
    if (pending.length) return {kind: "open_gate", gateId: `gate:${contract.runId}:${pending.map(step => `${step.produces}@${latestArtifact(facts, step.produces, contract.scope)!.version}`).join(",")}`,
      artifactTypes: pending.map(step => step.produces)};
    const ready = readySteps(plan, facts, {scope: contract.scope, requireConfirmed: true, stepIdsInScope: contract.stepIdsInScope});
    if (ready.length) return {kind: "run_step", stepId: ready[0].id};
    if (remainingSteps(plan, facts, contract.scope, contract.stepIdsInScope).length === 0) return {kind: "complete"};
    return {kind: "pause", pause: {kind: "manual_recovery", reason: "no_runnable_step"}};
  }};
}
