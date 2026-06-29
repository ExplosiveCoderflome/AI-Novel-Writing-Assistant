import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import type { RagSearchOptions, RetrievedChunk } from "./types";

type TraceStage = "vector" | "keyword" | "fusion" | "fallback" | "reranker" | "decay" | "hits";

interface TraceTimingSnapshot {
  vectorMs: number;
  keywordMs: number;
  fusionMs: number;
  rerankerMs: number;
  decayMs: number;
  totalMs: number;
}

interface TraceCandidateCounts {
  vector: number;
  keyword: number;
  fused: number;
  final: number;
}

export interface RagRetrievalTraceContext {
  query: string;
  tenantId: string;
  novelId?: string;
  worldId?: string;
  options: RagSearchOptions;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nestedValue) => {
    if (!nestedValue || typeof nestedValue !== "object" || Array.isArray(nestedValue)) {
      return nestedValue;
    }
    return Object.keys(nestedValue as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = (nestedValue as Record<string, unknown>)[key];
        return result;
      }, {});
  });
}

function digestQuery(query: string): string {
  return createHash("sha256").update(query).digest("hex");
}

function buildQueryPreview(query: string): string | null {
  if (ragConfig.retrievalTraceQueryPersistMode === "digest_only") {
    return null;
  }
  if (ragConfig.retrievalTraceQueryPersistMode === "full") {
    return query;
  }
  return query.slice(0, 120);
}

function snapshotHits(rows: RetrievedChunk[]): Array<{
  chunkId: string;
  ownerType: string;
  ownerId: string;
  score: number;
  rank: number;
  source: "vector" | "keyword";
}> {
  return rows.slice(0, 50).map((row, index) => ({
    chunkId: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    score: Number(row.score.toFixed(6)),
    rank: index + 1,
    source: row.source,
  }));
}

export class RagRetrievalTracer {
  private readonly enabled: boolean;
  private readonly startedAt = Date.now();
  private readonly timings: TraceTimingSnapshot = {
    vectorMs: 0,
    keywordMs: 0,
    fusionMs: 0,
    rerankerMs: 0,
    decayMs: 0,
    totalMs: 0,
  };
  private readonly candidateCounts: TraceCandidateCounts = {
    vector: 0,
    keyword: 0,
    fused: 0,
    final: 0,
  };
  private hits: ReturnType<typeof snapshotHits> = [];
  private fallbackTriggered = false;
  private rerankerUsed = false;
  private extraScope: Record<string, unknown> = {};

  constructor(private readonly context: RagRetrievalTraceContext) {
    this.enabled = ragConfig.retrievalTraceSampleRate > 0
      && Math.random() < ragConfig.retrievalTraceSampleRate;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  record(stage: TraceStage, payload: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    if (stage === "vector") {
      this.timings.vectorMs += Number(payload.elapsedMs ?? 0);
      this.candidateCounts.vector += Number(payload.count ?? 0);
      return;
    }
    if (stage === "keyword") {
      this.timings.keywordMs += Number(payload.elapsedMs ?? 0);
      this.candidateCounts.keyword += Number(payload.count ?? 0);
      return;
    }
    if (stage === "fusion") {
      this.timings.fusionMs += Number(payload.elapsedMs ?? 0);
      this.candidateCounts.fused = Number(payload.count ?? this.candidateCounts.fused);
      return;
    }
    if (stage === "fallback") {
      this.fallbackTriggered = Boolean(payload.triggered);
      return;
    }
    if (stage === "reranker") {
      this.timings.rerankerMs += Number(payload.elapsedMs ?? 0);
      this.rerankerUsed = Boolean(payload.used);
      return;
    }
    if (stage === "decay") {
      this.timings.decayMs += Number(payload.elapsedMs ?? 0);
      return;
    }
    if (stage === "hits") {
      const rows = Array.isArray(payload.rows) ? payload.rows as RetrievedChunk[] : [];
      this.candidateCounts.final = rows.length;
      this.hits = snapshotHits(rows);
    }
  }

  setScope(payload: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    this.extraScope = {
      ...this.extraScope,
      ...payload,
    };
  }

  flushAsync(): void {
    if (!this.enabled) {
      return;
    }
    this.timings.totalMs = Date.now() - this.startedAt;
    const options = this.context.options;
    const scopeJson = stableStringify({
      tenantId: this.context.tenantId,
      novelId: this.context.novelId,
      worldId: this.context.worldId,
      ownerTypes: options.ownerTypes,
      knowledgeDocumentIds: options.knowledgeDocumentIds,
      vectorCandidates: options.vectorCandidates,
      keywordCandidates: options.keywordCandidates,
      finalTopK: options.finalTopK,
      facets: options.facets,
      currentChapterOrder: options.currentChapterOrder,
      ...this.extraScope,
    });

    void prisma.ragRetrievalTrace.create({
      data: {
        tenantId: this.context.tenantId,
        novelId: this.context.novelId,
        worldId: this.context.worldId,
        queryDigest: digestQuery(this.context.query),
        queryPreview: buildQueryPreview(this.context.query),
        scopeJson,
        candidateCounts: JSON.stringify(this.candidateCounts),
        hitsJson: JSON.stringify(this.hits),
        timingsJson: JSON.stringify(this.timings),
        fallbackTriggered: this.fallbackTriggered,
        rerankerUsed: this.rerankerUsed,
      },
    }).catch((error) => {
      console.warn("[rag] failed to write retrieval trace", error);
    });
  }
}
