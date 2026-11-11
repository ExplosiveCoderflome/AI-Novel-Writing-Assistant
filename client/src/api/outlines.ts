import { apiClient } from "./client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";

export interface OutlineProject {
  id: string;
  title: string;
  currentVersion: number;
  updatedAt: string;
  boundNovelId?: string | null;
  document?: OutlineDocument | null;
}

export type OutlineProposalKind = "edit" | "initial_generation";
export type OutlineOperationKind = "add_node" | "update_fields" | "remove_node" | "move_node";
export type OutlineNodeType = "volume" | "chapter" | "character" | "payoff" | "fact";

export interface OutlineProposalOperation {
  operationId: string;
  kind: OutlineOperationKind;
  nodeType?: OutlineNodeType;
  nodeId?: string;
  clientRef?: string;
  parentNodeId?: string;
  fields?: Record<string, unknown>;
  reason: string;
  affectedNodeIds: string[];
  dependsOn: string[];
  risks: string[];
}

export interface OutlineEditProposalPayload {
  operations: OutlineProposalOperation[];
}

export interface OutlineInitialNode {
  clientRef: string;
  title: string;
  summary: string;
  planningDepth: "rough" | "detailed";
  reason?: string;
  volumeRef?: string;
  role?: string;
  setupDescription?: string;
  payoffDescription?: string;
  content?: string;
}

export interface OutlineInitialProposalPayload {
  storyFields: {
    title: string;
    premise: string;
    synopsis: string;
    theme: string;
    tone: string;
    endingDirection: string;
  };
  volumes: OutlineInitialNode[];
  chapters: OutlineInitialNode[];
  characters: OutlineInitialNode[];
  payoffs: OutlineInitialNode[];
  facts: OutlineInitialNode[];
}

export interface OutlineProposal {
  id: string;
  projectId: string;
  baseVersion: number;
  kind: OutlineProposalKind;
  status: string;
  requestText?: string | null;
  proposalJson: string;
}

export interface OutlineRevisionSummary {
  id: string;
  projectId: string;
  version: number;
  parentRevisionId?: string | null;
  sourceType: string;
  diffSummary?: string | null;
  createdAt: string;
}

export interface OutlineBookBindingSummary {
  novelId: string;
  novelTitle: string;
  sourceRevisionId: string;
  sourceRevisionVersion: number;
  sourceRoute: string;
}

export interface OutlineRevision extends OutlineRevisionSummary {
  document: OutlineDocument;
}

export interface OutlineOpenBookSettings {
  title: string;
  estimatedChapterCount: number;
  defaultChapterLength: number;
  worldId?: string;
  genreId?: string;
}

export interface OutlineOpenBookVolumeBudget {
  nodeId: string;
  chapterCount: number;
}

export interface OutlineOpenBookPreviewRequest {
  revisionId: string;
  expectedProjectVersion: number;
  bookSettings: OutlineOpenBookSettings;
  volumeQuotas: OutlineOpenBookVolumeBudget[];
  allowOptimize: Array<{ nodeId: string; field: string }>;
}

export interface OutlineOpenBookPreview {
  revisionId: string;
  revisionVersion: number;
  currentVersion: number;
  sourceDocumentHash: string;
  requestHash: string;
  settings: OutlineOpenBookSettings;
  mapping: Record<string, unknown>;
  policy: Record<string, unknown>;
  warnings: Array<{ code: string; message: string }>;
  counts: { volumes: number; chapters: number; characters: number; payoffs: number };
  errors?: Array<{ code: string; message: string; nodeId?: string; field?: string }>;
  [key: string]: unknown;
}

export interface OutlineOpenBookBinding {
  bindingId: string;
  novelId: string;
  revisionId: string;
  sourceDocumentHash: string;
  policyVersion: number;
  projectId: string;
  title: string;
  revisionVersion: number;
  currentVersion: number;
  sourceRoute: string;
  mapping: OutlineOpenBookPreview["mapping"];
  policy: Record<string, unknown>;
  setupState: unknown;
  [key: string]: unknown;
}

export interface OutlineBookBindingView extends OutlineOpenBookBinding {
  plannedPayoffs?: unknown[];
  sourceDifferences?: unknown[];
}

export interface OutlineOpenBookCreateRequest extends OutlineOpenBookPreviewRequest {
  requestHash: string;
  idempotencyKey: string;
}

export interface OutlineOpenBookCreateResponse extends OutlineBookBindingView {
  replayed: boolean;
}

export interface OutlineChange {
  nodeId: string;
  kind: "added" | "removed" | "updated" | "moved";
  before?: unknown;
  after?: unknown;
}

export interface OutlineImportCoverage {
  nodeId: string;
  clientRef: string;
  chunkIndex: number;
  start: number;
  end: number;
  text: string;
}

export interface OutlineImportPreview {
  token: string;
  document: OutlineDocument;
  unclassified: string[];
  coverage: OutlineImportCoverage[];
  unmatchedSources: Array<{
    nodeId: string;
    clientRef: string;
    chunkIndex: number;
    sourceFragment: string;
  }>;
  sourceLength: number;
  coveredLength: number;
}

export const listOutlines = async () => (await apiClient.get("/outlines")).data.data as OutlineProject[];
export const createOutline = async (title: string) => (await apiClient.post("/outlines", { title })).data.data as { project: OutlineProject; revision: OutlineRevisionSummary; document: OutlineDocument };
export const getOutline = async (id: string) => (await apiClient.get(`/outlines/${id}`)).data.data as OutlineProject;
export const saveOutline = async (id: string, expectedVersion: number, document: OutlineDocument) => (await apiClient.put(`/outlines/${id}/document`, { expectedVersion, document })).data.data as { revision: OutlineRevisionSummary; document: OutlineDocument };
export const generateOutlineProposal = async (id: string, requestText: string, kind: OutlineProposalKind = "edit") => (await apiClient.post(`/outlines/${id}/proposals/generate`, { requestText, kind })).data.data as OutlineProposal;
export const applyOutlineProposal = async (id: string, proposalId: string, operationIds?: string[]) => (await apiClient.post(`/outlines/${id}/proposals/${proposalId}/apply`, { operationIds })).data.data as { revision: OutlineRevisionSummary; document: OutlineDocument };
export const exportOutline = async (id: string, format: "json" | "markdown") => (await apiClient.get(`/outlines/${id}/export`, { params: { format } })).data.data;
export const listOutlineRevisions = async (id: string) => (await apiClient.get(`/outlines/${id}/revisions`)).data.data as OutlineRevisionSummary[];
export const getOutlineRevision = async (id: string, revisionId: string) => (await apiClient.get(`/outlines/${id}/revisions/${revisionId}`)).data.data as OutlineRevision;
export const compareOutlineRevisions = async (id: string, from: number, to: number) => (await apiClient.get(`/outlines/${id}/diff`, { params: { from, to } })).data.data as OutlineChange[];
export const restoreOutlineRevision = async (id: string, revisionId: string, expectedVersion: number) => (await apiClient.post(`/outlines/${id}/revisions/${revisionId}/restore`, { expectedVersion })).data.data as { revision: OutlineRevisionSummary; document: OutlineDocument };
export const previewOutlineOpenBook = async (id: string, request: OutlineOpenBookPreviewRequest) => (await apiClient.post(`/outlines/${id}/open-book/preview`, request, { errorPresentation: "inline" })).data.data as OutlineOpenBookPreview;
export const createOutlineOpenBook = async (id: string, request: OutlineOpenBookCreateRequest) => (await apiClient.post(`/outlines/${id}/open-book`, request, { errorPresentation: "inline" })).data.data as OutlineOpenBookCreateResponse;
export const getOutlineBookBinding = async (id: string) => {
  const response = await apiClient.get(`/outlines/${id}/book-binding`, {
    errorPresentation: "inline",
    validateStatus: status => status === 404 || (status >= 200 && status < 300),
  });
  return response.status === 404 ? null : response.data.data as OutlineOpenBookBinding;
};
export const retryOutlineBookSetup = async (id: string, expectedPolicyVersion: number, idempotencyKey: string) => (await apiClient.post(`/outlines/${id}/book-binding/retry-setup`, { expectedPolicyVersion, idempotencyKey }, { errorPresentation: "inline" })).data.data as OutlineBookBindingView;
export const updateOutlineBookPolicy = async (id: string, input: { expectedPolicyVersion: number; changes: Array<{ nodeId: string; field: string; mode?: "preserve" | "fill_missing" | "propose_change" | "hard_constraint"; value?: unknown }>; confirmHardConstraintChange?: boolean }) => (await apiClient.patch(`/outlines/${id}/book-binding/policy`, input, { errorPresentation: "inline" })).data.data;
export const previewOutlineImport = async (input: { title: string; text: string; format: "markdown" | "text" }) => (await apiClient.post("/outlines/import/preview", input)).data.data as OutlineImportPreview;
export const confirmOutlineImport = async (token: string, document: OutlineDocument) => (await apiClient.post("/outlines/import/confirm", { token, document })).data.data as { project: OutlineProject };
