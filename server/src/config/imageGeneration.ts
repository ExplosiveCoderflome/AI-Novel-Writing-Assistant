export const DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 300_000;
export const MIN_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 30_000;
export const MAX_IMAGE_GENERATION_HTTP_TIMEOUT_MS = 900_000;

function asInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  return Math.max(min, Math.min(max, value));
}

function resolveImageGenerationHttpTimeoutMs(): number {
  const globalTimeoutMs = asInt(
    process.env.LLM_REQUEST_TIMEOUT_MS,
    DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    MIN_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    MAX_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
  );
  return asInt(
    process.env.IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    Math.max(globalTimeoutMs, DEFAULT_IMAGE_GENERATION_HTTP_TIMEOUT_MS),
    MIN_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
    MAX_IMAGE_GENERATION_HTTP_TIMEOUT_MS,
  );
}

export const imageGenerationConfig = {
  httpTimeoutMs: resolveImageGenerationHttpTimeoutMs(),
};
