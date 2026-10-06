import { readySteps, remainingSteps } from "./plan";
import type { Orchestrator } from "./types";

export function createPlanOrchestrator(): Orchestrator {
  return {
    next({ plan, contract, facts }) {
      if (facts.stopSignal) {
        if (facts.stopSignal.kind === "manual_recovery") {
          return {
            kind: "pause",
            pause: { kind: "manual_recovery", reason: facts.stopSignal.reason },
          };
        }
        if (facts.stopSignal.kind === "replan") {
          return {
            kind: "pause",
            pause: { kind: "replan", reason: facts.stopSignal.reason },
          };
        }
        if (facts.stopSignal.action === "fail_task") {
          return { kind: "fail", reason: facts.stopSignal.reason };
        }
        return { kind: "pause", pause: { kind: "safety", reason: facts.stopSignal.reason } };
      }

      const ready = readySteps(plan, facts, {
        scope: contract.scope,
        requireConfirmed: contract.driver === "assisted",
        stepIdsInScope: contract.stepIdsInScope,
      });
      if (ready.length > 0) {
        return { kind: "run_step", stepId: ready[0].id };
      }

      if (remainingSteps(plan, facts, contract.scope, contract.stepIdsInScope).length === 0) {
        return { kind: "complete" };
      }

      return { kind: "pause", pause: { kind: "manual_recovery", reason: "no_runnable_step" } };
    },
  };
}

