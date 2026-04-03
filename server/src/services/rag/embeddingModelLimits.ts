import type { EmbeddingProvider } from "../../config/rag";

function normalizeModelName(model: string | null | undefined): string {
  return (model ?? "").trim().toLowerCase();
}

export function resolveEmbeddingInputTokenLimit(
  provider: EmbeddingProvider,
  model: string | null | undefined,
): number | null {
  const normalizedModel = normalizeModelName(model);
  if (!normalizedModel) {
    return null;
  }

  if (
    provider === "siliconflow"
    && /\bbge-large-(zh|en)-v1\.5\b/i.test(normalizedModel)
  ) {
    return 512;
  }

  return null;
}

export function resolveEmbeddingChunkTokenBudget(
  provider: EmbeddingProvider,
  model: string | null | undefined,
): number | null {
  const limit = resolveEmbeddingInputTokenLimit(provider, model);
  if (!limit) {
    return null;
  }
  return Math.max(64, Math.floor(limit * 0.85));
}
