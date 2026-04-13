import { createHash, randomUUID } from "crypto";

export function normalizeRagText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

export function splitRagChunks(source: string, chunkSize: number, chunkOverlap: number): string[] {
  const normalized = normalizeRagText(source);
  if (!normalized) {
    return [];
  }
  if (normalized.length <= chunkSize) {
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
    const step = Math.max(1, chunkSize - chunkOverlap);
    for (let cursor = 0; cursor < unit.length; cursor += step) {
      const part = unit.slice(cursor, cursor + chunkSize).trim();
      if (!part) {
        continue;
      }
      chunks.push(part);
      if (cursor + chunkSize >= unit.length) {
        break;
      }
    }
  };

  for (const unit of units) {
    if (!unit) {
      continue;
    }
    if (!current) {
      if (unit.length <= chunkSize) {
        current = unit;
      } else {
        pushLongUnit(unit);
      }
      continue;
    }

    const merged = `${current}\n${unit}`;
    if (merged.length <= chunkSize) {
      current = merged;
      continue;
    }

    chunks.push(current);
    if (unit.length <= chunkSize) {
      current = unit;
    } else {
      pushLongUnit(unit);
      current = "";
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function estimateTokenCount(text: string): number {
  // Chinese-heavy text rough estimate.
  return Math.max(1, Math.ceil(text.length / 1.8));
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
