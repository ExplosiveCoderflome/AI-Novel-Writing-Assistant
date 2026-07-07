import type { PromptContextBlock } from "../core/promptTypes";

export type PromptSlotKind = "replace" | "append" | "choice" | "toggle" | "token";

interface SlotDefBase {
  key: string;
  label: string;
  description?: string;
  changelog?: string;
}

export interface PromptSlotDefReplace extends SlotDefBase {
  kind: "replace";
  default: string;
  maxLength: number;
  requiredTokens?: string[];
}

export interface PromptSlotDefAppend extends SlotDefBase {
  kind: "append";
  default: string;
  maxLength: number;
  anchor?: string;
  placeholderHint?: string;
}

export interface PromptSlotDefChoiceOption {
  value: string;
  label: string;
  copy: string;
}

export interface PromptSlotDefChoice extends SlotDefBase {
  kind: "choice";
  default: string;
  options: PromptSlotDefChoiceOption[];
}

export interface PromptSlotDefToggle extends SlotDefBase {
  kind: "toggle";
  default: boolean;
  copy: string;
}

export interface PromptSlotDefToken extends SlotDefBase {
  kind: "token";
  default: string;
  maxLength: number;
  patternHint?: string;
}

export type PromptSlotDef =
  | PromptSlotDefReplace
  | PromptSlotDefAppend
  | PromptSlotDefChoice
  | PromptSlotDefToggle
  | PromptSlotDefToken;

export type PromptSlotScope = "global" | "novel";

export type PromptSlotOverrideMode = "custom" | "official_default";

export interface PromptSlotOverrideEntry {
  value: string | boolean;
  baseHash: string;
  mode?: PromptSlotOverrideMode;
}

export type PromptSlotOverrideMap = Record<string, PromptSlotOverrideEntry>;

export interface ResolvedSlots {
  text(key: string): string;
  choiceCopy(key: string): string;
  enabled(key: string): boolean;
  token(key: string): string;
  append(key: string): string;
}

export interface ResolvedSlotOverlays {
  inlineSlots: ResolvedSlots;
  appendBlocks: PromptContextBlock[];
  drift: string[];
}
