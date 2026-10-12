import { isArtifactSatisfied, latestArtifact, remainingSteps } from "./plan";
import type {
  Action,
  FactsSnapshot,
  PlanDefinition,
  RunContract,
  RunControl,
  StopSignal,
} from "./types";

export type GuardCode =
  | "run_not_active"
  | "rejection_budget_exhausted"
  | "unknown_step"
  | "step_out_of_scope"
  | "budget_exceeded"
  | "requires_unmet"
  | "protected_content"
  | "invalid_action"
  | "steps_remaining"
  | "stop_signal_required"
  | "chapter_out_of_scope";

export type GuardVerdict = { ok: true } | { ok: false; code: GuardCode; message: string };

export interface GuardInput {
  action: Action;
  plan: PlanDefinition;
  contract: RunContract;
  control: RunControl;
  facts: FactsSnapshot;
  tokensUsed: number;
  rejections: number;
}

function reject(code: GuardCode, message: string): GuardVerdict {
  return { ok: false, code, message };
}

function pauseMatchesSignal(
  pause: Extract<Action, { kind: "pause" }>["pause"],
  signal: StopSignal | null,
  contract: RunContract,
): boolean {
  if (pause.kind === "manual_recovery") {
    if (pause.reason === "no_runnable_step") {
      return signal === null;
    }
    return (contract.issuePolicy.mode === "quality_first" || signal?.source === "runtime")
      && signal?.kind === "manual_recovery"
      && signal.action === "pause_for_manual";
  }
  if (pause.kind === "replan") {
    return signal?.kind === "replan"
      && (signal.action === undefined || signal.action === "stop_for_replan");
  }
  return signal?.kind === "safety"
    || signal?.kind === "data_integrity"
    || signal?.kind === "no_usable_content";
}

function failMatchesSignal(action: Extract<Action, { kind: "fail" }>, signal: StopSignal | null): boolean {
  if (!signal) {
    return false;
  }
  return signal.action === "fail_task"
    || signal.kind === "safety"
    || signal.kind === "data_integrity"
    || signal.kind === "no_usable_content";
}

export function checkAction(input: GuardInput): GuardVerdict {
  const { action, plan, contract, control, facts } = input;

  if (control.status !== "running") {
    return reject("run_not_active", `run is ${control.status}, actions are only accepted while running`);
  }
  if (input.rejections >= contract.rejectionBudget) {
    return reject(
      "rejection_budget_exhausted",
      `rejected actions reached the budget of ${contract.rejectionBudget}`,
    );
  }

  switch (action.kind) {
    case "run_step": {
      const step = plan.steps.find((candidate) => candidate.id === action.stepId);
      if (!step) {
        return reject("unknown_step", `step ${action.stepId} is not in the plan`);
      }
      if (contract.stepIdsInScope && !contract.stepIdsInScope.includes(step.id)) {
        return reject("step_out_of_scope", `step ${step.id} is outside the run scope`);
      }
      if (contract.tokenBudget !== null && input.tokensUsed >= contract.tokenBudget) {
        return reject(
          "budget_exceeded",
          `token usage ${input.tokensUsed} reached the budget of ${contract.tokenBudget}`,
        );
      }
      const requireConfirmed = contract.driver === "assisted";
      const missing = step.requires.filter(
        (type) => !isArtifactSatisfied(facts, type, contract.scope, requireConfirmed),
      );
      if (missing.length > 0) {
        return reject("requires_unmet", `step ${step.id} is missing: ${missing.join(", ")}`);
      }
      const touched = [...step.overwrites, step.produces];
      const protectedType = touched.find(
        (type) => latestArtifact(facts, type, contract.scope)?.protectedUserContent === true,
      );
      if (protectedType) {
        return reject(
          "protected_content",
          `step ${step.id} would overwrite protected user content in ${protectedType}`,
        );
      }
      return { ok: true };
    }
    case "open_gate": {
      if (contract.driver !== "assisted") {
        return reject("invalid_action", "gates are only available to assisted runs");
      }
      if (action.artifactTypes.length === 0) {
        return reject("invalid_action", "a gate must reference at least one artifact type");
      }
      const missing = action.artifactTypes.filter(
        (type) => !isArtifactSatisfied(facts, type, contract.scope, false),
      );
      if (missing.length > 0) {
        return reject("invalid_action", `gate references missing artifacts: ${missing.join(", ")}`);
      }
      return { ok: true };
    }
    case "record_debt": {
      if (!Number.isInteger(action.chapterOrder) || action.chapterOrder < 1 || !action.code) {
        return reject("invalid_action", "a quality debt needs a chapter order >= 1 and a code");
      }
      if (
        contract.chapterRange
        && (action.chapterOrder < contract.chapterRange.from || action.chapterOrder > contract.chapterRange.to)
      ) {
        return reject("chapter_out_of_scope", "quality debt is outside the run chapter range");
      }
      return { ok: true };
    }
    case "pause":
      return pauseMatchesSignal(action.pause, facts.stopSignal, contract)
        ? { ok: true }
        : reject("stop_signal_required", "pause must match a structured stop signal or no_runnable_step");
    case "fail":
      return failMatchesSignal(action, facts.stopSignal)
        ? { ok: true }
        : reject("stop_signal_required", "fail requires a structured safety, integrity, or content signal");
    case "complete": {
      const remaining = remainingSteps(plan, facts, contract.scope, contract.stepIdsInScope);
      if (remaining.length > 0) {
        return reject(
          "steps_remaining",
          `cannot complete, steps remaining: ${remaining.map((step) => step.id).join(", ")}`,
        );
      }
      return { ok: true };
    }
    default: {
      const unreachable: never = action;
      return reject("invalid_action", `unsupported action ${JSON.stringify(unreachable)}`);
    }
  }
}

