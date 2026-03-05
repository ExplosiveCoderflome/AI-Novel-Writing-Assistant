export const RAG_OWNER_TYPES = [
  "novel",
  "chapter",
  "world",
  "character",
  "bible",
  "chapter_summary",
  "consistency_fact",
  "character_timeline",
  "world_library_item",
  "chat_message",
] as const;

export type RagOwnerType = (typeof RAG_OWNER_TYPES)[number];

export const RAG_JOB_TYPES = ["upsert", "delete", "rebuild"] as const;
export type RagJobType = (typeof RAG_JOB_TYPES)[number];

export const RAG_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type RagJobStatus = (typeof RAG_JOB_STATUSES)[number];

export interface RagSourceDocument {
  ownerType: RagOwnerType;
  ownerId: string;
  tenantId: string;
  title?: string;
  content: string;
  novelId?: string;
  worldId?: string;
  metadata?: Record<string, unknown>;
}

export interface RagChunkCandidate {
  id: string;
  ownerType: RagOwnerType;
  ownerId: string;
  tenantId: string;
  title?: string;
  chunkText: string;
  chunkHash: string;
  chunkOrder: number;
  tokenEstimate: number;
  language: string;
  metadataJson?: string;
  embedProvider: string;
  embedModel: string;
  embedVersion: number;
  novelId?: string;
  worldId?: string;
}

export interface RetrievedChunk {
  id: string;
  ownerType: RagOwnerType;
  ownerId: string;
  score: number;
  title?: string;
  chunkText: string;
  chunkOrder: number;
  novelId?: string;
  worldId?: string;
  metadataJson?: string;
  source: "vector" | "keyword";
}

export interface RagSearchOptions {
  tenantId?: string;
  novelId?: string;
  worldId?: string;
  ownerTypes?: RagOwnerType[];
  vectorCandidates?: number;
  keywordCandidates?: number;
  finalTopK?: number;
}
