import type {
  PromptCatalogItem,
  PromptPreviewResult,
  PromptSlotDef,
  PromptSlotOverrideEntry,
  PromptSlotOverrideScope,
} from "@/api/promptWorkbench";

export type PromptSlotValue = string | boolean;
export type PromptSlotDrafts = Record<string, PromptSlotValue>;
export type PromptWorkbenchScope = PromptSlotOverrideScope;

export interface PromptEditorDraftState {
  prompt: PromptCatalogItem | null;
  scope: PromptWorkbenchScope;
  novelId: string;
  drafts: PromptSlotDrafts;
  dirtySlotKeys: string[];
  isDirty: boolean;
}

export type PromptEditorSectionPlacement = "body" | "control" | "append";
export type PromptEditorSectionSource = "official" | "global" | "novel" | "novel_official_default";

export interface PromptEditorSection {
  id: string;
  slotKey: string;
  slot: PromptSlotDef;
  label: string;
  description?: string;
  kind: PromptSlotDef["kind"];
  placement: PromptEditorSectionPlacement;
  value: PromptSlotValue;
  defaultValue: PromptSlotValue;
  persistedValue: PromptSlotValue;
  draftValue?: PromptSlotValue;
  currentScopeOverride?: PromptSlotOverrideEntry;
  globalOverride?: PromptSlotOverrideEntry;
  novelOverride?: PromptSlotOverrideEntry;
  isDirty: boolean;
  isSavedOverride: boolean;
  isInheritedFromGlobal: boolean;
  isOfficialDefaultOverride: boolean;
  source: PromptEditorSectionSource;
  sourceLabel: string;
}

export type ContextBlockStatus = "selected" | "dropped" | "summarized" | "available";

export interface ContextBlockViewModel {
  id: string;
  group: string;
  groupLabel: string;
  priority: number;
  required: boolean;
  estimatedTokens: number;
  source?: string;
  content: string;
  status: ContextBlockStatus;
  locked: boolean;
  matchesSearch: boolean;
}

export type PromptPreviewContextBlock = PromptPreviewResult["context"]["blocks"][number];
