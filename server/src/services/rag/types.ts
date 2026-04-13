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
  "knowledge_document",
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
  knowledgeDocumentIds?: string[];
  vectorCandidates?: number;
  keywordCandidates?: number;
  finalTopK?: number;
  /** 当前章节序号，用于叙事距离衰减：距离越近的章节权重越高 */
  currentChapterOrder?: number;
  /** 距离衰减系数，默认 0.05，越大衰减越快 */
  narrativeDecayRate?: number;
}
