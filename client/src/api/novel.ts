import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { NOVEL_LIST_PAGE_LIMIT_DEFAULT, NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import type {
  AIFreedom,
  AuditIssue,
  AuditReport,
  Chapter,
  ChapterSummary,
  ChapterStatus,
  CharacterTimeline,
  Character,
  CreativeDecision,
  EmotionIntensity,
  NarrativePov,
  Novel,
  NovelBible,
  NovelSnapshot,
  PacePreference,
  PipelineJob,
  PipelineRepairMode,
  PipelineRunMode,
  PlotBeat,
  ProjectMode,
  ProjectProgressStatus,
  QualityScore,
  ReplanRecommendation,
  ReplanResult,
  ReviewIssue,
  StoryPlan,
  StoryStateSnapshot,
  StorylineDiff,
  StorylineVersion,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "./client";

export interface NovelListResponse {
  items: Array<
    Novel & {
      _count: {
        chapters: number;
        characters: number;
      };
      genre?: {
        id: string;
        name: string;
      } | null;
      world?: {
        id: string;
        name: string;
        worldType?: string | null;
      } | null;
    }
  >;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NovelDetailResponse extends Novel {
  chapters: Chapter[];
  characters: Character[];
  bible?: NovelBible | null;
  plotBeats?: PlotBeat[];
  genre?: {
    id: string;
    name: string;
  } | null;
  world?: {
    id: string;
    name: string;
    worldType?: string | null;
    description?: string | null;
    overviewSummary?: string | null;
    axioms?: string | null;
    magicSystem?: string | null;
    conflicts?: string | null;
  } | null;
}

export interface DraftOptimizePreview {
  optimizedDraft: string;
  mode: "full" | "selection";
  selectedText?: string | null;
}

function normalizeNovelListLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return NOVEL_LIST_PAGE_LIMIT_DEFAULT;
  }
  return Math.max(1, Math.min(NOVEL_LIST_PAGE_LIMIT_MAX, Math.floor(limit)));
}

function extractFileName(contentDisposition: string | undefined, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }
  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (!match?.[1]) {
    return fallback;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function getNovelList(params?: { page?: number; limit?: number }) {
  const { data } = await apiClient.get<ApiResponse<NovelListResponse>>("/novels", {
    params: {
      page: params?.page ?? 1,
      limit: normalizeNovelListLimit(params?.limit),
    },
  });
  return data;
}

export async function getNovelDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelDetailResponse>>(`/novels/${id}`);
  return data;
}

export async function createNovel(payload: {
  title: string;
  description?: string;
  genreId?: string;
  worldId?: string;
  writingMode?: "original" | "continuation";
  projectMode?: ProjectMode;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  defaultChapterLength?: number;
  estimatedChapterCount?: number;
  projectStatus?: ProjectProgressStatus;
  storylineStatus?: ProjectProgressStatus;
  outlineStatus?: ProjectProgressStatus;
  resourceReadyScore?: number;
  sourceNovelId?: string;
  sourceKnowledgeDocumentId?: string;
  continuationBookAnalysisId?: string;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[];
}) {
  const { data } = await apiClient.post<ApiResponse<Novel>>("/novels", payload);
  return data;
}

export async function updateNovel(
  id: string,
  payload: Partial<{
    title: string;
    description: string;
    status: "draft" | "published";
    writingMode: "original" | "continuation";
    projectMode: ProjectMode | null;
    narrativePov: NarrativePov | null;
    pacePreference: PacePreference | null;
    styleTone: string | null;
    emotionIntensity: EmotionIntensity | null;
    aiFreedom: AIFreedom | null;
    defaultChapterLength: number | null;
    estimatedChapterCount: number | null;
    projectStatus: ProjectProgressStatus | null;
    storylineStatus: ProjectProgressStatus | null;
    outlineStatus: ProjectProgressStatus | null;
    resourceReadyScore: number | null;
    sourceNovelId: string | null;
    sourceKnowledgeDocumentId: string | null;
    continuationBookAnalysisId: string | null;
    continuationBookAnalysisSections: BookAnalysisSectionKey[] | null;
    genreId: string | null;
    worldId: string | null;
    outline: string | null;
    structuredOutline: string | null;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Novel>>(`/novels/${id}`, payload);
  return data;
}

export async function deleteNovel(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}`);
  return data;
}

export async function getNovelChapters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Chapter[]>>(`/novels/${id}/chapters`);
  return data;
}

export async function createNovelChapter(
  id: string,
  payload: {
    title: string;
    order: number;
    content?: string;
    expectation?: string;
    chapterStatus?: ChapterStatus;
    targetWordCount?: number;
    conflictLevel?: number;
    revealLevel?: number;
    mustAvoid?: string;
    taskSheet?: string;
    sceneCards?: string;
    repairHistory?: string;
    qualityScore?: number;
    continuityScore?: number;
    characterScore?: number;
    pacingScore?: number;
    riskFlags?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(`/novels/${id}/chapters`, payload);
  return data;
}

export async function updateNovelChapter(
  id: string,
  chapterId: string,
  payload: Partial<{
    title: string;
    order: number;
    content: string;
    expectation: string;
    chapterStatus: ChapterStatus;
    targetWordCount: number;
    conflictLevel: number;
    revealLevel: number;
    mustAvoid: string;
    taskSheet: string;
    sceneCards: string;
    repairHistory: string;
    qualityScore: number;
    continuityScore: number;
    characterScore: number;
    pacingScore: number;
    riskFlags: string;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Chapter>>(`/novels/${id}/chapters/${chapterId}`, payload);
  return data;
}

export async function deleteNovelChapter(id: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/chapters/${chapterId}`);
  return data;
}

export async function getChapterTraces(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<import("@ai-novel/shared/types/agent").AgentRun[]>>(
    `/novels/${novelId}/chapters/${chapterId}/traces`,
  );
  return data;
}

export async function getNovelCharacters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Character[]>>(`/novels/${id}/characters`);
  return data;
}

export async function createNovelCharacter(
  id: string,
  payload: {
    name: string;
    role: string;
    personality?: string;
    background?: string;
    development?: string;
    currentState?: string;
    currentGoal?: string;
    baseCharacterId?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Character>>(`/novels/${id}/characters`, payload);
  return data;
}

export async function updateNovelCharacter(
  id: string,
  charId: string,
  payload: Partial<{
    name: string;
    role: string;
    personality: string;
    background: string;
    development: string;
    currentState: string;
    currentGoal: string;
    baseCharacterId: string;
  }>,
) {
  const { data } = await apiClient.put<ApiResponse<Character>>(`/novels/${id}/characters/${charId}`, payload);
  return data;
}

export async function deleteNovelCharacter(id: string, charId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/characters/${charId}`);
  return data;
}

export async function getCharacterTimeline(id: string, charId: string) {
  const { data } = await apiClient.get<ApiResponse<CharacterTimeline[]>>(`/novels/${id}/characters/${charId}/timeline`);
  return data;
}

export async function syncCharacterTimeline(
  id: string,
  charId: string,
  payload?: {
    startOrder?: number;
    endOrder?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      characterId: string;
      syncedCount: number;
      totalTimelineCount: number;
    }>
  >(`/novels/${id}/characters/${charId}/timeline/sync`, payload ?? {});
  return data;
}

export async function syncAllCharacterTimeline(
  id: string,
  payload?: {
    startOrder?: number;
    endOrder?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      characterCount: number;
      syncedCount: number;
      details: Array<{
        characterId: string;
        syncedCount: number;
        totalTimelineCount: number;
      }>;
    }>
  >(`/novels/${id}/characters/timeline/sync`, payload ?? {});
  return data;
}

export async function evolveNovelCharacter(
  id: string,
  charId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Character>>(
    `/novels/${id}/characters/${charId}/evolve`,
    payload ?? {},
  );
  return data;
}

export async function checkCharacterAgainstWorld(
  id: string,
  charId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      status: "pass" | "warn" | "error";
      warnings: string[];
      issues: Array<{ severity: "warn" | "error"; message: string; suggestion?: string }>;
    }>
  >(`/novels/${id}/world-check/characters/${charId}`, payload ?? {});
  return data;
}

export async function generateNovelTitles(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    count?: number;
    maxTokens?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      titles: TitleFactorySuggestion[];
    }>
  >(`/novels/${id}/title/generate`, payload ?? {});
  return data;
}

export async function runNovelPipeline(
  id: string,
  payload: {
    startOrder: number;
    endOrder: number;
    maxRetries?: number;
    runMode?: PipelineRunMode;
    autoReview?: boolean;
    autoRepair?: boolean;
    skipCompleted?: boolean;
    qualityThreshold?: number;
    repairMode?: PipelineRepairMode;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<PipelineJob>>(`/novels/${id}/pipeline/run`, payload);
  return data;
}

export async function listStorylineVersions(id: string) {
  const { data } = await apiClient.get<ApiResponse<StorylineVersion[]>>(`/novels/${id}/storyline/versions`);
  return data;
}

export async function createStorylineDraft(
  id: string,
  payload: {
    content: string;
    diffSummary?: string;
    baseVersion?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StorylineVersion>>(`/novels/${id}/storyline/versions/draft`, payload);
  return data;
}

export async function activateStorylineVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<StorylineVersion>>(
    `/novels/${id}/storyline/versions/${versionId}/activate`,
    {},
  );
  return data;
}

export async function freezeStorylineVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<StorylineVersion>>(
    `/novels/${id}/storyline/versions/${versionId}/freeze`,
    {},
  );
  return data;
}

export async function getStorylineDiff(id: string, versionId: string, compareVersion?: number) {
  const { data } = await apiClient.get<ApiResponse<StorylineDiff>>(
    `/novels/${id}/storyline/versions/${versionId}/diff`,
    {
      params: { compareVersion },
    },
  );
  return data;
}

export async function analyzeStorylineImpact(
  id: string,
  payload: {
    content?: string;
    versionId?: string;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      novelId: string;
      sourceVersion: number | null;
      affectedCharacters: number;
      affectedChapters: number;
      changedLines: number;
      requiresOutlineRebuild: boolean;
      recommendations: {
        shouldSyncOutline: boolean;
        shouldRecheckCharacters: boolean;
        suggestedStrategy: "rebuild_outline" | "incremental_sync";
      };
    }>
  >(`/novels/${id}/storyline/impact-analysis`, payload);
  return data;
}

export async function getNovelPipelineJob(id: string, jobId: string) {
  const { data } = await apiClient.get<ApiResponse<PipelineJob>>(`/novels/${id}/pipeline/jobs/${jobId}`);
  return data;
}

export async function listNovelSnapshots(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelSnapshot[]>>(`/novels/${id}/snapshots`);
  return data;
}

export async function createNovelSnapshot(
  id: string,
  payload: { triggerType: "manual" | "auto_milestone" | "before_pipeline"; label?: string },
) {
  const { data } = await apiClient.post<ApiResponse<NovelSnapshot>>(`/novels/${id}/snapshots`, payload);
  return data;
}

export async function restoreNovelSnapshot(id: string, snapshotId: string) {
  const { data } = await apiClient.post<ApiResponse<Novel>>(`/novels/${id}/snapshots/restore`, { snapshotId });
  return data;
}

export async function listCreativeDecisions(id: string) {
  const { data } = await apiClient.get<ApiResponse<CreativeDecision[]>>(`/novels/${id}/creative-decisions`);
  return data;
}

export async function createCreativeDecision(
  id: string,
  payload: Omit<CreativeDecision, "id" | "novelId" | "createdAt" | "updatedAt">,
) {
  const { data } = await apiClient.post<ApiResponse<CreativeDecision>>(`/novels/${id}/creative-decisions`, payload);
  return data;
}

export async function updateCreativeDecision(
  id: string,
  decisionId: string,
  payload: Partial<Omit<CreativeDecision, "id" | "novelId" | "createdAt" | "updatedAt">>,
) {
  const { data } = await apiClient.put<ApiResponse<CreativeDecision>>(
    `/novels/${id}/creative-decisions/${decisionId}`,
    payload,
  );
  return data;
}

export async function deleteCreativeDecision(id: string, decisionId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/creative-decisions/${decisionId}`);
  return data;
}

export async function batchInvalidateCreativeDecisions(id: string, decisionIds: string[]) {
  const { data } = await apiClient.post<ApiResponse<{ count: number; expiresAt: number }>>(
    `/novels/${id}/creative-decisions/batch-invalidate`,
    { decisionIds },
  );
  return data;
}

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
  scope: "continuity" | "character" | "plot" | "full",
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

export async function listNovelChapterSummaries(id: string) {
  const detail = await getNovelDetail(id);
  const chapters = detail.data?.chapters ?? [];
  const summaries: ChapterSummary[] = chapters
    .map((chapter) => (chapter as Chapter & { chapterSummary?: ChapterSummary | null }).chapterSummary)
    .filter((item): item is ChapterSummary => Boolean(item));
  return summaries;
}

export async function downloadNovelExport(id: string, format: "txt" | "markdown" = "txt") {
  const response = await apiClient.get<Blob>(`/novels/${id}/export`, {
    params: { format },
    responseType: "blob",
  });
  const fallback = format === "markdown" ? `novel-${id}.md` : `novel-${id}.txt`;
  return {
    blob: response.data,
    fileName: extractFileName(response.headers["content-disposition"], fallback),
  };
}

