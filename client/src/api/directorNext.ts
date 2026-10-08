import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient, type ApiHttpError } from "./client";
import type {SimpleCreationShelfProjection,VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {getSimpleCreationShelf,getNovelVolumeWorkspace} from "./novel";
import type {DirectorWorkspaceMaterials} from "@ai-novel/shared/types/director/workspace";

export type DirectorMode = "queued" | "running" | "waiting_gate" | "paused" | "completed" | "failed" | "cancelled";
export type DirectorDriver = "auto" | "assisted";
export interface DirectorReviewContext {
  type:string;novelId:string;runId:string;controlVersion:number;
  from?:number;to?:number;chapterId?:string;volumeId?:string;
}
export type DirectorWorkspace = Pick<SimpleCreationShelfProjection,"novel"|"chapters"> & {
  materials:DirectorWorkspaceMaterials;
  planning?:VolumePlanDocument;
  reviewContexts?:DirectorReviewContext[];
  reviewContextError?:string|null;
  executionPlans?: {id:string;order:number;title:string;taskSheet:string|null;sceneCards:string|null;targetWordCount:number|null;mustAvoid:string|null}[];
};
export async function getDirectorWorkspace(novelId:string): Promise<ApiResponse<DirectorWorkspace>> {
  try {return (await apiClient.get(`/director-next/novels/${encodeURIComponent(novelId)}/workspace`,{silentErrorStatuses:[404]})).data;}
  catch(error) {
    if ((error as ApiHttpError).status !== 404) throw error;
    const [shelf,planning]=await Promise.all([getSimpleCreationShelf(novelId),getNovelVolumeWorkspace(novelId)]);
    if (!shelf.data) return shelf;
    return {...shelf,data:{...shelf.data,planning:planning.data}};
  }
}

export async function listLegacyDirectorRuns() {
  const {data} = await apiClient.get<ApiResponse<DirectorRunRecord[]>>("/director-next/legacy-records",{params:{limit:50}});
  return data;
}

export interface DirectorAction {
  id: string;
  label: string;
  kind: "command" | "navigate";
  primary: boolean;
  command?: "resume" | "cancel" | "open_run" | "handoff";
  toDriver?: DirectorDriver;
  target?: string;
}

export interface DashboardView {
  runId: string;
  novelId: string;
  mode: DirectorMode;
  driver: DirectorDriver;
  headline: string;
  detail: string | null;
  nextActionGuidance: string;
  chapterProgress: {from:number;to:number;done:number;total:number;current:{order:number;title:string;phase:"generating_chapters"|"reviewing"|"repairing"|"finalizing"}|null}|null;
  nextLaunchRange: {from:number;to:number}|null;
  workspaceActivity?: import("@ai-novel/shared/types/director/generation").DirectorWorkspaceActivity;
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
  | { type: "open_run"; novelId: string; driver: DirectorDriver; stepIdsInScope: string[] | null; idempotencyKey: string; launchInput?: {
    storyInput: string; estimatedChapterCount: number; worldMode: "generate" | "reuse" | "skip"; targetMode: "opening" | "selected_volume";
    targetVolumeId?: string | null; provider: string; model: string; temperature?: number;
    executionRange?: {from: number; to: number}; issuePolicyMode?: "completion_first" | "quality_first";
  } }
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

let directorCommandSequence = 0;

/** Command deduplication identity, not an authentication token. LAN HTTP lacks randomUUID. */
export function createDirectorCommandKey(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const entropy = typeof crypto?.getRandomValues === "function"
    ? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")
    : Math.random().toString(36).slice(2);
  return `director-next:${Date.now()}:${++directorCommandSequence}:${entropy}`;
}

export async function submitDirectorCommand(command: DirectorCommand): Promise<ApiResponse<{ runId: string; controlVersion: number }>> {
  const { data } = await apiClient.post<ApiResponse<{ runId: string; controlVersion: number }>>(
    "/director-next/commands",
    command,
  );
  return data;
}

export async function getDirectorUsage(runId:string,params:{cursor?:string;limit?:number}={}) {
 const {data}=await apiClient.get<ApiResponse<import('@ai-novel/shared/types/llmUsage').LlmInvocationUsagePage>>(
 '/director-next/runs/'+encodeURIComponent(runId)+'/usage',{params});return data;
}
