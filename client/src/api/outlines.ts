import { apiClient } from "./client";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";

export interface OutlineProject { id: string; title: string; currentVersion: number; updatedAt: string; document?: OutlineDocument | null; }
export const listOutlines = async () => (await apiClient.get("/outlines")).data.data as OutlineProject[];
export const createOutline = async (title: string) => (await apiClient.post("/outlines", { title })).data.data as OutlineProject;
export const getOutline = async (id: string) => (await apiClient.get(`/outlines/${id}`)).data.data as OutlineProject;
export const saveOutline = async (id: string, expectedVersion: number, document: OutlineDocument) => (await apiClient.put(`/outlines/${id}/document`, { expectedVersion, document })).data.data;
export const generateOutlineProposal = async (id: string, requestText: string, kind: "edit" | "initial_generation" = "edit") => (await apiClient.post(`/outlines/${id}/proposals/generate`, { requestText, kind })).data.data;
export const applyOutlineProposal = async (id: string, proposalId: string, operationIds?: string[]) => (await apiClient.post(`/outlines/${id}/proposals/${proposalId}/apply`, { operationIds })).data.data;
export const exportOutline = async (id: string, format: "json" | "markdown") => (await apiClient.get(`/outlines/${id}/export`, { params: { format } })).data.data;
export const listOutlineRevisions = async (id: string) => (await apiClient.get(`/outlines/${id}/revisions`)).data.data;
