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

export interface PromptCatalogParams {
  keyword?: string;
  taskType?: string;
  mode?: "structured" | "text";
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
