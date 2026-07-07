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

// ─── Slot type definitions (mirrors server slotTypes.ts) ──────────────────────

export type PromptSlotKind = "replace" | "append" | "choice" | "toggle" | "token";

export interface PromptSlotDefBase {
  key: string;
  label: string;
  description?: string;
  anchor?: string;
  changelog?: string;
}

export interface PromptSlotDefReplace extends PromptSlotDefBase {
  kind: "replace";
  default: string;
  maxLength?: number;
  requiredTokens?: string[];
}

export interface PromptSlotDefAppend extends PromptSlotDefBase {
  kind: "append";
  default: string;
  maxLength?: number;
  placeholderHint?: string;
}

export interface PromptSlotChoiceOption {
  value: string;
  label: string;
  copy: string;
}

export interface PromptSlotDefChoice extends PromptSlotDefBase {
  kind: "choice";
  default: string;
  options: PromptSlotChoiceOption[];
}

export interface PromptSlotDefToggle extends PromptSlotDefBase {
  kind: "toggle";
  default: boolean;
  copy: string;
}

export interface PromptSlotDefToken extends PromptSlotDefBase {
  kind: "token";
  default: string;
  patternHint?: string;
  maxLength?: number;
}

export type PromptSlotDef =
  | PromptSlotDefReplace
  | PromptSlotDefAppend
  | PromptSlotDefChoice
  | PromptSlotDefToggle
  | PromptSlotDefToken;

// ─── Catalog ─────────────────────────────────────────────────────────────────

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
  slots: PromptSlotDef[];
  slotSupported: boolean;
  lockedFields: string[];
  managementStatus: "complete" | "missing_context_requirements" | "missing_slots";
  capabilities: {
    hasOutputSchema: boolean;
    hasPostValidate: boolean;
    hasSemanticRetryPolicy: boolean;
    hasRepairPolicy: boolean;
    hasStructuredOutputHint: boolean;
  };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

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
    template?: {
      mode: "official" | "draft" | "custom";
      activeVersionNo?: number;
      diagnostics: PromptTemplateDiagnostics;
    };
  };
}

// ─── Advanced templates ─────────────────────────────────────────────────────

export type PromptTemplateOverrideMode = "official" | "custom";
export type PromptTemplateMessageRole = "system" | "human";

export interface PromptTemplateMessage {
  role: PromptTemplateMessageRole;
  content: string;
}

export interface PromptTemplateJson {
  kind: "chat";
  messages: PromptTemplateMessage[];
}

export interface PromptTemplateContextRefs {
  context: string[];
  input: string[];
  slot: string[];
}

export interface PromptTemplateDiagnostics {
  referencedContextGroups: string[];
  referencedInputFields: string[];
  referencedSlotKeys: string[];
  fallbackRequiredGroups: string[];
  missingRequiredGroups: string[];
  missingReferencedContextGroups: string[];
  missingInputFields: string[];
  unknownTokens: string[];
  invalidMessages: string[];
}

export interface PromptTemplateVersionView {
  id: string;
  versionNo: number;
  template: PromptTemplateJson;
  contextRefs: PromptTemplateContextRefs;
  compiledHash: string;
  notes?: string | null;
  createdAt: string;
}

export interface PromptTemplateOverrideView {
  promptId: string;
  novelId: string;
  scope: "novel";
  basePromptVersion: string;
  mode: PromptTemplateOverrideMode;
  activeVersionId?: string | null;
  activeVersion?: PromptTemplateVersionView | null;
  versions: PromptTemplateVersionView[];
  officialTemplate: PromptTemplateJson;
  officialContextRefs: PromptTemplateContextRefs;
  officialCompiledHash: string;
}

export interface PromptTemplateReferenceItem {
  token: string;
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  hasPreviewBlock?: boolean;
  group: "required_context" | "optional_context" | "input" | "slot";
}

export interface PromptTemplateReferenceCatalog {
  promptId: string;
  novelId?: string;
  chapterId?: string;
  items: PromptTemplateReferenceItem[];
  missingRequiredGroups: string[];
}

// ─── Slot overrides ───────────────────────────────────────────────────────────

export type PromptSlotOverrideScope = "global" | "novel";
export type PromptSlotOverrideMode = "custom" | "official_default";

export interface PromptSlotOverrideEntry {
  value: string | boolean;
  baseHash: string;
  mode?: PromptSlotOverrideMode;
}

export interface PromptSlotOverrideView {
  scope: PromptSlotOverrideScope;
  novelId?: string | null;
  promptId: string;
  baseVersion: string;
  slots: Record<string, PromptSlotOverrideEntry>;
  updatedAt: string;
}

export interface PromptSlotOverrideParams {
  promptId: string;
  novelId?: string;
}

export interface PromptSlotOverrideSavePayload {
  scope: PromptSlotOverrideScope;
  novelId?: string | null;
  promptId: string;
  slotUpdates: Record<string, unknown>;
}

export interface PromptSlotOverrideDeletePayload {
  scope: PromptSlotOverrideScope;
  novelId?: string | null;
  promptId: string;
  slotKeys?: string[];
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

export type PromptSlotReconcileState = "unchanged" | "drifted" | "new" | "orphaned";

export interface PromptSlotReconcileItem {
  key: string;
  label: string;
  kind: PromptSlotKind;
  state: PromptSlotReconcileState;
  defaultCurrent: string | boolean;
  defaultCurrentHash: string;
  overrideValue?: string | boolean;
  overrideBaseHash?: string;
  overrideMode?: PromptSlotOverrideMode;
  changelog?: string;
}

export interface PromptSlotReconcileResult {
  promptId: string;
  scope: PromptSlotOverrideScope;
  novelId?: string | null;
  promptVersion?: string;
  overrideBaseVersion?: string;
  items: PromptSlotReconcileItem[];
  hasUpdates?: boolean;
  hasDrift?: boolean;
  driftedCount: number;
  newCount: number;
  orphanedCount: number;
}

export interface PromptSlotReconcileParams {
  promptId: string;
  scope: PromptSlotOverrideScope;
  novelId?: string;
}

export interface PromptSlotAdoptKeepPayload {
  promptId: string;
  scope: PromptSlotOverrideScope;
  novelId?: string | null;
  slotKeys: string[];
}

export interface OfficialPromptSlotProfile {
  id: "current";
  label: string;
  description: string;
}

export interface OfficialPromptSlotItem {
  key: string;
  label: string;
  kind: PromptSlotKind;
  defaultValue: string | boolean;
  defaultHash: string;
  changelog?: string;
}

export interface OfficialPromptSlotLibrary {
  promptId: string;
  promptVersion: string;
  slots: OfficialPromptSlotItem[];
  officialProfiles: OfficialPromptSlotProfile[];
}

// ─── Materials ────────────────────────────────────────────────────────────────

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

// ─── Params ───────────────────────────────────────────────────────────────────

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
  slotOverrides?: Record<string, unknown>;
  templateDraft?: PromptTemplateJson;
}

// ─── API functions ─────────────────────────────────────────────────────────────

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

// Slot override CRUD

export async function getSlotOverrides(params: PromptSlotOverrideParams) {
  const { data } = await apiClient.get<ApiResponse<PromptSlotOverrideView[]>>(
    "/prompt-workbench/slot-overrides",
    { params },
  );
  return data;
}

export async function getOfficialPromptSlots(params: { promptId: string }) {
  const { data } = await apiClient.get<ApiResponse<OfficialPromptSlotLibrary>>(
    "/prompt-workbench/official-slots",
    { params },
  );
  return data;
}

export async function saveSlotOverride(payload: PromptSlotOverrideSavePayload) {
  const { data } = await apiClient.put<ApiResponse<PromptSlotOverrideView>>(
    "/prompt-workbench/slot-overrides",
    payload,
  );
  return data;
}

export async function deleteSlotOverride(payload: PromptSlotOverrideDeletePayload) {
  const { data } = await apiClient.delete<ApiResponse<null>>("/prompt-workbench/slot-overrides", {
    data: payload,
  });
  return data;
}

// Slot reconciliation

export async function getSlotReconcile(params: PromptSlotReconcileParams) {
  const { data } = await apiClient.get<ApiResponse<PromptSlotReconcileResult>>(
    "/prompt-workbench/slot-overrides/reconcile",
    { params },
  );
  return data;
}

export async function adoptSlots(payload: PromptSlotAdoptKeepPayload) {
  const { data } = await apiClient.post<ApiResponse<null>>(
    "/prompt-workbench/slot-overrides/adopt",
    payload,
  );
  return data;
}

export async function applyOfficialSlots(payload: PromptSlotAdoptKeepPayload) {
  const { data } = await apiClient.post<ApiResponse<null>>(
    "/prompt-workbench/slot-overrides/apply-official",
    payload,
  );
  return data;
}

export async function keepMySlots(payload: PromptSlotAdoptKeepPayload) {
  const { data } = await apiClient.post<ApiResponse<null>>(
    "/prompt-workbench/slot-overrides/keep",
    payload,
  );
  return data;
}

export async function getPromptTemplateOverride(params: { promptId: string; novelId: string }) {
  const { data } = await apiClient.get<ApiResponse<PromptTemplateOverrideView>>(
    "/prompt-workbench/template-overrides",
    { params },
  );
  return data;
}

export async function savePromptTemplateOverride(payload: {
  promptId: string;
  novelId: string;
  template: PromptTemplateJson;
  notes?: string | null;
}) {
  const { data } = await apiClient.put<ApiResponse<PromptTemplateOverrideView>>(
    "/prompt-workbench/template-overrides",
    payload,
  );
  return data;
}

export async function activatePromptTemplateVersion(payload: {
  promptId: string;
  novelId: string;
  versionId: string;
}) {
  const { data } = await apiClient.post<ApiResponse<PromptTemplateOverrideView>>(
    "/prompt-workbench/template-overrides/activate-version",
    payload,
  );
  return data;
}

export async function restoreOfficialPromptTemplate(payload: {
  promptId: string;
  novelId: string;
}) {
  const { data } = await apiClient.post<ApiResponse<PromptTemplateOverrideView>>(
    "/prompt-workbench/template-overrides/restore-official",
    payload,
  );
  return data;
}

export async function getPromptContextReferences(params: {
  promptId: string;
  novelId?: string;
  chapterId?: string;
  entrypoint?: string;
}) {
  const { data } = await apiClient.get<ApiResponse<PromptTemplateReferenceCatalog>>(
    "/prompt-workbench/context-references",
    { params },
  );
  return data;
}
