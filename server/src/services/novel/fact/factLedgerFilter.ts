import type {
  ChapterExecutionMissingObligation,
  ChapterExecutionObligationCoverage,
} from "@ai-novel/shared/types/chapterRuntime";
import type { NovelFactWriteItem } from "./NovelFactService";

export type FactLedgerExclusionReason =
  | "acceptance_gate_unavailable"
  | "coverage_unmet"
  | "missing_must_hit_now"
  | "unmatched_missing_must_hit_now";

export interface FactLedgerExcludedItem {
  text: string;
  reason: FactLedgerExclusionReason;
  matchedMissingKind?: ChapterExecutionMissingObligation["kind"];
  matchedMissingSummary?: string;
  matchScore?: number;
}

export interface FilterAcceptedFactItemsInput {
  chapterOrder: number;
  mustHitNow: string[];
  obligationCoverage: ChapterExecutionObligationCoverage;
  acceptanceRiskTags: string[];
}

export interface FilterAcceptedFactItemsResult {
  accepted: NovelFactWriteItem[];
  excluded: FactLedgerExcludedItem[];
}

interface CandidateMatch {
  index: number;
  score: number;
  matched: boolean;
}

const SIMILARITY_MATCH_THRESHOLD = 0.32;

function normalizeObligationText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function buildNGrams(value: string, size = 2): Set<string> {
  if (value.length <= size) {
    return new Set(value ? [value] : []);
  }
  const grams = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    grams.add(value.slice(index, index + size));
  }
  return grams;
}

function nGramSimilarity(left: string, right: string): number {
  const leftGrams = buildNGrams(left);
  const rightGrams = buildNGrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      overlap += 1;
    }
  }
  return (2 * overlap) / (leftGrams.size + rightGrams.size);
}

function scoreObligationMatch(sourceText: string, missingSummary: string): { score: number; matched: boolean } {
  const source = normalizeObligationText(sourceText);
  const missing = normalizeObligationText(missingSummary);
  if (!source || !missing) {
    return { score: 0, matched: false };
  }
  if (source === missing) {
    return { score: 1, matched: true };
  }
  if (source.includes(missing) || missing.includes(source)) {
    return { score: 0.95, matched: true };
  }
  const score = nGramSimilarity(source, missing);
  return {
    score,
    matched: score >= SIMILARITY_MATCH_THRESHOLD,
  };
}

function findBestCandidate(
  candidates: string[],
  excludedIndexes: Set<number>,
  missingSummary: string,
): CandidateMatch | null {
  let best: CandidateMatch | null = null;
  for (let index = 0; index < candidates.length; index += 1) {
    if (excludedIndexes.has(index)) {
      continue;
    }
    const scored = scoreObligationMatch(candidates[index], missingSummary);
    if (!best || scored.score > best.score) {
      best = {
        index,
        score: scored.score,
        matched: scored.matched,
      };
    }
  }
  return best;
}

function toAcceptedFact(chapterOrder: number, text: string): NovelFactWriteItem {
  return {
    text: `第${chapterOrder}章已完成：${text}`,
    category: "completed",
  };
}

function excludeAll(
  mustHitNow: string[],
  reason: FactLedgerExclusionReason,
): FactLedgerExcludedItem[] {
  return mustHitNow.map((text) => ({ text, reason }));
}

export function filterAcceptedFactItems(input: FilterAcceptedFactItemsInput): FilterAcceptedFactItemsResult {
  const mustHitNow = input.mustHitNow.map((item) => item.trim()).filter(Boolean);
  if (mustHitNow.length === 0) {
    return { accepted: [], excluded: [] };
  }

  const riskTags = new Set(input.acceptanceRiskTags.map((tag) => tag.trim()).filter(Boolean));
  if (riskTags.has("acceptance_gate_unavailable")) {
    return {
      accepted: [],
      excluded: excludeAll(mustHitNow, "acceptance_gate_unavailable"),
    };
  }

  if (input.obligationCoverage.status === "unmet") {
    return {
      accepted: [],
      excluded: excludeAll(mustHitNow, "coverage_unmet"),
    };
  }

  if (input.obligationCoverage.status === "satisfied") {
    return {
      accepted: mustHitNow.map((text) => toAcceptedFact(input.chapterOrder, text)),
      excluded: [],
    };
  }

  const excludedIndexes = new Set<number>();
  const excluded: FactLedgerExcludedItem[] = [];
  const missingMustHitNow = input.obligationCoverage.missing
    .filter((item) => item.kind === "must_hit_now");

  for (const missing of missingMustHitNow) {
    const best = findBestCandidate(mustHitNow, excludedIndexes, missing.summary);
    if (!best) {
      continue;
    }
    excludedIndexes.add(best.index);
    excluded.push({
      text: mustHitNow[best.index],
      reason: best.matched ? "missing_must_hit_now" : "unmatched_missing_must_hit_now",
      matchedMissingKind: missing.kind,
      matchedMissingSummary: missing.summary,
      matchScore: Number(best.score.toFixed(3)),
    });
  }

  return {
    accepted: mustHitNow
      .filter((_text, index) => !excludedIndexes.has(index))
      .map((text) => toAcceptedFact(input.chapterOrder, text)),
    excluded,
  };
}
