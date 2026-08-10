import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  AuditIssue,
  AuditReport,
  PayoffLedgerResponse,
  QualityScore,
  ReplanRecommendation,
  ReplanResult,
  ReviewIssue,
  StoryPlan,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";
import type { DraftOptimizePreview } from "./shared";

export async function reviewNovelChapter(
  id: string,
  chapterId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    content?: string;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      score: QualityScore;
      issues: ReviewIssue[];
      auditReports?: AuditReport[];
    }>
  >(`/novels/${id}/chapters/${chapterId}/review`, payload ?? {});
  return data;
}

export async function getNovelState(id: string) {
  const { data } = await apiClient.get<ApiResponse<StoryStateSnapshot | null>>(`/novels/${id}/state`);
  return data;
}

export async function getLatestStateSnapshot(id: string) {
  const { data } = await apiClient.get<ApiResponse<StoryStateSnapshot | null>>(`/novels/${id}/state-snapshots/latest`);
  return data;
}

export async function getNovelPayoffLedger(id: string, chapterOrder?: number) {
  const { data } = await apiClient.get<ApiResponse<PayoffLedgerResponse>>(`/novels/${id}/payoff-ledger`, {
    params: typeof chapterOrder === "number" ? { chapterOrder } : undefined,
  });
  return data;
}

export async function getChapterStateSnapshot(id: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<StoryStateSnapshot | null>>(`/novels/${id}/chapters/${chapterId}/state-snapshot`);
  return data;
}

export async function rebuildNovelState(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StoryStateSnapshot[]>>(`/novels/${id}/state/rebuild`, payload ?? {});
  return data;
}

export async function generateBookPlan(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StoryPlan>>(`/novels/${id}/plans/book/generate`, payload ?? {});
  return data;
}

export async function generateArcPlan(
  id: string,
  arcId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StoryPlan>>(`/novels/${id}/plans/arcs/${arcId}/generate`, payload ?? {});
  return data;
}

export async function generateChapterPlan(
  id: string,
  chapterId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StoryPlan>>(`/novels/${id}/chapters/${chapterId}/plan/generate`, payload ?? {});
  return data;
}

export async function getChapterPlan(id: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<StoryPlan | null>>(`/novels/${id}/chapters/${chapterId}/plan`);
  return data;
}

export async function replanNovel(
  id: string,
  payload: {
    reason: string;
    chapterId?: string;
    triggerType?: string;
    sourceIssueIds?: string[];
    windowSize?: number;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<ReplanResult>>(`/novels/${id}/replan`, payload);
  return data;
}

export async function auditNovelChapter(
  id: string,
  chapterId: string,
  scope: "continuity" | "character" | "plot" | "mode_fit" | "full",
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    content?: string;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      score: QualityScore;
      issues: ReviewIssue[];
      auditReports: AuditReport[];
      replanRecommendation?: ReplanRecommendation;
    }>
  >(`/novels/${id}/chapters/${chapterId}/audit/${scope}`, payload ?? {});
  return data;
}

export async function getChapterAuditReports(id: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<AuditReport[]>>(`/novels/${id}/chapters/${chapterId}/audit-reports`);
  return data;
}

export async function resolveAuditIssue(id: string, issueId: string) {
  const { data } = await apiClient.post<ApiResponse<AuditIssue[]>>(`/novels/${id}/audit-issues/${issueId}/resolve`, {});
  return data;
}

export async function getNovelQualityReport(id: string) {
  const { data } = await apiClient.get<
    ApiResponse<{
      novelId: string;
      summary: QualityScore;
      chapterReports: Array<{
        chapterId?: string | null;
        coherence: number;
        repetition: number;
        pacing: number;
        voice: number;
        engagement: number;
        overall: number;
        issues?: string | null;
      }>;
      totalReports?: number;
    }>
  >(`/novels/${id}/quality-report`);
  return data;
}

export async function generateChapterHook(
  id: string,
  payload?: {
    chapterId?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      chapterId: string;
      hook: string;
      nextExpectation: string;
    }>
  >(`/novels/${id}/hooks/generate`, payload ?? {});
  return data;
}

export async function optimizeNovelOutlinePreview(
  id: string,
  payload: {
    currentDraft: string;
    instruction: string;
    mode?: "full" | "selection";
    selectedText?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<DraftOptimizePreview>>(
    `/novels/${id}/outline/optimize-preview`,
    payload,
  );
  return data;
}

export async function optimizeNovelStructuredOutlinePreview(
  id: string,
  payload: {
    currentDraft: string;
    instruction: string;
    mode?: "full" | "selection";
    selectedText?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<DraftOptimizePreview>>(
    `/novels/${id}/structured-outline/optimize-preview`,
    payload,
  );
  return data;
}
