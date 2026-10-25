/** Keep provider diagnostics useful without persisting credentials or entire response bodies. */
export async function readSanitizedResponseError(response: Response, secret?: string): Promise<string> {
  const raw = await response.text();
  let message = raw;
  try {
    const body = JSON.parse(raw) as {
      error?: string | { message?: unknown };
      status?: { error?: unknown };
      message?: unknown;
      detail?: unknown;
    };
    const candidates = [
      typeof body?.error === "string" ? body.error : body?.error?.message,
      body?.status?.error,
      body?.message,
      body?.detail,
    ];
    message = candidates.find((value): value is string => typeof value === "string") ?? "Provider returned an error response.";
  } catch {
    if (/^\s*</.test(raw)) message = "Provider returned a non-JSON error response.";
  }
  if (secret) message = message.split(secret).join("[REDACTED]");
  message = message.replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]").replace(/\s+/g, " ").trim();
  return message.length > 240 ? `${message.slice(0, 240)}...` : message;
}
