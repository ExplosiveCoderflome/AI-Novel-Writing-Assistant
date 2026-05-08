import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "@/api/client";

export interface PromptContextRequirement {
  group: string;
  required?: boolean;
  priority: number;
  maxTokens?: number;
  freshness?: "snapshot" | "fresh" | "hybrid";
  sourceHint?: string;
}

export interface PromptEditableSlot {
  key: string;
  label: string;
  description?: string;
  defaultValue?: string;
}

export interface PromptCatalogItem {
  key: string;
  id: string;
  version: string;
  taskType: string;
  mode: string;
  language: string;
  family: string;
  description: string;
  outputType: "structured" | "text";
  contextPolicy: {
    maxTokensBudget: number;
    requiredGroups?: string[];
    preferredGroups?: string[];
    dropOrder?: string[];
  };
  contextRequirements: PromptContextRequirement[];
  editableSlots: PromptEditableSlot[];
  overrideSupported: false;
  addendumSupported: boolean;
  addendumScopeLabels: string[];
  overrideLifecycle: {
    draftSupported: false;
    publishSupported: false;
    runtimeOverrideEnabled: false;
  };
  lockedFields: string[];
  managementStatus: "complete" | "missing_context_requirements" | "missing_editable_slots";
  capabilities: {
    hasOutputSchema: boolean;
    hasPostValidate: boolean;
    hasSemanticRetryPolicy: boolean;
    hasRepairPolicy: boolean;
    hasStructuredOutputHint: boolean;
  };
}

export interface PromptPreviewMessage {
  role: string;
  content: string;
}

export interface PromptPreviewResult {
  prompt: PromptCatalogItem;
  messages: PromptPreviewMessage[];
  context: {
    blocks: Array<{
      id: string;
      group: string;
      priority: number;
      required?: boolean;
      estimatedTokens?: number;
      source?: string;
      content: string;
    }>;
    selectedBlockIds: string[];
    droppedBlockIds: string[];
    summarizedBlockIds: string[];
    estimatedInputTokens: number;
  };
  brokerResolution: {
    selectedBlockIds: string[];
    droppedBlockIds: string[];
    summarizedBlockIds: string[];
    missingRequiredGroups: string[];
    resolverErrors: Array<{ group: string; message: string }>;
  };
  diagnostics: {
    entrypoint: string;
    missingRequiredGroups: string[];
    resolverErrors: Array<{ group: string; message: string }>;
    tracePreview: {
      promptId: string;
      promptVersion: string;
      taskType: string;
      contextBlockIds: string[];
      droppedContextBlockIds: string[];
      summarizedContextBlockIds: string[];
      customAddendumBlockIds: string[];
      estimatedInputTokens: number;
      repairUsed: boolean;
      repairAttempts: number;
      semanticRetryUsed: boolean;
      semanticRetryAttempts: number;
      entrypoint?: string;
      novelId?: string;
      chapterId?: string;
      taskId?: string;
    };
    notes: string[];
  };
}

export type NovelMaterialImportance = "must" | "high" | "medium" | "low";

export interface NovelMaterialBlock {
  id: string;
  group: string;
  title: string;
  content: string;
  required: boolean;
  importance: NovelMaterialImportance;
  source: {
    type: "novel" | "chapter" | "plan" | "state" | "character" | "world" | "style" | "audit" | "task";
    id?: string;
    updatedAt?: string;
  };
  estimatedTokens: number;
}

export interface NovelMaterialExportPayload {
  novelId: string;
  chapterId?: string;
  taskId?: string;
  volumeId?: string;
  groups?: string[];
  maxTokens?: number;
}

export interface NovelMaterialExportResult {
  blocks: NovelMaterialBlock[];
  missingGroups: string[];
  missingInputs: string[];
  warnings: string[];
  generatedAt: string;
}

export interface PromptCatalogParams {
  keyword?: string;
  taskType?: string;
  mode?: "structured" | "text";
}

export type PromptAddendumScope = "global" | "novel";

export interface PromptAddendum {
  id: string;
  scope: PromptAddendumScope;
  novelId?: string | null;
  promptId: string;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptAddendumPayload {
  id?: string;
  scope: PromptAddendumScope;
  novelId?: string | null;
  promptId: string;
  title: string;
  content: string;
  enabled?: boolean;
}

export interface PromptPreviewPayload {
  promptKey: string;
  promptInput?: unknown;
  executionContext: {
    entrypoint: string;
    novelId?: string;
    chapterId?: string;
    userGoal?: string;
    resourceBindings?: Record<string, unknown>;
    recentMessages?: Array<{ role: string; content: string }>;
    metadata?: Record<string, unknown>;
  };
  maxContextTokens?: number;
  contextMode?: "snapshot" | "fresh" | "hybrid";
}

export async function getPromptCatalog(params: PromptCatalogParams = {}) {
  const { data } = await apiClient.get<ApiResponse<PromptCatalogItem[]>>("/prompt-workbench/catalog", {
    params,
  });
  return data;
}

export async function previewPrompt(payload: PromptPreviewPayload) {
  const { data } = await apiClient.post<ApiResponse<PromptPreviewResult>>("/prompt-workbench/preview", payload);
  return data;
}

export async function exportNovelPromptMaterials(payload: NovelMaterialExportPayload) {
  const { data } = await apiClient.post<ApiResponse<NovelMaterialExportResult>>(
    "/prompt-workbench/materials/export",
    payload,
  );
  return data;
}

export async function getPromptAddendums(params: { promptId?: string; novelId?: string } = {}) {
  const { data } = await apiClient.get<ApiResponse<PromptAddendum[]>>("/prompt-workbench/addendums", {
    params,
  });
  return data;
}

export async function savePromptAddendum(payload: PromptAddendumPayload) {
  const { data } = await apiClient.put<ApiResponse<PromptAddendum>>("/prompt-workbench/addendums", payload);
  return data;
}

export async function setPromptAddendumEnabled(id: string, enabled: boolean) {
  const { data } = await apiClient.patch<ApiResponse<PromptAddendum>>(
    `/prompt-workbench/addendums/${id}/enabled`,
    { enabled },
  );
  return data;
}

export async function deletePromptAddendum(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/prompt-workbench/addendums/${id}`);
  return data;
}
