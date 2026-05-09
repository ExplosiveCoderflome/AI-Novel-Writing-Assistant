const DEFAULT_BROWSER_LIKE_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BLOCKED_REQUEST_HEADER_NAMES = new Set([
  "authorization",
  "content-length",
  "connection",
  "host",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-api-key",
]);
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

export function buildGatewayUserAgentHeader(): string {
  const configured = process.env.LLM_HTTP_USER_AGENT?.trim();
  return configured || DEFAULT_BROWSER_LIKE_USER_AGENT;
}

/**
 * Parse user provided request headers text into an object.
 *
 * Supported formats (one per line):
 * - Header: value
 * - Header+value
 *
 * Empty lines are ignored. Empty header names are ignored.
 */
export function parseRequestHeadersText(text?: string | null): Record<string, string> {
  const raw = typeof text === "string" ? text : "";
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const rawLine of trimmed.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    const plusIndex = line.indexOf("+");
    const hasColon = colonIndex >= 0;
    const hasPlus = plusIndex >= 0;

    let splitIndex = -1;
    if (hasColon && hasPlus) {
      splitIndex = Math.min(colonIndex, plusIndex);
    } else if (hasColon) {
      splitIndex = colonIndex;
    } else if (hasPlus) {
      splitIndex = plusIndex;
    }

    if (splitIndex < 0) {
      continue;
    }

    const key = line.slice(0, splitIndex).trim();
    const value = line.slice(splitIndex + 1).trim();
    const normalizedKey = key.toLowerCase();
    if (!key || !HEADER_NAME_PATTERN.test(key) || BLOCKED_REQUEST_HEADER_NAMES.has(normalizedKey)) {
      continue;
    }
    if (/[\r\n\0]/u.test(value)) {
      continue;
    }
    result[key] = value;
  }

  return result;
}
