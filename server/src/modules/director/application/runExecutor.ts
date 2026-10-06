import { checkAction, createPlanOrchestrator, type Action, type Orchestrator, type PlanDefinition } from "../domain";
import type { RunRepository, ArtifactLedger, EventLog, QualityDebtRepository, PlanRegistry } from "./ports";
import type { FactsLoader, LoadedRunFacts } from "./factsLoader";
import { StepRegistry, type StepResult } from "./stepRegistry";
import { automaticRecoveryBudget } from "./runtime";

export type RunExecutionResult =
  | { kind: "idle" }
  | { kind: "executed" }
  | { kind: "rejected"; code: string }
  | { kind: "paused" }
  | { kind: "completed" }
  | { kind: "failed" };

export interface RunExecutorDeps {
  factsLoader: Pick<FactsLoader, "load">;
  planRegistry: PlanRegistry;
  orchestrator: Orchestrator;
  assistedOrchestrator?: Orchestrator;
  runRepository: Pick<RunRepository, "transition"> & Partial<Pick<RunRepository, "getControl">>;
  artifactLedger: Pick<ArtifactLedger, "record">;
  qualityDebtRepository: Pick<QualityDebtRepository, "record">;
  eventLog: Pick<EventLog, "list" | "append">;
  stepRegistry: StepRegistry;
}

function payloadNumber(payload: unknown, key: string): number {
  if (!payload || typeof payload !== "object") return 0;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function eventTotal(events: Awaited<ReturnType<EventLog["list"]>>, type: string, key: string): number {
  return events.filter((event) => event.type === type).reduce((total, event) => total + payloadNumber(event.payload, key), 0);
}

export class RunExecutor {
  constructor(private readonly deps: RunExecutorDeps) {}

  async runOnce(runId: string): Promise<RunExecutionResult> {
    const loaded = await this.deps.factsLoader.load(runId);
    if (loaded.control.status !== "running") return { kind: "idle" };
    const plan = this.deps.planRegistry.get(loaded.contract.planVersion);
    if (!plan) throw new Error(`director next plan version not found: ${loaded.contract.planVersion}`);
    const events = await this.deps.eventLog.list(runId);
    const resumedAt = events.filter(event => event.type === "stop_signal_cleared").at(-1)?.seq ?? 0;
    const rejections = events.filter(event => event.type === "action_rejected" && event.seq > resumedAt).length;
    const orchestrator = loaded.contract.driver === "assisted" ? this.deps.assistedOrchestrator ?? this.deps.orchestrator : this.deps.orchestrator;
    const action = orchestrator.next({ plan, contract: loaded.contract, facts: loaded.facts });
    const verdict = checkAction({
      action,
      plan,
      contract: loaded.contract,
      control: loaded.control,
      facts: loaded.facts,
      tokensUsed: eventTotal(events, "token_usage", "tokensUsed"),
      rejections,
    });
    if (!verdict.ok) {
      return this.reject(
        runId,
        loaded,
        action,
        verdict.code,
        verdict.message,
        rejections,
      );
    }
    return this.executeAction(runId, loaded, plan, action);
  }

  private async reject(
    runId: string,
    loaded: LoadedRunFacts,
    action: Action,
    code: string,
    message: string,
    eventCount: number,
  ): Promise<RunExecutionResult> {
    const nextRejections = eventCount + 1;
    await this.deps.eventLog.append({ runId, type: "action_rejected", payload: { action, code, message } });
    if (nextRejections < loaded.contract.rejectionBudget) return { kind: "rejected", code };
    const reason = "rejection_budget_exhausted";
    await this.deps.eventLog.append({
      runId,
      type: "stop_signal",
      payload: { kind: "manual_recovery", reason, action: "pause_for_manual", source: "runtime" },
    });
    await this.deps.runRepository.transition(runId, {
      type: "pause",
      pause: { kind: "manual_recovery", reason },
    }, loaded.control.version);
    return { kind: "paused" };
  }

  private async executeAction(
    runId: string,
    loaded: LoadedRunFacts,
    plan: PlanDefinition,
    action: Action,
  ): Promise<RunExecutionResult> {
    switch (action.kind) {
      case "run_step":
        return this.executeStep(runId, loaded, plan, action.stepId);
      case "record_debt":
        await this.deps.qualityDebtRepository.record({ runId, novelId: loaded.contract.novelId, ...action, action: "continue" });
        await this.deps.eventLog.append({ runId, type: "quality_debt_recorded", payload: action });
        return { kind: "executed" };
      case "open_gate":
        await this.deps.runRepository.transition(runId, {
          type: "open_gate",
          gateId: action.gateId,
          artifactTypes: action.artifactTypes,
        }, loaded.control.version);
        return { kind: "executed" };
      case "pause":
        await this.deps.runRepository.transition(runId, { type: "pause", pause: action.pause }, loaded.control.version);
        return { kind: "paused" };
      case "complete":
        await this.deps.runRepository.transition(runId, { type: "complete" }, loaded.control.version);
        return { kind: "completed" };
      case "fail":
        await this.deps.runRepository.transition(runId, { type: "fail", reason: action.reason }, loaded.control.version);
        return { kind: "failed" };
      default: {
        const unreachable: never = action;
        throw new Error(`unsupported director action: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  private async executeStep(runId: string, loaded: LoadedRunFacts, plan: PlanDefinition, stepId: string): Promise<RunExecutionResult> {
    const step = plan.steps.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`director step not found in plan: ${stepId}`);
    if (loaded.control.cursorStepId === stepId) {
      // The plan still needs the previously started step: no usable artifact was committed.
      const events = await this.deps.eventLog.list(runId);
      const resumedAt = events.filter(event => event.type === "stop_signal_cleared").at(-1)?.seq ?? 0;
      const failures = events.filter(event => event.type === "execution_failure" && event.seq > resumedAt);
      const counted = failures.some(event => payloadNumber(event.payload, "controlVersion") === loaded.control.version);
      const attempts = failures.length + (counted ? 0 : 1);
      if (!counted) await this.deps.eventLog.append({runId, type: "execution_failure",
        payload: {attempt: attempts, controlVersion: loaded.control.version, stepId, cause: "interrupted_step"}});
      if (attempts > automaticRecoveryBudget(loaded.contract)) {
        const reason = "execution_retry_budget_exhausted";
        await this.deps.eventLog.append({runId, type: "stop_signal",
          payload: {kind: "manual_recovery", reason, action: "pause_for_manual", source: "runtime"}});
        await this.deps.runRepository.transition(runId, {type: "pause", pause: {kind: "manual_recovery", reason}}, loaded.control.version);
        return {kind: "paused"};
      }
    }
    const started = await this.deps.runRepository.transition(runId, { type: "step_started", stepId }, loaded.control.version);
    const result = await this.deps.stepRegistry.get(stepId)({
      runId,
      contract: loaded.contract,
      control: started,
      facts: loaded.facts,
      step,
    });
    if (this.deps.runRepository.getControl) {
      const current = await this.deps.runRepository.getControl(runId);
      if (!current || current.status !== "running" || current.version !== started.version) return {kind: "idle"};
    }
    if (result.stopSignal) {
      const facts = {...loaded.facts, stopSignal: result.stopSignal};
      const action = createPlanOrchestrator().next({plan, contract: loaded.contract, facts});
      const verdict = checkAction({action, plan, contract: loaded.contract, control: started, facts, tokensUsed: 0, rejections: 0});
      if (!result.stopSignal.reason?.trim() || !verdict.ok) throw new Error("invalid step stop signal");
    }
    await this.recordStepResult(runId, loaded, step.produces, result);
    await this.deps.eventLog.append({ runId, type: "step_finished", payload: { stepId, tokensUsed: result.tokensUsed ?? 0 } });
    await this.deps.runRepository.transition(runId, { type: "step_finished" }, started.version);
    if (result.stopSignal) return this.runOnce(runId);
    return { kind: "executed" };
  }

  private async recordStepResult(runId: string, loaded: LoadedRunFacts, producedType: string, result: StepResult): Promise<void> {
    // Record safety and quality facts before the artifact can make this step skippable on recovery.
    for (const debt of [...(result.debt ? [result.debt] : []), ...(result.debts ?? [])]) {
      await this.deps.qualityDebtRepository.record({runId, novelId: loaded.contract.novelId, ...debt});
    }
    if (result.stopSignal) await this.deps.eventLog.append({runId, type: "stop_signal", payload: result.stopSignal});
    if (result.artifact) {
      await this.deps.artifactLedger.record({
        novelId: loaded.contract.novelId,
        type: producedType,
        scope: result.artifact.scope,
        status: result.artifact.status,
        protectedUserContent: result.artifact.protectedUserContent,
        contentRef: result.artifact.contentRef,
        contentHash: result.artifact.contentHash,
        producedByRunId: runId,
      });
    }
    if (result.tokensUsed && result.tokensUsed > 0) {
      await this.deps.eventLog.append({ runId, type: "token_usage", payload: { tokensUsed: result.tokensUsed } });
    }
  }
}
