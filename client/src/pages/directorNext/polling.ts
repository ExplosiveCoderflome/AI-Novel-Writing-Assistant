/** Permanent prerequisites need a deliberate refresh; transport failures retry at a bounded rate. */
export function directorPollInterval(error: unknown, failures: number): number | false {
  if (!error) return 4000;
  const value = error as {status?: number; code?: string};
  if (value.code && ["production_storage_not_ready", "production_model_capability_missing", "director_projection_unavailable"].includes(value.code)
    || value.status !== undefined && value.status >= 400 && value.status < 500) return false;
  return Math.min(30000, 4000 * 2 ** Math.min(Math.max(failures, 1), 3));
}
