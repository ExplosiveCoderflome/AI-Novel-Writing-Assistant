import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import { compactSnippet, normalizeRagText, toKeywordTerms } from "./utils";
import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import type { RagOwnerType, RagSearchOptions, RetrievedChunk } from "./types";

const RRF_K = 60;

function toOwnerTypes(raw?: RagOwnerType[]): RagOwnerType[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  return Array.from(new Set(raw));
}

export class HybridRetrievalService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  private fuseRrf(vectorResults: RetrievedChunk[], keywordResults: RetrievedChunk[], finalTopK: number): RetrievedChunk[] {
    const scoreMap = new Map<string, { item: RetrievedChunk; score: number }>();

    vectorResults.forEach((item, index) => {
      const key = item.id;
      const current = scoreMap.get(key);
      const nextScore = (current?.score ?? 0) + 1 / (RRF_K + index + 1);
      scoreMap.set(key, {
        item: current?.item ?? item,
        score: nextScore,
      });
    });

    keywordResults.forEach((item, index) => {
      const key = item.id;
      const current = scoreMap.get(key);
      const nextScore = (current?.score ?? 0) + 1 / (RRF_K + index + 1);
      scoreMap.set(key, {
        item: current?.item ?? item,
        score: nextScore,
      });
    });

    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score || a.item.chunkOrder - b.item.chunkOrder)
      .slice(0, finalTopK)
      .map((entry) => entry.item);
  }

  private async keywordSearch(query: string, options: Required<Pick<RagSearchOptions, "tenantId">> & RagSearchOptions): Promise<RetrievedChunk[]> {
    const terms = toKeywordTerms(query);
    if (terms.length === 0) {
      return [];
    }
    const ownerTypes = toOwnerTypes(options.ownerTypes);
    const rows = await prisma.knowledgeChunk.findMany({
      where: {
        tenantId: options.tenantId,
        ...(options.novelId ? { novelId: options.novelId } : {}),
        ...(options.worldId ? { worldId: options.worldId } : {}),
        ...(ownerTypes ? { ownerType: { in: ownerTypes } } : {}),
        OR: terms.map((term) => ({
          chunkText: { contains: term },
        })),
      },
      orderBy: [{ updatedAt: "desc" }, { chunkOrder: "asc" }],
      take: options.keywordCandidates ?? ragConfig.keywordCandidates,
    });
    return rows.map((row) => ({
      id: row.id,
      ownerType: row.ownerType as RagOwnerType,
      ownerId: row.ownerId,
      score: 0,
      title: row.title ?? undefined,
      chunkText: row.chunkText,
      chunkOrder: row.chunkOrder,
      novelId: row.novelId ?? undefined,
      worldId: row.worldId ?? undefined,
      metadataJson: row.metadataJson ?? undefined,
      source: "keyword" as const,
    }));
  }

  async retrieve(query: string, options: RagSearchOptions = {}): Promise<RetrievedChunk[]> {
    if (!ragConfig.enabled) {
      return [];
    }
    const normalizedQuery = normalizeRagText(query);
    if (!normalizedQuery) {
      return [];
    }
    const tenantId = options.tenantId ?? ragConfig.defaultTenantId;
    const ownerTypes = toOwnerTypes(options.ownerTypes);
    const vectorCandidates = options.vectorCandidates ?? ragConfig.vectorCandidates;
    const keywordCandidates = options.keywordCandidates ?? ragConfig.keywordCandidates;
    const finalTopK = options.finalTopK ?? ragConfig.finalTopK;

    const keywordPromise = this.keywordSearch(normalizedQuery, {
      ...options,
      tenantId,
      ownerTypes,
      keywordCandidates,
    });

    const vectorPromise = (async () => {
      try {
        const embedding = await this.embeddingService.embedTexts([normalizedQuery]);
        const queryVector = embedding.vectors[0];
        if (!queryVector || queryVector.length === 0) {
          return [] as RetrievedChunk[];
        }
        await this.vectorStoreService.ensureCollection(queryVector.length);
        const searchRows = await this.vectorStoreService.search(queryVector, vectorCandidates, {
          tenantId,
          novelId: options.novelId,
          worldId: options.worldId,
          ownerTypes,
        });
        return searchRows.map((row) => ({
          id: row.id,
          ownerType: row.payload.ownerType,
          ownerId: row.payload.ownerId,
          score: row.score,
          title: row.payload.title,
          chunkText: row.payload.chunkText,
          chunkOrder: row.payload.chunkOrder,
          novelId: row.payload.novelId,
          worldId: row.payload.worldId,
          metadataJson: row.payload.metadataJson,
          source: "vector" as const,
        }));
      } catch {
        return [] as RetrievedChunk[];
      }
    })();

    const [vectorRows, keywordRows] = await Promise.all([vectorPromise, keywordPromise]);
    return this.fuseRrf(vectorRows, keywordRows, finalTopK);
  }

  async buildContextBlock(query: string, options: RagSearchOptions = {}): Promise<string> {
    const rows = await this.retrieve(query, options);
    if (rows.length === 0) {
      return "";
    }
    return rows
      .map((item, index) => {
        const sourceLabel = item.source === "vector" ? "vector" : "keyword";
        const title = item.title?.trim() ? ` | ${item.title.trim()}` : "";
        return `[RAG-${index + 1}] (${sourceLabel}) ${item.ownerType}:${item.ownerId}${title}\n${compactSnippet(item.chunkText)}`;
      })
      .join("\n\n");
  }
}
