import type { FactsSnapshot, RunContract, RunControl, StopSignal } from "../domain";
import type { ArtifactLedger, EventLog, QualityDebtRepository, RunRepository } from "./ports";

export interface LoadedRunFacts {
  contract: RunContract;
  control: RunControl;
  facts: FactsSnapshot;
}

export class DirectorRunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`director next run not found: ${runId}`);
    this.name = "DirectorRunNotFoundError";
  }
}

export class InvalidStopSignalError extends Error {
  constructor(readonly seq: number) {
    super(`invalid director stop signal event at seq ${seq}`);
    this.name = "InvalidStopSignalError";
  }
}

function parseStopSignal(payload: unknown, seq: number): StopSignal {
  const value = payload as Partial<StopSignal> | null;
  const kinds: readonly StopSignal["kind"][] = ["replan", "safety", "data_integrity", "no_usable_content", "manual_recovery"];
  const actions: readonly NonNullable<StopSignal["action"]>[] = ["stop_for_replan", "pause_for_manual", "fail_task"];
  if (!value || typeof value !== "object"
    || !kinds.includes(value.kind as StopSignal["kind"])
    || typeof value.reason !== "string" || !value.reason.trim()
    || (value.action !== undefined && !actions.includes(value.action))
    || (value.source !== undefined && value.source !== "quality" && value.source !== "runtime")) {
    throw new InvalidStopSignalError(seq);
  }
  return { kind: value.kind as StopSignal["kind"], reason: value.reason, ...(value.action ? { action: value.action } : {}), ...(value.source ? {source: value.source} : {}) };
}

function readStopSignal(events: Awaited<ReturnType<EventLog["list"]>>): StopSignal | null {
  let current: { seq: number; signal: StopSignal } | null = null;
  for (const event of events) {
    if (event.type === "stop_signal") {
      current = { seq: event.seq, signal: parseStopSignal(event.payload, event.seq) };
    } else if (event.type === "stop_signal_cleared") {
      const payload = event.payload as { signalSeq?: unknown; commandId?: unknown } | null;
      if (!payload || typeof payload !== "object"
        || typeof payload.signalSeq !== "number" || !Number.isSafeInteger(payload.signalSeq) || payload.signalSeq < 1
        || typeof payload.commandId !== "string" || !payload.commandId.trim()) {
        throw new InvalidStopSignalError(event.seq);
      }
      if (current?.seq === payload.signalSeq) {
        current = null;
      }
    }
  }
  return current?.signal ?? null;
}

function savedPause(control: RunControl): StopSignal | null {
  if (control.status !== "paused" || !control.pause) {
    return null;
  }
  return {
    kind: control.pause.kind === "manual_recovery" ? "manual_recovery" : control.pause.kind,
    reason: control.pause.reason,
    action: control.pause.kind === "replan" ? "stop_for_replan" : "pause_for_manual",
  };
}

export interface FactsLoaderDeps {
  runRepository: Pick<RunRepository, "getContract" | "getControl">;
  artifactLedger: Pick<ArtifactLedger, "listByNovel">;
  qualityDebtRepository: Pick<QualityDebtRepository, "listByNovel">;
  eventLog: Pick<EventLog, "list">;
}

export class FactsLoader {
  constructor(private readonly deps: FactsLoaderDeps) {}

  async load(runId: string): Promise<LoadedRunFacts> {
    const [contract, control] = await Promise.all([
      this.deps.runRepository.getContract(runId),
      this.deps.runRepository.getControl(runId),
    ]);
    if (!contract || !control) {
      throw new DirectorRunNotFoundError(runId);
    }
    const [artifacts, debts, events] = await Promise.all([
      this.deps.artifactLedger.listByNovel(contract.novelId),
      this.deps.qualityDebtRepository.listByNovel(contract.novelId),
      this.deps.eventLog.list(runId),
    ]);
    const eventStop = readStopSignal(events);
    return {
      contract,
      control,
      facts: { artifacts, debts, stopSignal: control.pause && eventStop?.reason === control.pause.reason && eventStop.kind === control.pause.kind ? eventStop : savedPause(control) ?? eventStop },
    };
  }
}
