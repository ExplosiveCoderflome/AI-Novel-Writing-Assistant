import { apiClient } from "./client";
import type { OutlineFeedbackStatus, OutlineFeedbackSettings, OutlineFeedbackDecisionResult, OutlineFeedbackRunReceipt } from "@ai-novel/shared/types/outlineFeedback";

const options = { errorPresentation: "inline" as const };
export const getOutlineFeedback = async (id: string) => (await apiClient.get(`/outlines/${id}/feedback`, options)).data.data as OutlineFeedbackStatus;
export const saveOutlineFeedbackSettings = async (id: string, input: OutlineFeedbackSettings) => (await apiClient.patch(`/outlines/${id}/feedback/settings`, input, options)).data.data as OutlineFeedbackSettings;
export const analyzeOutlineFeedback = async (id: string, chapterId: string) => (await apiClient.post(`/outlines/${id}/feedback/analyze`, { chapterId, requestKey: crypto.randomUUID() }, options)).data.data as OutlineFeedbackRunReceipt;
export const retryOutlineFeedback = async (id: string, runId: string) => (await apiClient.post(`/outlines/${id}/feedback/${runId}/retry`, {}, options)).data.data as OutlineFeedbackRunReceipt;
export const decideOutlineFeedback = async (id: string, runId: string, operationIds: string[], decision: "adopt" | "reject") => (await apiClient.post(`/outlines/${id}/feedback/${runId}/${decision}`, { operationIds }, options)).data.data as OutlineFeedbackDecisionResult;
