import type {DirectorRuntimeStatus} from "@ai-novel/shared/types/director/runtimeStatus";
import {RUN_STATUSES} from "../../domain/control";
import {DirectorRunNotFoundError} from "../factsLoader";
import type {EventLog, RunRepository} from "../ports";
import {publicRuntimeFailure} from "./errors";

/** Deliberately independent of artifacts, plans, production progress and command execution. */
export async function readDirectorRuntimeStatus(deps: {
  runRepository: Pick<RunRepository, "getContract" | "getControl">;
  eventLog: Pick<EventLog, "list">;
}, runId: string, novelId: string): Promise<DirectorRuntimeStatus> {
  const [contract, control] = await Promise.all([
    deps.runRepository.getContract(runId), deps.runRepository.getControl(runId),
  ]);
  if (!contract || contract.runId !== runId || contract.novelId !== novelId || !control
    || !RUN_STATUSES.includes(control.status) || !Number.isSafeInteger(control.version) || control.version < 0) {
    throw new DirectorRunNotFoundError(runId);
  }
  const events = await deps.eventLog.list(runId);
  const failure = events.filter(event => event.type === "execution_failure").sort((a, b) => b.seq - a.seq)[0];
  const pause = control.pause && ["manual_recovery", "replan", "safety"].includes(control.pause.kind)
    ? {kind: control.pause.kind, reason: control.pause.reason === "execution_retry_budget_exhausted"
      ? control.pause.reason : "runtime_paused"} : null;
  return {runId, novelId, status: control.status, controlVersion: control.version, pause,
    cursorStepId: control.cursorStepId && /^[a-z][a-z0-9_]{0,79}$/.test(control.cursorStepId) ? control.cursorStepId : null,
    lastFailure: failure ? {...publicRuntimeFailure(failure.payload), occurredAt: failure.createdAt.toISOString()} : null,
    sourceRoute: `/lab/director/${encodeURIComponent(novelId)}`};
}
