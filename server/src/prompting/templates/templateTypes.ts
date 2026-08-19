import type { PromptSlotDef } from "../slots/slotTypes";

export const ADVANCED_TEMPLATE_PROMPT_ID = "novel.chapter.writer";
export const ADVANCED_TEMPLATE_SCOPE = "novel";
export const ADVANCED_TEMPLATE_MAX_CHARS = 60000;

export const WRITER_REQUIRED_CONTEXT_GROUPS = [
  "book_contract",
  "chapter_mission",
  "reader_experience",
  "character_hard_facts",
  "obligation_contract",
  "volume_window",
  "participant_subset",
  "local_state",
  "style_contract",
] as const;

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

export interface PromptTemplateSaveInput {
  promptId: string;
  novelId: string;
  template: PromptTemplateJson;
  notes?: string | null;
}

export interface PromptTemplateVersionActionInput {
  promptId: string;
  novelId: string;
  versionId: string;
}

export interface PromptTemplateRestoreInput {
  promptId: string;
  novelId: string;
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

export interface PromptTemplateSlotCatalogInput {
  slotDefs: PromptSlotDef[];
}
