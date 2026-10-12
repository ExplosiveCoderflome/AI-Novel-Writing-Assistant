import type {EventLog} from "../ports";

type RunEvents = Awaited<ReturnType<EventLog["list"]>>;

/** An author request begins a new attempt series without increasing its retry limit. */
export function recoveryBoundarySeq(events: RunEvents): number {
  return events.filter(event => event.type === "stop_signal_cleared" || event.type === "gate_regeneration_requested").at(-1)?.seq ?? 0;
}

export function regenerationForStep(events: RunEvents, scope: string, artifactType: string, stepId: string): {guidance?: string} | undefined {
  const finishedAt = events.filter(event => event.type === "step_finished" && (event.payload as {stepId?: string} | null)?.stepId === stepId).at(-1)?.seq ?? 0;
  const request = events.filter(event => {
    const payload = event.payload as {scope?: string; artifactTypes?: unknown} | null;
    return event.type === "gate_regeneration_requested" && event.seq > finishedAt && payload?.scope === scope
      && Array.isArray(payload.artifactTypes) && payload.artifactTypes.includes(artifactType);
  }).at(-1);
  if (!request) return undefined;
  const guidance = (request.payload as {guidance?: unknown}).guidance;
  return typeof guidance === "string" && guidance.trim() ? {guidance: guidance.trim()} : {};
}
