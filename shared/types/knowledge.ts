export type KnowledgeDocumentStatus = "enabled" | "disabled" | "archived";
export type KnowledgeIndexStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
export type KnowledgeBindingTargetType = "novel" | "world";

export interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  status: KnowledgeDocumentStatus;
  activeVersionId?: string | null;
  activeVersionNumber: number;
  latestIndexStatus: KnowledgeIndexStatus;
  lastIndexedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  content: string;
  contentHash: string;
  charCount: number;
  createdAt: string;
}

export interface KnowledgeBinding {
  id: string;
  targetType: KnowledgeBindingTargetType;
  targetId: string;
  documentId: string;
  createdAt: string;
}

export interface KnowledgeDocumentSummary extends KnowledgeDocument {
  versionCount: number;
  bookAnalysisCount: number;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  bookAnalysisCount: number;
  versions: Array<KnowledgeDocumentVersion & { isActive: boolean }>;
}

export interface KnowledgeRecallTestHit {
  id: string;
  ownerId: string;
  score: number;
  source: "vector" | "keyword";
  title?: string;
  chunkText: string;
  chunkOrder: number;
}

export interface KnowledgeRecallTestResult {
  documentId: string;
  query: string;
  hits: KnowledgeRecallTestHit[];
}
