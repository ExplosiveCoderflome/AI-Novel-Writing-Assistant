export type KnowledgeDocumentStatus = "enabled" | "disabled" | "archived";
export type KnowledgeDocumentKind = "user_upload" | "analysis_published";
export type KnowledgeIndexStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
export type KnowledgeBindingTargetType = "novel" | "world";

export interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  kind: KnowledgeDocumentKind;
  sourceAnalysisId?: string | null;
  status: KnowledgeDocumentStatus;
  activeVersionId?: string | null;
  activeVersionNumber: number;
  latestIndexStatus: KnowledgeIndexStatus;
  latestIndexError?: string | null;
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

export interface DocumentChapter {
  id: string;
  documentVersionId: string;
  chapterIndex: number;
  title: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
  summary?: string | null;
  splitter?: "rule" | "llm" | "single";
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChapterSplitResult {
  documentVersionId: string;
  splitter: "rule" | "llm" | "single";
  chapters: DocumentChapter[];
}

export interface KnowledgeBinding {
  id: string;
  targetType: KnowledgeBindingTargetType;
  targetId: string;
  documentId: string;
  sourceAnalysisId?: string | null;
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
  source: "vector" | "keyword" | "reranked";
  title?: string;
  contextPrefix?: string;
  chunkText: string;
  chunkOrder: number;
}

export interface KnowledgeRecallTestResult {
  documentId: string;
  query: string;
  hits: KnowledgeRecallTestHit[];
}
