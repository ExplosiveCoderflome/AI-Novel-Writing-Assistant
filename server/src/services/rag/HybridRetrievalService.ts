import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import { compactSnippet, normalizeRagText, toKeywordTerms } from "./utils";
import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import { resolveKnowledgeDocumentIds } from "../knowledge/common";
import { RAG_OWNER_TYPES, type RagOwnerType, type RagSearchOptions, type RetrievedChunk } from "./types";

const RRF_K = 60;
const NON_KNOWLEDGE_OWNER_TYPES = RAG_OWNER_TYPES.filter((item) => item !== "knowledge_document");

function toOwnerTypes(raw?: RagOwnerType[]): RagOwnerType[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  return Array.from(new Set(raw));
}

function toOwnerIds(raw?: string[]): string[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  return Array.from(new Set(raw.map((item) => item.trim()).filter(Boolean)));
}

interface SearchScopeOptions {
  tenantId: string;
  novelId?: string;
  worldId?: string;
  ownerTypes?: RagOwnerType[];
  ownerIds?: string[];
  vectorCandidates?: number;
  keywordCandidates?: number;
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
      .map((entry) => ({
        ...entry.item,
        score: entry.score,
      }));
  }

  /** 叙事距离衰减：与 currentChapterOrder 距离越远的章节 chunk 权重越低 */
  private applyNarrativeDecay(
    chunks: RetrievedChunk[],
    currentChapterOrder: number,
    decayRate: number,
  ): RetrievedChunk[] {
    return chunks.map((chunk) => {
      let chapterOrder: number | undefined;
      let importance: string | undefined;
      if (chunk.metadataJson) {
        try {
          const meta = JSON.parse(chunk.metadataJson) as Record<string, unknown>;
          chapterOrder = typeof meta.chapterOrder === "number" ? meta.chapterOrder : typeof meta.order === "number" ? meta.order : undefined;
          importance = typeof meta.importance === "string" ? meta.importance : undefined;
        } catch {
          // ignore
        }
      }
      if (chapterOrder == null) return chunk;
      const isCritical = importance === "critical";
      const distance = Math.abs(currentChapterOrder - chapterOrder);
      const decayFactor = isCritical ? 1 : Math.exp(-decayRate * distance);
      return { ...chunk, score: chunk.score * decayFactor };
    });
  }

  private async keywordSearch(query: string, options: SearchScopeOptions): Promise<RetrievedChunk[]> {
    const terms = toKeywordTerms(query);
    if (terms.length === 0) {
      return [];
    }
    const ownerTypes = toOwnerTypes(options.ownerTypes);
    const ownerIds = toOwnerIds(options.ownerIds);
    const rows = await prisma.knowledgeChunk.findMany({
      where: {
        tenantId: options.tenantId,
        ...(options.novelId ? { novelId: options.novelId } : {}),
        ...(options.worldId ? { worldId: options.worldId } : {}),
        ...(ownerTypes ? { ownerType: { in: ownerTypes } } : {}),
        ...(ownerIds ? { ownerId: { in: ownerIds } } : {}),
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

  private async vectorSearch(query: string, options: SearchScopeOptions): Promise<RetrievedChunk[]> {
    try {
      const embedding = await this.embeddingService.embedTexts([query]);
      const queryVector = embedding.vectors[0];
      if (!queryVector || queryVector.length === 0) {
        return [] as RetrievedChunk[];
      }
      await this.vectorStoreService.ensureCollection(queryVector.length);
      const searchRows = await this.vectorStoreService.search(queryVector, options.vectorCandidates ?? ragConfig.vectorCandidates, {
        tenantId: options.tenantId,
        novelId: options.novelId,
        worldId: options.worldId,
        ownerTypes: toOwnerTypes(options.ownerTypes),
        ownerIds: toOwnerIds(options.ownerIds),
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
    const finalTopK = options.finalTopK ?? ragConfig.finalTopK;
    const filteredBaseOwnerTypes = (options.ownerTypes ?? NON_KNOWLEDGE_OWNER_TYPES)
      .filter((item) => item !== "knowledge_document");
    const baseOwnerTypes = options.ownerTypes
      ? toOwnerTypes(filteredBaseOwnerTypes)
      : toOwnerTypes(NON_KNOWLEDGE_OWNER_TYPES);
    const knowledgeDocumentIds = await resolveKnowledgeDocumentIds({
      targetType: options.novelId ? "novel" : options.worldId ? "world" : undefined,
      targetId: options.novelId ?? options.worldId,
      knowledgeDocumentIds: options.knowledgeDocumentIds,
    });

    const baseScope: SearchScopeOptions | null = options.ownerTypes && filteredBaseOwnerTypes.length === 0
      ? null
      : {
        tenantId,
        novelId: options.novelId,
        worldId: options.worldId,
        ownerTypes: baseOwnerTypes,
        vectorCandidates: options.vectorCandidates,
        keywordCandidates: options.keywordCandidates,
      };
    const knowledgeScope: SearchScopeOptions | null = knowledgeDocumentIds.length > 0
      ? {
        tenantId,
        ownerTypes: ["knowledge_document"],
        ownerIds: knowledgeDocumentIds,
        vectorCandidates: options.vectorCandidates,
        keywordCandidates: options.keywordCandidates,
      }
      : null;

    const [
      baseVectorRows,
      baseKeywordRows,
      knowledgeVectorRows,
      knowledgeKeywordRows,
    ] = await Promise.all([
      baseScope ? this.vectorSearch(normalizedQuery, baseScope) : Promise.resolve([] as RetrievedChunk[]),
      baseScope ? this.keywordSearch(normalizedQuery, baseScope) : Promise.resolve([] as RetrievedChunk[]),
      knowledgeScope ? this.vectorSearch(normalizedQuery, knowledgeScope) : Promise.resolve([] as RetrievedChunk[]),
      knowledgeScope ? this.keywordSearch(normalizedQuery, knowledgeScope) : Promise.resolve([] as RetrievedChunk[]),
    ]);

    let fused = this.fuseRrf(
      [...baseVectorRows, ...knowledgeVectorRows],
      [...baseKeywordRows, ...knowledgeKeywordRows],
      finalTopK,
    );

    const currentChapterOrder = options.currentChapterOrder;
    const decayRate = options.narrativeDecayRate ?? 0.05;
    if (currentChapterOrder != null && Number.isFinite(currentChapterOrder)) {
      fused = this.applyNarrativeDecay(fused, currentChapterOrder, decayRate);
      fused = fused
        .sort((a, b) => b.score - a.score || a.chunkOrder - b.chunkOrder)
        .slice(0, finalTopK);
    }

    return fused;
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
