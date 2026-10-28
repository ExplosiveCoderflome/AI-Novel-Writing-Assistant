/** Saved runtime facts only; this response never authorizes an operation. */
export interface DirectorRuntimeStatus {
  runId: string;
  novelId: string;
  status: "queued" | "running" | "waiting_gate" | "paused" | "completed" | "failed" | "cancelled";
  controlVersion: number;
  pause: {kind: "manual_recovery" | "replan" | "safety"; reason: string} | null;
  cursorStepId: string | null;
  lastFailure: {stepId: string | null; code: string; message: string; occurredAt: string} | null;
  sourceRoute: string;
}

export interface DirectorRecordWarning {
  runId: string;
  code: "director_projection_unavailable";
  message: string;
}
