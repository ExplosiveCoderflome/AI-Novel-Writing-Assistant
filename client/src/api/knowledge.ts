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

export interface RagJobCleanupResult {
  deletedCount: number;
  activeCount: number;
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

function buildStaleRagHealthResponse(previousHealth?: RagHealthStatus): ApiResponse<RagHealthStatus> {
  if (previousHealth) {
    return {
      success: false,
      data: previousHealth,
      message: "RAG health returned 304 Not Modified. Showing the last known status.",
    };
  }

  return {
    success: false,
    data: {
      embedding: {
        ok: false,
        provider: "-",
        model: "-",
        detail: "RAG health returned 304 Not Modified before any health payload was cached.",
      },
      qdrant: {
        ok: false,
        detail: "No cached Qdrant health status is available yet.",
      },
      ok: false,
    },
    message: "RAG health returned 304 Not Modified, but no cached health status was available.",
  };
}

function buildUnavailableRagHealthResponse(rawResponse?: ApiResponse<RagHealthStatus>): ApiResponse<RagHealthStatus> {
  if (rawResponse?.data) {
    return rawResponse;
  }

  return {
    success: false,
    data: {
      embedding: {
        ok: false,
        provider: "-",
        model: "-",
        detail: "RAG health check failed before embedding details were available.",
      },
      qdrant: {
        ok: false,
        detail: "RAG health check failed before Qdrant details were available.",
      },
      ok: false,
    },
    message: rawResponse?.message ?? rawResponse?.error ?? "RAG health check failed.",
  };
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

export async function clearFinishedRagJobs() {
  const { data } = await apiClient.delete<ApiResponse<RagJobCleanupResult>>("/rag/jobs/finished");
  return data;
}

export async function deleteRagJob(jobId: string) {
  const { data } = await apiClient.delete<ApiResponse<{
    jobId: string;
    deletedCount: number;
    status: RagJobSummary["status"];
  }>>(`/rag/jobs/${jobId}`);
  return data;
}

export async function getRagHealth(previousHealth?: RagHealthStatus) {
  const response = await apiClient.get<ApiResponse<RagHealthStatus>>("/rag/health", {
    validateStatus: (status) => (status >= 200 && status < 300) || status === 304 || status === 503,
  });

  if (response.status === 304) {
    if (response.data?.data) {
      return response.data;
    }
    return buildStaleRagHealthResponse(previousHealth);
  }

  if (response.status === 503) {
    return buildUnavailableRagHealthResponse(response.data);
  }

  return response.data;
}
