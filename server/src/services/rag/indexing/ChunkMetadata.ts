import type { RagChunkCandidate } from "../types";

export function chunkMetadata(candidates: RagChunkCandidate[]) {
  return candidates.map((item) => ({
    id: item.id, tenantId: item.tenantId, ownerType: item.ownerType, ownerId: item.ownerId,
    novelId: item.novelId ?? null, worldId: item.worldId ?? null, title: item.title ?? null,
    chunkText: item.chunkText, chunkHash: item.chunkHash, chunkOrder: item.chunkOrder,
    tokenEstimate: item.tokenEstimate, language: item.language, metadataJson: item.metadataJson ?? null,
    facetKeys: item.facetKeys ?? null, chapterAnchor: item.chapterAnchor ?? null,
    embedProvider: item.embedProvider, embedModel: item.embedModel, embedVersion: item.embedVersion, indexedAt: new Date(),
  }));
}
