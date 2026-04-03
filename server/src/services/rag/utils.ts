import { createHash, randomUUID } from "crypto";

export function normalizeRagText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
}

function estimateSafeCharSize(text: string, chunkSize: number, maxTokens: number): number {
  const estimatedTokens = estimateTokenCount(text);
  if (estimatedTokens <= 0) {
    return chunkSize;
  }
  const conservativeTokenBudget = Math.max(64, Math.floor(maxTokens * 0.85));
  const charsPerToken = text.length / estimatedTokens;
  const cappedCharsPerToken = containsCjk(text)
    ? Math.max(1, Math.min(charsPerToken, 1.15))
    : Math.max(1, Math.min(charsPerToken, 4));
  return Math.max(120, Math.min(chunkSize, Math.floor(conservativeTokenBudget * cappedCharsPerToken)));
}

function splitChunkByTokenBudget(source: string, maxTokens: number, chunkOverlap: number): string[] {
  const normalized = normalizeRagText(source);
  if (!normalized) {
    return [];
  }
  if (estimateTokenCount(normalized) <= maxTokens) {
    return [normalized];
  }

  const safeChunkSize = estimateSafeCharSize(normalized, normalized.length, maxTokens);
  const safeOverlap = Math.max(0, Math.min(chunkOverlap, Math.floor(safeChunkSize / 4)));
  const step = Math.max(1, safeChunkSize - safeOverlap);
  const chunks: string[] = [];

  for (let cursor = 0; cursor < normalized.length; cursor += step) {
    const part = normalized.slice(cursor, cursor + safeChunkSize).trim();
    if (!part) {
      continue;
    }
    if (estimateTokenCount(part) <= maxTokens) {
      chunks.push(part);
    } else if (part.length >= normalized.length) {
      const midpoint = Math.max(1, Math.floor(part.length / 2));
      chunks.push(...splitChunkByTokenBudget(part.slice(0, midpoint), maxTokens, safeOverlap));
      chunks.push(...splitChunkByTokenBudget(part.slice(midpoint), maxTokens, safeOverlap));
    } else {
      chunks.push(...splitChunkByTokenBudget(part, maxTokens, safeOverlap));
    }
    if (cursor + safeChunkSize >= normalized.length) {
      break;
    }
  }

  return chunks.filter(Boolean);
}

export function splitRagChunks(
  source: string,
  chunkSize: number,
  chunkOverlap: number,
  options?: { maxTokens?: number | null },
): string[] {
  const normalized = normalizeRagText(source);
  if (!normalized) {
    return [];
  }
  const maxTokens = typeof options?.maxTokens === "number" && options.maxTokens > 0
    ? Math.floor(options.maxTokens)
    : null;
  const effectiveChunkSize = maxTokens
    ? estimateSafeCharSize(normalized, chunkSize, maxTokens)
    : chunkSize;

  if (normalized.length <= effectiveChunkSize && (!maxTokens || estimateTokenCount(normalized) <= maxTokens)) {
    return [normalized];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const units = paragraphs.length > 1
    ? paragraphs
    : normalized
      .split(/(?<=[。！？!?])\s*/)
      .map((item) => item.trim())
      .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushLongUnit = (unit: string) => {
    const step = Math.max(1, effectiveChunkSize - chunkOverlap);
    for (let cursor = 0; cursor < unit.length; cursor += step) {
      const part = unit.slice(cursor, cursor + effectiveChunkSize).trim();
      if (!part) {
        continue;
      }
      if (maxTokens && estimateTokenCount(part) > maxTokens) {
        chunks.push(...splitChunkByTokenBudget(part, maxTokens, chunkOverlap));
      } else {
        chunks.push(part);
      }
      if (cursor + effectiveChunkSize >= unit.length) {
        break;
      }
    }
  };

  for (const unit of units) {
    if (!unit) {
      continue;
    }
    if (!current) {
      if (unit.length <= effectiveChunkSize && (!maxTokens || estimateTokenCount(unit) <= maxTokens)) {
        current = unit;
      } else {
        pushLongUnit(unit);
      }
      continue;
    }

    const merged = `${current}\n${unit}`;
    if (
      merged.length <= effectiveChunkSize
      && (!maxTokens || estimateTokenCount(merged) <= maxTokens)
    ) {
      current = merged;
      continue;
    }

    chunks.push(current);
    if (unit.length <= effectiveChunkSize && (!maxTokens || estimateTokenCount(unit) <= maxTokens)) {
      current = unit;
    } else {
      pushLongUnit(unit);
      current = "";
    }
  }

  if (current) {
    chunks.push(current);
  }
  if (!maxTokens) {
    return chunks;
  }
  return chunks.flatMap((chunk) => splitChunkByTokenBudget(chunk, maxTokens, chunkOverlap));
}

export function estimateTokenCount(text: string): number {
  const normalized = normalizeRagText(text);
  if (!normalized) {
    return 0;
  }
  const cjkChars = (normalized.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) ?? []).length;
  const nonCjkText = normalized.replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, "");
  const compactAscii = nonCjkText.replace(/\s+/g, "");
  const otherTokenEstimate = Math.ceil(compactAscii.length / 4);
  return Math.max(1, cjkChars + otherTokenEstimate);
}

export function computeChunkHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildChunkId(): string {
  return randomUUID();
}

export function toKeywordTerms(query: string): string[] {
  const normalized = normalizeRagText(query);
  if (!normalized) {
    return [];
  }
  const terms = normalized
    .split(/[\s,，。！？!?;；、\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
  return Array.from(new Set(terms));
}

export function compactSnippet(source: string, maxChars = 280): string {
  const text = source.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }
  const head = text.slice(0, Math.floor(maxChars * 0.7)).trim();
  const tail = text.slice(-Math.max(40, Math.floor(maxChars * 0.2))).trim();
  return `${head} ... ${tail}`;
}
