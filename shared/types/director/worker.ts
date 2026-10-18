/** Read-only scheduler information, never permission to bypass a lease or manual pause. */
export interface DirectorWorkerStatus {
  state: "waiting" | "busy" | "starting" | "retrying" | "unavailable";
  canRetry: boolean;
}
