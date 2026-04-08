import type { PayoffLedgerEvidence, PayoffLedgerSourceRef } from "@ai-novel/shared/types/payoffLedger";

export interface NovelChapterReferenceSeed {
  id: string;
  order: number;
}

export interface NovelChapterReferenceLookup {
  chapterIdSet: Set<string>;
  chapterIdByOrder: Map<number, string>;
}

export interface PayoffLedgerPromptChapterRefInput {
  currentStatus?: string | null;
  lastTouchedChapterOrder?: number | null;
  setupChapterId?: string | null;
  setupChapterOrder?: number | null;
  payoffChapterId?: string | null;
  payoffChapterOrder?: number | null;
  sourceRefs: PayoffLedgerSourceRef[];
  evidence: PayoffLedgerEvidence[];
}

export interface PayoffLedgerPreviousChapterRefState {
  lastTouchedChapterId?: string | null;
  setupChapterId?: string | null;
  payoffChapterId?: string | null;
}

export interface NormalizedPayoffLedgerPromptChapterRefs {
  lastTouchedChapterId: string | null;
  setupChapterId: string | null;
  payoffChapterId: string | null;
  sourceRefs: PayoffLedgerSourceRef[];
  evidence: PayoffLedgerEvidence[];
}

interface ResolveNovelChapterIdInput {
  rawChapterId?: string | null;
  chapterOrder?: number | null;
  fallbackChapterId?: string | null;
}

function normalizeChapterReference(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseChapterOrderCandidate(value: string | null | undefined): number | null {
  const normalized = normalizeChapterReference(value);
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/^(?:第)?(\d+)(?:章)?$/u);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

export function createNovelChapterReferenceLookup(
  chapters: NovelChapterReferenceSeed[],
): NovelChapterReferenceLookup {
  return {
    chapterIdSet: new Set(chapters.map((chapter) => chapter.id)),
    chapterIdByOrder: new Map(chapters.map((chapter) => [chapter.order, chapter.id])),
  };
}

export function resolveNovelChapterId(
  input: ResolveNovelChapterIdInput,
  lookup: NovelChapterReferenceLookup,
): string | null {
  const directId = normalizeChapterReference(input.rawChapterId);
  if (directId && lookup.chapterIdSet.has(directId)) {
    return directId;
  }

  const parsedOrder = parseChapterOrderCandidate(directId);
  if (typeof parsedOrder === "number") {
    const matchedId = lookup.chapterIdByOrder.get(parsedOrder);
    if (matchedId) {
      return matchedId;
    }
  }

  if (typeof input.chapterOrder === "number") {
    const matchedId = lookup.chapterIdByOrder.get(input.chapterOrder);
    if (matchedId) {
      return matchedId;
    }
  }

  const fallbackId = normalizeChapterReference(input.fallbackChapterId);
  if (fallbackId && lookup.chapterIdSet.has(fallbackId)) {
    return fallbackId;
  }

  return null;
}

function normalizeSourceRefs(
  sourceRefs: PayoffLedgerSourceRef[],
  lookup: NovelChapterReferenceLookup,
): PayoffLedgerSourceRef[] {
  return sourceRefs.map((ref) => ({
    ...ref,
    chapterId: resolveNovelChapterId(
      {
        rawChapterId: ref.chapterId ?? null,
        chapterOrder: ref.chapterOrder ?? null,
      },
      lookup,
    ),
  }));
}

function normalizeEvidence(
  evidence: PayoffLedgerEvidence[],
  lookup: NovelChapterReferenceLookup,
): PayoffLedgerEvidence[] {
  return evidence.map((item) => ({
    ...item,
    chapterId: resolveNovelChapterId(
      {
        rawChapterId: item.chapterId ?? null,
        chapterOrder: item.chapterOrder ?? null,
      },
      lookup,
    ),
  }));
}

export function normalizePayoffLedgerPromptChapterRefs(args: {
  item: PayoffLedgerPromptChapterRefInput;
  previous?: PayoffLedgerPreviousChapterRefState | null;
  lookup: NovelChapterReferenceLookup;
  currentChapterOrder?: number | null;
  sourceChapterId?: string | null;
}): NormalizedPayoffLedgerPromptChapterRefs {
  const { item, previous, lookup, currentChapterOrder, sourceChapterId } = args;
  const inferredLastTouchedChapterId = (
    typeof currentChapterOrder === "number"
    && item.lastTouchedChapterOrder === currentChapterOrder
  )
    ? sourceChapterId
    : null;

  return {
    lastTouchedChapterId: resolveNovelChapterId(
      {
        rawChapterId: inferredLastTouchedChapterId,
        chapterOrder: item.lastTouchedChapterOrder ?? null,
        fallbackChapterId: previous?.lastTouchedChapterId ?? null,
      },
      lookup,
    ),
    setupChapterId: resolveNovelChapterId(
      {
        rawChapterId: item.setupChapterId ?? null,
        chapterOrder: item.setupChapterOrder ?? null,
        fallbackChapterId: previous?.setupChapterId ?? null,
      },
      lookup,
    ),
    payoffChapterId: resolveNovelChapterId(
      {
        rawChapterId: item.payoffChapterId ?? null,
        chapterOrder: item.payoffChapterOrder ?? null,
        fallbackChapterId: previous?.payoffChapterId ?? null,
      },
      lookup,
    ),
    sourceRefs: normalizeSourceRefs(item.sourceRefs, lookup),
    evidence: normalizeEvidence(item.evidence, lookup),
  };
}
