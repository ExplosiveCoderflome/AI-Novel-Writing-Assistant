const DEFAULT_SQLITE_RETRY_DELAYS_MS = [250, 1000, 2500] as const;

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isTransientSqliteTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = extractErrorCode(error);
  return code === "P1008"
    || code === "P2034"
    || message.includes("Operation has timed out")
    || message.includes("Socket timeout")
    || message.includes("SQLITE_BUSY")
    || message.includes("database is locked");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSqliteRetry<T>(
  operation: () => Promise<T>,
  options?: {
    label?: string;
    retryDelaysMs?: readonly number[];
  },
): Promise<T> {
  const retryDelaysMs = options?.retryDelaysMs ?? DEFAULT_SQLITE_RETRY_DELAYS_MS;
  let attempt = 0;

  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientSqliteTimeoutError(error) || attempt >= retryDelaysMs.length) {
        throw error;
      }

      const delayMs = retryDelaysMs[attempt] ?? retryDelaysMs[retryDelaysMs.length - 1] ?? 0;
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[sqlite.retry] label=${options?.label ?? "unknown"} attempt=${attempt + 1}/${retryDelaysMs.length} waitMs=${delayMs} reason=${JSON.stringify(reason)}`,
      );
      attempt += 1;
      await wait(delayMs);
    }
  }
}
