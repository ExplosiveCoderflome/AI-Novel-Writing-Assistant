import { apiClient } from "./client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { OutlineOpenBookInput, OutlineOpenBookConfirm, OutlineOpenBookPreview, OutlineBookBindingView, OutlineOpenBookResult, OutlinePolicyPatch } from "@ai-novel/shared/types/outlineOpenBook";
import type { OutlineFeedbackDecisionResult, OutlineFeedbackRunReceipt, OutlineFeedbackSettings, OutlineFeedbackStatus } from "@ai-novel/shared/types/outlineFeedback";
export type { OutlineFeedbackDecisionResult, OutlineFeedbackRunReceipt, OutlineFeedbackSettings, OutlineFeedbackStatus } from "@ai-novel/shared/types/outlineFeedback";
export type { OutlineOpenBookInput, OutlineOpenBookConfirm, OutlineOpenBookPreview, OutlineBookBindingView, OutlineOpenBookResult } from "@ai-novel/shared/types/outlineOpenBook";

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

export interface OutlineRevision extends OutlineRevisionSummary {
  document: OutlineDocument;
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
export const previewOutlineOpenBook = async (id: string, request: OutlineOpenBookInput) => (await apiClient.post(`/outlines/${id}/open-book/preview`, request, { errorPresentation: "inline" })).data.data as OutlineOpenBookPreview;
export const createOutlineOpenBook = async (id: string, request: OutlineOpenBookConfirm) => (await apiClient.post(`/outlines/${id}/open-book`, request, { errorPresentation: "inline" })).data.data as OutlineOpenBookResult;
// Unbound projects return 200/null; a missing project is a real 404.
export const getOutlineBookBinding = async (id: string) => (await apiClient.get(`/outlines/${id}/book-binding`, { errorPresentation: "inline" })).data.data as OutlineBookBindingView | null;
export const retryOutlineBookSetup = async (id: string, expectedPolicyVersion: number, idempotencyKey: string) => (await apiClient.post(`/outlines/${id}/book-binding/retry-setup`, { expectedPolicyVersion, idempotencyKey }, { errorPresentation: "inline" })).data.data as OutlineBookBindingView;
export const updateOutlineBookPolicy = async (id: string, input: OutlinePolicyPatch) => (await apiClient.patch(`/outlines/${id}/book-binding/policy`, input, { errorPresentation: "inline" })).data.data;
export const previewOutlineImport = async (input: { title: string; text: string; format: "markdown" | "text" }) => (await apiClient.post("/outlines/import/preview", input)).data.data as OutlineImportPreview;
export const confirmOutlineImport = async (token: string, document: OutlineDocument) => (await apiClient.post("/outlines/import/confirm", { token, document })).data.data as { project: OutlineProject };
export const getOutlineFeedbackStatus = async (id: string) =>
  (await apiClient.get(`/outlines/${id}/feedback`, { errorPresentation: "inline" })).data.data as OutlineFeedbackStatus;
export const updateOutlineFeedbackSettings = async (id: string, settings: OutlineFeedbackSettings) =>
  (await apiClient.patch(`/outlines/${id}/feedback/settings`, settings, { errorPresentation: "inline" })).data.data as OutlineFeedbackSettings;
export const analyzeOutlineFeedback = async (id: string, input: { chapterId: string; requestKey: string }) =>
  (await apiClient.post(`/outlines/${id}/feedback/analyze`, input, { errorPresentation: "inline" })).data.data as OutlineFeedbackRunReceipt;
export const listOutlineFeedbackProposals = async (id: string) =>
  (await apiClient.get(`/outlines/${id}/feedback/proposals`, { errorPresentation: "inline" })).data.data;
export const retryOutlineFeedbackRun = async (id: string, runId: string) =>
  (await apiClient.post(`/outlines/${id}/feedback/${runId}/retry`, {}, { errorPresentation: "inline" })).data.data as OutlineFeedbackRunReceipt;
export const adoptOutlineFeedback = async (id: string, runId: string, operationIds: string[]) =>
  (await apiClient.post(`/outlines/${id}/feedback/${runId}/adopt`, { operationIds }, { errorPresentation: "inline" })).data.data as OutlineFeedbackDecisionResult;
export const rejectOutlineFeedback = async (id: string, runId: string, operationIds: string[]) =>
  (await apiClient.post(`/outlines/${id}/feedback/${runId}/reject`, { operationIds }, { errorPresentation: "inline" })).data.data as OutlineFeedbackDecisionResult;
