import { ragConfig } from "../../config/rag";
import type { RetrievedChunk } from "./types";

export interface RagRerankerDocument {
  id: string;
  text: string;
  title?: string;
  ownerType: string;
  ownerId: string;
}

export interface RagRerankerInput {
  query: string;
  documents: RagRerankerDocument[];
  topK: number;
  model?: string;
}

export interface RagRerankerResult {
  id?: string;
  index?: number;
  relevanceScore: number;
}

export interface RagRerankerOutput {
  used: boolean;
  results: RagRerankerResult[];
  error?: string;
}

type RawRerankerResult = Record<string, unknown>;

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeScore(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRawResult(item: unknown): RagRerankerResult | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item as RawRerankerResult;
  const relevanceScore = normalizeScore(
    record.relevance_score ?? record.relevanceScore ?? record.score ?? record.rank_score,
  );
  if (relevanceScore == null) {
    return null;
  }
  const rawIndex = normalizeScore(record.index ?? record.document_index ?? record.documentIndex);
  return {
    id: normalizeOptionalText(record.id ?? record.document_id ?? record.documentId),
    index: rawIndex == null ? undefined : Math.floor(rawIndex),
    relevanceScore,
  };
}

function normalizeResults(payload: unknown): RagRerankerResult[] {
  const rawResults = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && !Array.isArray(payload)
      ? ((payload as Record<string, unknown>).results ?? (payload as Record<string, unknown>).data)
      : [];
  if (!Array.isArray(rawResults)) {
    return [];
  }
  return rawResults.flatMap((item) => {
    const normalized = normalizeRawResult(item);
    return normalized ? [normalized] : [];
  });
}

function buildHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(ragConfig.rerankerApiKey ? { Authorization: `Bearer ${ragConfig.rerankerApiKey}` } : {}),
  };
}

export function resolveRerankerCandidateLimit(finalTopK: number, override?: number): number {
  if (override && Number.isFinite(override) && override > 0) {
    return Math.min(200, Math.floor(override));
  }
  if (ragConfig.rerankerCandidateLimit > 0) {
    return Math.min(200, ragConfig.rerankerCandidateLimit);
  }
  return Math.min(Math.max(finalTopK * 5, 30), 80);
}

export class RagRerankerService {
  async rerank(input: RagRerankerInput): Promise<RagRerankerOutput> {
    if (!ragConfig.rerankerEnabled || !ragConfig.rerankerEndpoint || input.documents.length === 0) {
      return { used: false, results: [] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ragConfig.rerankerTimeoutMs);
    try {
      const response = await fetch(ragConfig.rerankerEndpoint, {
        method: "POST",
        headers: buildHeaders(),
        signal: controller.signal,
        body: JSON.stringify({
          query: input.query,
          documents: input.documents.map((document, index) => ({
            id: document.id,
            index,
            text: document.text,
            title: document.title,
            ownerType: document.ownerType,
            ownerId: document.ownerId,
          })),
          topK: input.topK,
          model: input.model ?? ragConfig.rerankerModel,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return {
          used: false,
          results: [],
          error: `reranker request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        };
      }
      return {
        used: true,
        results: normalizeResults(await response.json()),
      };
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? `reranker request timed out (>${ragConfig.rerankerTimeoutMs}ms)`
        : error instanceof Error
          ? error.message
          : String(error);
      return { used: false, results: [], error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  applyResults(chunks: RetrievedChunk[], results: RagRerankerResult[]): RetrievedChunk[] {
    if (chunks.length === 0 || results.length === 0) {
      return chunks;
    }

    const byId = new Map(chunks.map((chunk, index) => [chunk.id, { chunk, index }]));
    const selected = new Set<number>();
    const reranked: RetrievedChunk[] = [];
    for (const result of results) {
      const byResultId = result.id ? byId.get(result.id) : undefined;
      const matchedIndex = byResultId?.index ?? (
        result.index != null && result.index >= 0 && result.index < chunks.length ? result.index : undefined
      );
      if (matchedIndex == null || selected.has(matchedIndex)) {
        continue;
      }
      selected.add(matchedIndex);
      reranked.push({
        ...chunks[matchedIndex],
        score: result.relevanceScore,
        source: "reranked",
        retrievalSource: "reranked",
      });
    }

    if (reranked.length === 0) {
      return chunks;
    }

    const tail = chunks.filter((_chunk, index) => !selected.has(index));
    return [...reranked, ...tail];
  }
}
