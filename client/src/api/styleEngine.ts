import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  AntiAiRule,
  StyleBinding,
  StyleDetectionReport,
  StyleProfile,
  StyleRecommendationResult,
  StyleTemplate,
} from "@ai-novel/shared/types/styleEngine";
import type { CompiledStylePromptBlocks } from "@ai-novel/shared/types/styleEngine";
import { apiClient } from "./client";

export async function getStyleProfiles() {
  const { data } = await apiClient.get<ApiResponse<StyleProfile[]>>("/style-profiles");
  return data;
}

export async function getStyleProfile(id: string) {
  const { data } = await apiClient.get<ApiResponse<StyleProfile>>(`/style-profiles/${id}`);
  return data;
}

export async function createManualStyleProfile(payload: {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  applicableGenres?: string[];
  analysisMarkdown?: string;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
  antiAiRuleIds?: string[];
}) {
  const { data } = await apiClient.post<ApiResponse<StyleProfile>>("/style-profiles", payload);
  return data;
}

export async function updateStyleProfile(id: string, payload: Partial<{
  name: string;
  description: string;
  category: string;
  tags: string[];
  applicableGenres: string[];
  sourceRefId: string;
  sourceContent: string;
  analysisMarkdown: string;
  narrativeRules: Record<string, unknown>;
  characterRules: Record<string, unknown>;
  languageRules: Record<string, unknown>;
  rhythmRules: Record<string, unknown>;
  antiAiRuleIds: string[];
  status: string;
}>) {
  const { data } = await apiClient.put<ApiResponse<StyleProfile>>(`/style-profiles/${id}`, payload);
  return data;
}

export async function deleteStyleProfile(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/style-profiles/${id}`);
  return data;
}

export async function createStyleProfileFromText(payload: {
  name: string;
  sourceText: string;
  category?: string;
  provider?: string;
  model?: string;
  temperature?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<StyleProfile>>("/style-profiles/from-text", payload);
  return data;
}

export async function createStyleProfileFromBookAnalysis(payload: {
  bookAnalysisId: string;
  name: string;
  provider?: string;
  model?: string;
  temperature?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<StyleProfile>>("/style-profiles/from-book-analysis", payload);
  return data;
}

export async function createStyleProfileFromTemplate(payload: { templateId: string; name?: string }) {
  const { data } = await apiClient.post<ApiResponse<StyleProfile>>("/style-profiles/from-template", payload);
  return data;
}

export async function testWriteWithStyleProfile(
  id: string,
  payload: {
    mode: "generate" | "rewrite";
    topic?: string;
    sourceText?: string;
    targetLength?: number;
    provider?: string;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{ output: string; compiledBlocks: CompiledStylePromptBlocks }>>(
    `/style-profiles/${id}/test-write`,
    payload,
  );
  return data;
}

export async function getStyleTemplates() {
  const { data } = await apiClient.get<ApiResponse<StyleTemplate[]>>("/style-templates");
  return data;
}

export async function getAntiAiRules() {
  const { data } = await apiClient.get<ApiResponse<AntiAiRule[]>>("/anti-ai-rules");
  return data;
}

export async function updateAntiAiRule(id: string, payload: Partial<{
  key: string;
  name: string;
  type: AntiAiRule["type"];
  severity: AntiAiRule["severity"];
  description: string;
  detectPatterns: string[];
  rewriteSuggestion: string;
  promptInstruction: string;
  autoRewrite: boolean;
  enabled: boolean;
}>) {
  const { data } = await apiClient.put<ApiResponse<AntiAiRule>>(`/anti-ai-rules/${id}`, payload);
  return data;
}

export async function getStyleBindings(params?: {
  targetType?: StyleBinding["targetType"];
  targetId?: string;
  styleProfileId?: string;
}) {
  const { data } = await apiClient.get<ApiResponse<StyleBinding[]>>("/style-bindings", { params });
  return data;
}

export async function createStyleBinding(payload: {
  styleProfileId: string;
  targetType: StyleBinding["targetType"];
  targetId: string;
  priority?: number;
  weight?: number;
  enabled?: boolean;
}) {
  const { data } = await apiClient.post<ApiResponse<StyleBinding>>("/style-bindings", payload);
  return data;
}

export async function deleteStyleBinding(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/style-bindings/${id}`);
  return data;
}

export async function recommendStyleProfilesForNovel(
  novelId: string,
  payload?: {
    provider?: string;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StyleRecommendationResult>>(
    `/style-recommendations/novels/${novelId}`,
    payload ?? {},
  );
  return data;
}

export async function detectStyleIssues(payload: {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  provider?: string;
  model?: string;
  temperature?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<StyleDetectionReport>>("/style-detection/check", payload);
  return data;
}

export async function rewriteStyleIssues(payload: {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  issues: Array<{
    ruleName: string;
    excerpt: string;
    suggestion: string;
  }>;
  provider?: string;
  model?: string;
  temperature?: number;
}) {
  const { data } = await apiClient.post<ApiResponse<{ content: string }>>("/style-detection/rewrite", payload);
  return data;
}
