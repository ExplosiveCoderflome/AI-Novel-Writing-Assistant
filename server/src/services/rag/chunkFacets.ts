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

const CHAPTER_HEADER_RE = /第\s*([一二三四五六七八九十百千零〇\d]{1,8})\s*章/g;
const CJK_NUM_MAP: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  十: 10, 百: 100, 千: 1000,
};

function parseCjkOrArabic(raw: string): number | null {
  const arabic = Number(raw);
  if (Number.isFinite(arabic) && arabic > 0) {
    return arabic;
  }
  const chars = raw.split("").reverse();
  let result = 0;
  let unit = 1;
  for (const ch of chars) {
    const val = CJK_NUM_MAP[ch];
    if (val === undefined) {
      return null;
    }
    if (val >= 10) {
      unit = val;
      if (result === 0) {
        result += val;
      }
    } else {
      result += val * unit;
    }
  }
  return result > 0 ? result : null;
}

export function extractChapterAnchorFromChunk(text: string): string[] {
  const found = new Set<string>();
  const matches = text.matchAll(CHAPTER_HEADER_RE);
  for (const match of matches) {
    const num = parseCjkOrArabic(match[1]);
    if (num !== null) {
      found.add(String(num - 1));
    }
    if (found.size >= 3) {
      break;
    }
  }
  return [...found];
}

export function extractCharacterRolesFromChunk(text: string, candidateNames: string[]): string[] {
  return candidateNames
    .filter((name) => name.length >= 2 && text.includes(name))
    .slice(0, 8);
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
