import type {
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  KnowledgeRecallTestResult,
  KnowledgeDocumentStatus,
  KnowledgeDocumentSummary,
} from "@ai-novel/shared/types/knowledge";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface RagJobProgress {
  stage:
    | "queued"
    | "loading_source"
    | "chunking"
    | "embedding"
    | "ensuring_collection"
    | "deleting_existing"
    | "upserting_vectors"
    | "writing_metadata"
    | "completed"
    | "cancelled"
    | "failed";
  label: string;
  detail?: string;
  current?: number;
  total?: number;
  percent: number;
  documents?: number;
  chunks?: number;
  updatedAt: string;
}

export interface RagJobSummary {
  id: string;
  ownerType: string;
  ownerId: string;
  jobType: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lastError?: string | null;
  progress?: RagJobProgress;
  createdAt: string;
  updatedAt: string;
}

export interface RagHealthStatus {
  embedding: {
    ok: boolean;
    provider: string;
    model: string;
    detail?: string;
  };
  qdrant: {
    ok: boolean;
    detail?: string;
  };
  ok: boolean;
}

export async function listKnowledgeDocuments(params?: {
  keyword?: string;
  status?: KnowledgeDocumentStatus;
}) {
  const { data } = await apiClient.get<ApiResponse<KnowledgeDocumentSummary[]>>("/knowledge/documents", {
    params,
  });
  return data;
}

export async function getKnowledgeDocument(id: string) {
  const { data } = await apiClient.get<ApiResponse<KnowledgeDocumentDetail>>(`/knowledge/documents/${id}`);
  return data;
}

export async function createKnowledgeDocument(payload: {
  title?: string;
  fileName: string;
  content: string;
}) {
  const { data } = await apiClient.post<ApiResponse<KnowledgeDocumentDetail>>("/knowledge/documents", payload);
  return data;
}

export async function createKnowledgeDocumentVersion(id: string, payload: {
  fileName?: string;
  content: string;
}) {
  const { data } = await apiClient.post<ApiResponse<KnowledgeDocumentDetail>>(
    `/knowledge/documents/${id}/versions`,
    payload,
  );
  return data;
}

export async function activateKnowledgeDocumentVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<KnowledgeDocumentDetail>>(
    `/knowledge/documents/${id}/activate-version`,
    { versionId },
  );
  return data;
}

export async function reindexKnowledgeDocument(id: string) {
  const { data } = await apiClient.post<ApiResponse<KnowledgeDocument>>(`/knowledge/documents/${id}/reindex`, {});
  return data;
}

export async function updateKnowledgeDocumentStatus(id: string, status: KnowledgeDocumentStatus) {
  const { data } = await apiClient.patch<ApiResponse<KnowledgeDocument>>(`/knowledge/documents/${id}`, { status });
  return data;
}

export async function testKnowledgeDocumentRecall(id: string, payload: {
  query: string;
  limit?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<KnowledgeRecallTestResult>>(
    `/knowledge/documents/${id}/recall-test`,
    payload,
  );
  return data;
}

export async function getNovelKnowledgeDocuments(id: string) {
  const { data } = await apiClient.get<ApiResponse<KnowledgeDocumentSummary[]>>(`/novels/${id}/knowledge-documents`);
  return data;
}

export async function updateNovelKnowledgeDocuments(id: string, documentIds: string[]) {
  const { data } = await apiClient.put<ApiResponse<KnowledgeDocumentSummary[]>>(
    `/novels/${id}/knowledge-documents`,
    { documentIds },
  );
  return data;
}

export async function getWorldKnowledgeDocuments(id: string) {
  const { data } = await apiClient.get<ApiResponse<KnowledgeDocumentSummary[]>>(`/worlds/${id}/knowledge-documents`);
  return data;
}

export async function updateWorldKnowledgeDocuments(id: string, documentIds: string[]) {
  const { data } = await apiClient.put<ApiResponse<KnowledgeDocumentSummary[]>>(
    `/worlds/${id}/knowledge-documents`,
    { documentIds },
  );
  return data;
}

export async function getRagJobs(params?: {
  status?: RagJobSummary["status"];
  limit?: number;
}) {
  const { data } = await apiClient.get<ApiResponse<RagJobSummary[]>>("/rag/jobs", {
    params,
  });
  return data;
}

export async function getRagHealth() {
  const { data } = await apiClient.get<ApiResponse<RagHealthStatus>>("/rag/health");
  return data;
}
