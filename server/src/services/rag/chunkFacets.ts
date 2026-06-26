export const RAG_CHUNK_FACET_KEYS = [
  "genreTags",
  "sellingPointTags",
  "targetReaders",
  "strengths",
  "weaknesses",
  "characterRole",
  "chapterAnchor",
] as const;

export type RagChunkFacetKey = (typeof RAG_CHUNK_FACET_KEYS)[number];

export type RagChunkFacets = Partial<Record<RagChunkFacetKey, string[]>>;

export interface RagChunkAnchor {
  sectionKey?: string;
  fieldKey?: string;
  fieldIndex?: number;
  chapterIndex?: number;
  excerptOffsetRange?: {
    start: number;
    end: number;
  };
}

export interface RagPreChunk {
  chunkText: string;
  facets?: RagChunkFacets;
  anchor?: RagChunkAnchor;
  metadata?: Record<string, unknown>;
}

export function normalizeRagFacetValues(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12)));
}

export function normalizeRagFacets(raw: unknown): RagChunkFacets {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const facets: RagChunkFacets = {};
  for (const key of RAG_CHUNK_FACET_KEYS) {
    const values = normalizeRagFacetValues(record[key]);
    if (values.length > 0) {
      facets[key] = values;
    }
  }
  return facets;
}

export function hasRagFacets(facets?: RagChunkFacets): boolean {
  return Object.values(facets ?? {}).some((values) => Array.isArray(values) && values.length > 0);
}

export function encodeFacetKeys(facets?: RagChunkFacets): string | null {
  if (!facets || !hasRagFacets(facets)) {
    return null;
  }
  const parts: string[] = [];
  for (const key of RAG_CHUNK_FACET_KEYS) {
    for (const value of facets[key] ?? []) {
      const normalized = value.trim();
      if (normalized) {
        parts.push(`|${key}=${normalized}|`);
      }
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
