import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient, type ApiHttpError } from "./client";

export type DirectorMode = "queued" | "running" | "waiting_gate" | "paused" | "completed" | "failed" | "cancelled";
export type DirectorDriver = "auto" | "assisted";

export interface DirectorAction {
  id: string;
  label: string;
  kind: "command" | "navigate";
  primary: boolean;
  command?: "resume" | "cancel" | "open_run";
  target?: string;
}

export interface DashboardView {
  runId: string;
  novelId: string;
  mode: DirectorMode;
  driver: DirectorDriver;
  headline: string;
  detail: string | null;
  progress: { done: number; total: number; source: "artifact_ledger" };
  debts: { count: number; chapterOrders: number[] };
  availableActions: DirectorAction[];
  sourceRoute: string;
  sourceTrace: {
    controlStatus: DirectorMode;
    controlVersion: number;
    pauseKind: "manual_recovery" | "replan" | "safety" | null;
    planVersion: string;
  };
}

export interface DirectorTimelineEvent {
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface DirectorRunDetail {
  view: DashboardView;
  timeline: DirectorTimelineEvent[];
}

export interface DirectorRunRecord {
  runId: string;
  novelId: string;
  statusLabel: string;
  headline: string;
  detail: string | null;
  progressLabel: string;
  sourceRoute: string;
  directorRoute: string;
}

export type DirectorCommand =
  | { type: "open_run"; novelId: string; driver: DirectorDriver; stepIdsInScope: string[] | null; idempotencyKey: string }
  | { type: "resolve_gate"; runId: string; decision: "confirm" | "confirm_after_edit" | "regenerate"; expectedVersion: number; idempotencyKey: string }
  | { type: "resume"; runId: string; expectedVersion: number; idempotencyKey: string }
  | { type: "handoff"; runId: string; toDriver: DirectorDriver; expectedVersion: number; idempotencyKey: string }
  | { type: "cancel"; runId: string; expectedVersion: number; idempotencyKey: string };

export async function getDirectorSummary(novelId: string): Promise<ApiResponse<DashboardView | null>> {
  try {
    const { data } = await apiClient.get<ApiResponse<DashboardView>>(
      `/director-next/novels/${encodeURIComponent(novelId)}/current`,
      { silentErrorStatuses: [404] },
    );
    return data;
  } catch (error) {
    const httpError = error as ApiHttpError;
    const details = httpError.details as { error?: string } | undefined;
    if (httpError.status === 404 && details?.error === "这本小说没有创作记录。") {
      return { success: true, data: null, message: "当前没有进行中的创作。" };
    }
    throw error;
  }
}

export async function getDirectorDetail(novelId: string): Promise<ApiResponse<DirectorRunDetail | null>> {
  const summary = await getDirectorSummary(novelId);
  if (!summary.data) {
    return { ...summary, data: null };
  }
  const { data } = await apiClient.get<ApiResponse<DashboardView & { timeline: DirectorTimelineEvent[] }>>(
    `/director-next/runs/${encodeURIComponent(summary.data.runId)}`,
  );
  return {
    ...data,
    data: data.data ? { view: data.data, timeline: data.data.timeline ?? [] } : undefined,
  };
}

export async function getDirectorRunDetail(runId: string): Promise<ApiResponse<DirectorRunDetail>> {
  const { data } = await apiClient.get<ApiResponse<DashboardView & { timeline: DirectorTimelineEvent[] }>>(
    `/director-next/runs/${encodeURIComponent(runId)}`,
  );
  return {
    ...data,
    data: data.data
      ? { view: data.data, timeline: data.data.timeline ?? [] }
      : undefined,
  };
}

export async function listDirectorRuns(options?: { needsAttention?: boolean; limit?: number }): Promise<ApiResponse<DirectorRunRecord[]>> {
  const { data } = await apiClient.get<ApiResponse<DirectorRunRecord[]>>("/director-next/records", {
    params: options,
  });
  return data;
}

export async function submitDirectorCommand(command: DirectorCommand): Promise<ApiResponse<{ runId: string; controlVersion: number }>> {
  const { data } = await apiClient.post<ApiResponse<{ runId: string; controlVersion: number }>>(
    "/director-next/commands",
    command,
  );
  return data;
}
